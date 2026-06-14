/**
 * OCR client — browser edition.
 *
 * OCR now runs entirely in the browser (tesseract.js + pdf.js, see
 * `@/lib/ocr-engine`). The extract → review → commit flow is unchanged from the
 * UI's perspective: `extract` returns parsed fields (nothing saved), the
 * reviewer corrects them, and `commit` uploads the original to Supabase Storage
 * and persists the invoice via the `app_commit_ocr_invoice` RPC (which bridges
 * it into the approval workflow at PENDING_MATCH).
 */
import { supabase } from './supabase';
import { ociObjectUrl, uploadDocument } from './object-storage';
import { runOcr, parseInvoiceFields } from './ocr-engine';
import { getPendingExtract } from './ocr-extract-store';
import type {
  CommitPayload,
  OcrExtractResult,
  OcrInvoice,
  OcrListParams,
  OcrStats,
  Paginated,
} from '@/types/ocr';

export class OcrApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'OcrApiError';
    this.statusCode = statusCode;
  }
}

export function isOcrAuthError(err: unknown): boolean {
  if (err instanceof OcrApiError) return err.statusCode === 401 || err.statusCode === 403;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return msg.includes('not authenticated') || msg.includes('jwt') || msg.includes('permission');
}

export function extractOcrError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof OcrApiError) return err.message;
  const e = err as { message?: string; details?: string } | undefined;
  return e?.message || e?.details || fallback;
}

export interface OcrUploadResult {
  id?: string;
  invoiceId?: string;
  status?: string;
  fileName?: string;
  message?: string;
  [key: string]: unknown;
}

export interface OcrFileResult {
  blob: Blob;
  contentType: string;
  fileName: string | null;
}

const REVIEW_THRESHOLD = 80;

function buildExtractResult(
  text: string,
  confidence: number,
  fileMeta: { name: string; type: string; size: number },
): OcrExtractResult {
  const parsed = parseInvoiceFields(text);
  const score = Math.max(0, Math.min(100, Math.round(confidence)));
  const requiresReview = score < REVIEW_THRESHOLD;
  return {
    stagingId: crypto.randomUUID(),
    status: 'PENDING_REVIEW',
    confidenceScore: score,
    documentType: parsed.documentType,
    language: parsed.language,
    cfdiDetected: parsed.cfdiDetected,
    requiresReview,
    reviewReason: requiresReview
      ? `OCR confidence ${score}% — please verify all fields before saving.`
      : null,
    rawOcrText: text,
    fileName: fileMeta.name,
    mimeType: fileMeta.type,
    fileSize: fileMeta.size,
    file: { originalFilename: fileMeta.name, mimeType: fileMeta.type, fileSize: fileMeta.size },
    fields: {
      invoiceNumber: parsed.invoiceNumber,
      supplier: parsed.supplier,
      supplierName: parsed.supplier,
      poNumber: parsed.poNumber,
      currency: parsed.currency,
      totalAmount: parsed.totalAmount,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      invoiceDate: parsed.invoiceDate,
      lineItems: parsed.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
      })),
    },
  };
}

function commitParams(
  payload: CommitPayload,
  extras: { filePath?: string | null; fileMeta?: { name: string; type: string; size: number } | null; rawOcrText?: string | null },
) {
  return {
    invoiceNumber: payload.invoiceNumber ?? null,
    supplierName: payload.supplierName ?? null,
    poNumber: payload.poNumber ?? null,
    currency: payload.currency ?? null,
    subtotal: payload.subtotal ?? null,
    taxAmount: payload.taxAmount ?? null,
    totalAmount: payload.totalAmount ?? null,
    confidenceScore: payload.confidenceScore ?? null,
    documentType: payload.documentType ?? 'INVOICE',
    language: payload.language ?? null,
    cfdiDetected: payload.cfdiDetected ?? false,
    filePath: extras.filePath ?? null,
    originalFilename: extras.fileMeta?.name ?? null,
    mimeType: extras.fileMeta?.type ?? null,
    fileSize: extras.fileMeta?.size ?? null,
    rawOcrText: extras.rawOcrText ?? null,
    lineItems: (payload.lineItems ?? []).map((li) => ({
      description: li.description ?? null,
      quantity: li.quantity ?? null,
      unitPrice: li.unitPrice ?? null,
      lineTotal: li.lineTotal ?? null,
    })),
  };
}

async function rpcCommit(p: ReturnType<typeof commitParams>): Promise<OcrInvoice> {
  const { data, error } = await supabase.rpc('app_commit_ocr_invoice', { p });
  if (error) throw new OcrApiError(error.message, 400);
  return data as OcrInvoice;
}

async function paginate(params: OcrListParams): Promise<Paginated<OcrInvoice>> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 25;
  const from = (page - 1) * limit;
  let q = supabase.from('invoices').select('*', { count: 'exact' });
  if (params.status) q = q.eq('status', params.status);
  if (params.documentType) q = q.eq('document_type', params.documentType);
  if (params.supplier) q = q.ilike('supplier_name', `%${params.supplier}%`);
  if (params.dateFrom) q = q.gte('created_at', params.dateFrom);
  if (params.dateTo) q = q.lte('created_at', params.dateTo);
  if (typeof params.confidenceMin === 'number') q = q.gte('confidence_score', params.confidenceMin);
  if (typeof params.confidenceMax === 'number') q = q.lte('confidence_score', params.confidenceMax);
  const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (error) throw new OcrApiError(error.message);
  const total = count ?? data?.length ?? 0;
  return {
    items: (data ?? []) as OcrInvoice[],
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
  };
}

export const ocrApi = {
  extract: async (file: File): Promise<OcrExtractResult> => {
    const { text, confidence } = await runOcr(file);
    return buildExtractResult(text, confidence, { name: file.name, type: file.type, size: file.size });
  },

  extractOci: async (objectName: string): Promise<OcrExtractResult> => {
    const res = await fetch(ociObjectUrl(objectName));
    if (!res.ok) throw new OcrApiError(`Could not fetch ${objectName} (HTTP ${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], objectName.split('/').pop() ?? objectName, { type: blob.type });
    const { text, confidence } = await runOcr(file);
    return buildExtractResult(text, confidence, { name: file.name, type: file.type, size: file.size });
  },

  commit: async (payload: CommitPayload): Promise<OcrInvoice> => {
    const pending = getPendingExtract();
    let filePath: string | null = null;
    let fileMeta: { name: string; type: string; size: number } | null = null;
    let rawOcrText: string | null = null;

    if (pending && pending.result.stagingId === payload.stagingId && pending.file) {
      const up = await uploadDocument(pending.file);
      filePath = up.path;
      fileMeta = { name: pending.file.name, type: pending.file.type, size: pending.file.size };
      rawOcrText = (pending.result.rawOcrText as string) ?? null;
    }

    return rpcCommit(commitParams(payload, { filePath, fileMeta, rawOcrText }));
  },

  upload: async (file: File): Promise<OcrUploadResult> => {
    const { text, confidence } = await runOcr(file);
    const parsed = parseInvoiceFields(text);
    const up = await uploadDocument(file);
    const score = Math.max(0, Math.min(100, Math.round(confidence)));
    const saved = await rpcCommit(
      commitParams(
        {
          stagingId: '',
          invoiceNumber: parsed.invoiceNumber,
          supplierName: parsed.supplier,
          poNumber: parsed.poNumber,
          currency: parsed.currency,
          subtotal: parsed.subtotal,
          taxAmount: parsed.taxAmount,
          totalAmount: parsed.totalAmount,
          confidenceScore: score,
          documentType: parsed.documentType,
          language: parsed.language,
          cfdiDetected: parsed.cfdiDetected,
          lineItems: parsed.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            lineTotal: li.amount,
          })),
        },
        { filePath: up.path, fileMeta: { name: file.name, type: file.type, size: file.size }, rawOcrText: text },
      ),
    );
    const row = saved as Record<string, unknown>;
    return { id: String(row.id), status: String(row.status), fileName: file.name };
  },

  stats: async (): Promise<OcrStats> => {
    const { data, error } = await supabase
      .from('invoices')
      .select('status, requires_review, confidence_score')
      .limit(2000);
    if (error) throw new OcrApiError(error.message);
    const rows = (data ?? []) as Array<{ status: string; requires_review: boolean; confidence_score: number }>;
    const byStatus: Record<string, number> = {};
    let confSum = 0;
    let confN = 0;
    let pendingReview = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.requires_review || r.status === 'PENDING_REVIEW') pendingReview += 1;
      if (typeof r.confidence_score === 'number' && r.confidence_score > 0) {
        confSum += Number(r.confidence_score);
        confN += 1;
      }
    }
    return {
      total: rows.length,
      pendingReview,
      averageConfidence: confN ? Math.round(confSum / confN) : 0,
      byStatus,
    };
  },

  reviewQueue: async (params: OcrListParams = {}): Promise<Paginated<OcrInvoice>> => {
    const page = params.page ?? 1;
    const limit = params.limit ?? 25;
    const from = (page - 1) * limit;
    const { data, count, error } = await supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('requires_review', true)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw new OcrApiError(error.message);
    const total = count ?? data?.length ?? 0;
    return {
      items: (data ?? []) as OcrInvoice[],
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
    };
  },

  list: async (params: OcrListParams = {}): Promise<Paginated<OcrInvoice>> => {
    return paginate(params);
  },

  get: async (id: string): Promise<OcrInvoice> => {
    const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
    if (error) throw new OcrApiError(error.message, error.code === 'PGRST116' ? 404 : 400);
    return data as OcrInvoice;
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  retry: async (_id?: string): Promise<OcrUploadResult> => {
    // No server-side OCR queue any more; re-running OCR happens client-side via
    // a fresh upload. Surface a friendly no-op so existing buttons still work.
    return { message: 'Re-upload the document to re-run OCR in your browser.' };
  },

  downloadFile: async (id: string): Promise<OcrFileResult> => {
    const { data, error } = await supabase
      .from('invoices')
      .select('file_path, original_filename, mime_type')
      .eq('id', id)
      .single();
    if (error) throw new OcrApiError(error.message);
    const row = data as { file_path: string | null; original_filename: string | null; mime_type: string | null };
    if (!row.file_path) throw new OcrApiError('No source document stored for this invoice', 404);
    const res = await fetch(ociObjectUrl(row.file_path));
    if (!res.ok) throw new OcrApiError(`Could not download document (HTTP ${res.status})`);
    const blob = await res.blob();
    return {
      blob,
      contentType: row.mime_type || blob.type || 'application/octet-stream',
      fileName: row.original_filename,
    };
  },
};
