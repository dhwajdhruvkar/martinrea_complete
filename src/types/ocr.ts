/**
 * Types for Aman's "AI Invoice OCR API".
 *
 * This is a SEPARATE backend from the AP-workflow service (`@/types/invoice`).
 * It handles the front of the pipeline — upload → OCR extraction → human
 * review — and has its own status enum, document types, and confidence scores.
 *
 * The OpenAPI spec documents endpoints, query params, and enums, but not the
 * exact response body shape, so the `OcrInvoice` interface keeps the
 * well-known fields strongly typed while tolerating any extra OCR-extracted
 * fields the service returns (see the index signature + `extracted` bag).
 * Read values through the accessors in `@/lib/ocr` rather than reaching for a
 * specific property name, so a backend field rename is a one-line fix.
 */

// ─── Enums (from the OpenAPI contract) ──────────────────────────────────────
export const OcrInvoiceStatus = {
  RECEIVED: 'RECEIVED',
  OCR_PROCESSING: 'OCR_PROCESSING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_MATCH: 'PENDING_MATCH',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  DUPLICATE_INVOICE: 'DUPLICATE_INVOICE',
} as const;
export type OcrInvoiceStatus =
  (typeof OcrInvoiceStatus)[keyof typeof OcrInvoiceStatus];

export const ALL_OCR_STATUSES = Object.values(OcrInvoiceStatus);

export const OcrDocumentType = {
  INVOICE: 'INVOICE',
  CFDI: 'CFDI',
  RECEIPT: 'RECEIPT',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
} as const;
export type OcrDocumentType =
  (typeof OcrDocumentType)[keyof typeof OcrDocumentType];

export const ALL_DOCUMENT_TYPES = Object.values(OcrDocumentType);

// ─── Line items (best-effort shape) ─────────────────────────────────────────
export interface OcrLineItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  [key: string]: unknown;
}

// ─── Invoice / document record ──────────────────────────────────────────────
export interface OcrInvoice {
  id: string;
  status: OcrInvoiceStatus | string;

  // Commonly present extraction metadata (all optional / tolerant)
  documentType?: OcrDocumentType | string | null;
  supplier?: string | null;
  supplierName?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  poNumber?: string | null;

  currency?: string | null;
  totalAmount?: number | string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  taxAmount?: number | string | null;

  invoiceDate?: string | null;
  dueDate?: string | null;

  /** OCR confidence, 0–100. Backends vary on the exact key. */
  confidence?: number | null;
  confidenceScore?: number | null;
  ocrConfidence?: number | null;

  // Source file metadata
  fileName?: string | null;
  originalFileName?: string | null;
  fileType?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  pageCount?: number | null;

  // Processing metadata
  errorMessage?: string | null;
  failureReason?: string | null;
  reviewReason?: string | null;
  duplicateOfId?: string | null;

  createdAt?: string;
  updatedAt?: string;
  processedAt?: string | null;

  /** Structured extraction output, when the backend nests it. */
  extracted?: Record<string, unknown> | null;
  extractedData?: Record<string, unknown> | null;
  fields?: Record<string, unknown> | null;
  lineItems?: OcrLineItem[] | null;

  /** Anything else the service returns — kept so nothing is silently dropped. */
  [key: string]: unknown;
}

// ─── Dashboard stats ────────────────────────────────────────────────────────
export interface OcrStats {
  total?: number;
  pendingReview?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  rejected?: number;
  duplicates?: number;
  received?: number;
  averageConfidence?: number;
  /** Map of status → count, when the backend groups them. */
  byStatus?: Partial<Record<string, number>>;
  statusCounts?: Partial<Record<string, number>>;
  [key: string]: unknown;
}

// ─── Filters / list params (from the OpenAPI contract) ──────────────────────
export interface OcrListParams {
  status?: OcrInvoiceStatus | string;
  documentType?: OcrDocumentType | string;
  supplier?: string;
  dateFrom?: string;
  dateTo?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  page?: number;
  limit?: number;
}

// ─── Canonical paginated envelope (produced by the client normalizer) ───────
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Extract → review → commit flow ─────────────────────────────────────────
/**
 * Result of `POST /ocr/invoices/extract` (or `/ocr/oci/extract`): the parsed
 * fields, NOT yet persisted. The unified backend returns
 * `{ stagingId, file: {...}, fields: ParsedInvoice }` — `stagingId` must be
 * carried into the commit call. Kept tolerant via the index signature.
 */
export type OcrExtractResult = Partial<OcrInvoice> & {
  stagingId?: string;
  file?: {
    originalFilename?: string;
    mimeType?: string;
    fileSize?: number;
    [key: string]: unknown;
  };
  fields?: Record<string, unknown>;
  [key: string]: unknown;
};

/** A line item in editable (string-bound) form for the review form inputs. */
export interface OcrLineItemDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

/**
 * Flat, fully-controlled draft the review form binds to. All values are strings
 * so inputs stay controlled; they're parsed back to typed values on commit.
 */
export interface OcrReviewDraft {
  invoiceNumber: string;
  supplier: string;
  poNumber: string;
  documentType: string;
  currency: string;
  totalAmount: string;
  subtotal: string;
  taxAmount: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: OcrLineItemDraft[];
}

/** One line item in the backend's `CommitInvoiceDto` shape. */
export interface CommitLineItem {
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
}

/**
 * Body sent to `POST /ocr/invoices/commit` — must match the backend's
 * `CommitInvoiceDto` EXACTLY (it validates with `forbidNonWhitelisted`, so any
 * extra key is rejected with a 400). `stagingId` comes from the extract step.
 */
export interface CommitPayload {
  stagingId: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  /** ISO date (YYYY-MM-DD). */
  invoiceDate?: string | null;
  poNumber?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  /** 0–100. */
  confidenceScore?: number | null;
  documentType?: string;
  language?: string | null;
  cfdiDetected?: boolean;
  lineItems?: CommitLineItem[];
}
