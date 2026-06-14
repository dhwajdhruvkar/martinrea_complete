/**
 * Transient hand-off for the synchronous extract → review → commit flow.
 *
 * `POST /invoices/extract` returns extracted fields plus we hold the original
 * File locally (for preview, since nothing is saved server-side yet). React
 * Router state can't reliably carry a File across a reload, so the upload modal
 * stashes the pending extract here and the review page (`/ocr/new`) reads it.
 *
 * This is intentionally in-memory and ephemeral: a hard reload clears it, and
 * the review page handles that by sending the user back to upload.
 */
import type { OcrExtractResult } from '@/types/ocr';

export interface PendingExtract {
  result: OcrExtractResult;
  file: File;
}

let pending: PendingExtract | null = null;

export function setPendingExtract(next: PendingExtract): void {
  pending = next;
}

export function getPendingExtract(): PendingExtract | null {
  return pending;
}

export function clearPendingExtract(): void {
  pending = null;
}
