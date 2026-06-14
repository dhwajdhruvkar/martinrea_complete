/**
 * Document storage — Supabase Storage edition.
 *
 * Replaces the old Oracle OCI (PAR-URL) integration. The `invoice-documents`
 * bucket is public-read, so object URLs can be used directly as <img>/<iframe>
 * src (no Bearer header needed). Writes require an authenticated session
 * (enforced by Storage RLS). The public surface is unchanged so callers
 * (MatchPage, OciFilePreview, useOci, DocumentViewer) keep working.
 */
import { supabase, DOCUMENTS_BUCKET } from './supabase';

/** A single object in the bucket (kept shape-compatible with the old OCI type). */
export interface OciObject {
  name: string;
  size?: number;
  timeCreated?: string;
  timeModified?: string;
}

/** Public, directly-usable URL for an object (safe as an <img>/<iframe> src). */
export function ociObjectUrl(name: string): string {
  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(name);
  return data.publicUrl;
}

/** Lists the documents currently in the bucket (newest first). */
export async function listBucketObjects(): Promise<OciObject[]> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).list('', {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw new Error(error.message || 'Could not list the storage bucket.');
  return (data ?? [])
    // Folder placeholders have a null id; keep only real files.
    .filter((o) => o.id !== null)
    .map((o) => ({
      name: o.name,
      size: (o.metadata?.size as number | undefined) ?? undefined,
      timeCreated: o.created_at ?? undefined,
      timeModified: o.updated_at ?? undefined,
    }));
}

/** Object key kept human-readable (original name preserved) yet unique. */
function objectKey(fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}-${safe}`;
}

/**
 * Upload a document to the bucket. Returns the stored object key and its public
 * URL. Used by the OCR commit flow to persist the original before saving the
 * invoice record.
 */
export async function uploadDocument(file: File): Promise<{ path: string; url: string }> {
  const path = objectKey(file.name);
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed.');
  return { path, url: ociObjectUrl(path) };
}

/** Back-compat helper (returns void) for any caller that just needs an upload. */
export async function uploadInvoiceFile(file: File): Promise<void> {
  await uploadDocument(file);
}
