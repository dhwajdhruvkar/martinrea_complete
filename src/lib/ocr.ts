/**
 * Tolerant read helpers + response normalizers for the OCR API.
 *
 * The OpenAPI spec doesn't pin down the response body shape, so everything the
 * UI reads off an `OcrInvoice` goes through an accessor here. If the backend
 * names a field differently than we guessed, fix it in ONE place.
 */
import type {
  CommitPayload,
  OcrExtractResult,
  OcrInvoice,
  OcrLineItem,
  OcrReviewDraft,
  OcrStats,
  Paginated,
} from '@/types/ocr';

// ─── Primitive coercion ─────────────────────────────────────────────────────
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

// ─── Field accessors ────────────────────────────────────────────────────────
// The unified workflow-service backend serializes OCR invoices in snake_case
// (supplier_name, total_amount, …); extract results come back camelCase
// (ParsedInvoice). Every accessor tolerates both.
export function getSupplier(inv: OcrInvoice): string | null {
  return firstString(inv.supplier, inv.supplierName, inv['supplier_name'], inv.vendorName);
}

export function getInvoiceNumber(inv: OcrInvoice): string | null {
  return firstString(inv.invoiceNumber, inv['invoice_number'], inv.poNumber);
}

export function getDocumentType(inv: OcrInvoice): string | null {
  return firstString(inv.documentType, inv['document_type'], inv['docType']);
}

export function getCurrency(inv: OcrInvoice): string {
  return firstString(inv.currency, inv['currencyCode']) ?? 'USD';
}

export function getTotal(inv: OcrInvoice): number | null {
  return firstNumber(
    inv.totalAmount,
    inv['total_amount'],
    inv.total,
    inv['grandTotal'],
    inv['amount'],
  );
}

/**
 * OCR confidence as a 0–100 number. The contract documents 0–100; if a backend
 * ever sends a 0–1 fraction, normalize it here (single source of truth).
 */
export function getConfidence(inv: OcrInvoice): number | null {
  const raw = firstNumber(
    inv.confidence,
    inv.confidenceScore,
    inv.ocrConfidence,
    inv['confidence_score'],
  );
  if (raw === null) return null;
  const score = raw > 0 && raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getCreatedAt(inv: OcrInvoice): string | null {
  return firstString(inv.createdAt, inv['created_at'], inv['uploadedAt']);
}

export function getUpdatedAt(inv: OcrInvoice): string | null {
  return firstString(inv.updatedAt, inv['updated_at'], inv.processedAt);
}

export function getFileName(inv: OcrInvoice): string | null {
  return firstString(
    inv.fileName,
    inv.originalFileName,
    inv['original_filename'],
    inv['originalFilename'],
    inv['file_name'],
  );
}

export function getMimeType(inv: OcrInvoice): string | null {
  return firstString(
    inv.mimeType,
    inv['mime_type'],
    inv.fileType,
    inv['file_type'],
    inv['contentType'],
  );
}

export function getFileSize(inv: OcrInvoice): number | null {
  return firstNumber(inv.fileSize, inv['file_size']);
}

export function getErrorMessage(inv: OcrInvoice): string | null {
  return firstString(inv.errorMessage, inv['error_message'], inv.failureReason, inv['error']);
}

export function getReviewReason(inv: OcrInvoice): string | null {
  return firstString(
    inv.reviewReason,
    inv['review_reason'],
    inv['flagReason'],
    inv['reason'],
  );
}

/** `stagingId` handed back by POST /ocr/invoices/extract — required by commit. */
export function getStagingId(inv: OcrInvoice | Record<string, unknown>): string | null {
  const v = (inv as Record<string, unknown>)['stagingId'];
  return typeof v === 'string' && v ? v : null;
}

/**
 * The structured OCR output as flat key→value pairs for generic display.
 * Pulls from whichever nested bag the backend uses, then falls back to the
 * well-known top-level fields so there's always something useful to show.
 */
export function getExtractedFields(inv: OcrInvoice): Record<string, unknown> {
  const bag =
    (inv.extracted && typeof inv.extracted === 'object' ? inv.extracted : null) ??
    (inv.extractedData && typeof inv.extractedData === 'object'
      ? inv.extractedData
      : null) ??
    (inv.fields && typeof inv.fields === 'object' ? inv.fields : null);

  if (bag) return bag as Record<string, unknown>;

  // Derive a sensible set from the flat record when nothing is nested.
  const derived: Record<string, unknown> = {};
  const supplier = getSupplier(inv);
  const invoiceNumber = getInvoiceNumber(inv);
  const poNumber = getPoNumber(inv);
  const invoiceDate = getInvoiceDate(inv);
  const subtotal = getSubtotal(inv);
  const tax = getTaxAmount(inv);
  const total = getTotal(inv);
  if (invoiceNumber) derived['Invoice number'] = invoiceNumber;
  if (supplier) derived['Supplier'] = supplier;
  if (poNumber) derived['PO number'] = poNumber;
  if (invoiceDate) derived['Invoice date'] = invoiceDate;
  if (getDueDate(inv)) derived['Due date'] = getDueDate(inv);
  if (subtotal !== null) derived['Subtotal'] = subtotal;
  if (tax !== null) derived['Tax'] = tax;
  if (total !== null) derived['Total'] = total;
  return derived;
}

/**
 * Line items normalized to camelCase (`unitPrice`/`amount`) regardless of the
 * backend's casing (`unit_price`, `line_total`, `lineTotal`, …) so display
 * components and the review form read one shape.
 */
export function getLineItems(inv: OcrInvoice): OcrLineItem[] {
  let raw: unknown;
  if (Array.isArray(inv.lineItems)) raw = inv.lineItems;
  else if (Array.isArray(inv['line_items'])) raw = inv['line_items'];
  else {
    const nested = inv.extracted ?? inv.extractedData ?? inv.fields;
    if (nested && typeof nested === 'object') {
      const bag = nested as Record<string, unknown>;
      raw = Array.isArray(bag['lineItems'])
        ? bag['lineItems']
        : Array.isArray(bag['line_items'])
        ? bag['line_items']
        : undefined;
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const li = (item ?? {}) as Record<string, unknown>;
    return {
      ...li,
      description:
        typeof li.description === 'string'
          ? li.description
          : typeof li['name'] === 'string'
          ? (li['name'] as string)
          : undefined,
      quantity: toNumber(li.quantity ?? li['qty']) ?? undefined,
      unitPrice: toNumber(li.unitPrice ?? li['unit_price'] ?? li['price']) ?? undefined,
      amount:
        toNumber(li.amount ?? li['lineTotal'] ?? li['line_total'] ?? li['total']) ?? undefined,
    } as OcrLineItem;
  });
}

/** Humanize an extracted-field key like `invoice_number` → "Invoice number". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render an extracted value to a display string. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ─── Commit draft (editable review-form model) ──────────────────────────────
function getPoNumber(inv: OcrInvoice): string | null {
  return firstString(inv.poNumber, inv['po_number'], inv['purchaseOrder']);
}

function getInvoiceDate(inv: OcrInvoice): string | null {
  return firstString(inv.invoiceDate, inv['invoice_date'], inv['date']);
}

function getDueDate(inv: OcrInvoice): string | null {
  return firstString(inv.dueDate, inv['due_date']);
}

function getSubtotal(inv: OcrInvoice): number | null {
  return firstNumber(inv.subtotal, inv['sub_total']);
}

function getTaxAmount(inv: OcrInvoice): number | null {
  return firstNumber(inv.taxAmount, inv['tax_amount'], inv['tax']);
}

/**
 * Merge an extract result (`{ stagingId, file, fields }`) into one flat record
 * so the accessors above can read it like any invoice. Top-level keys (e.g.
 * `stagingId`) win; the parsed `fields` bag supplies the business data and the
 * nested `file` metadata is lifted (originalFilename, mimeType, fileSize).
 */
export function flattenSource(source: OcrInvoice | OcrExtractResult): OcrInvoice {
  const src = source as Record<string, unknown>;
  const fields =
    src.fields && typeof src.fields === 'object' && !Array.isArray(src.fields)
      ? (src.fields as Record<string, unknown>)
      : {};
  const file =
    src.file && typeof src.file === 'object' && !Array.isArray(src.file)
      ? (src.file as Record<string, unknown>)
      : {};
  return { ...fields, ...file, ...src } as OcrInvoice;
}

/** Normalize a date-ish string to YYYY-MM-DD for `<input type="date">`. */
export function toDateInput(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (iso) return iso[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function numToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * Map a tolerant OcrInvoice / extract result into the flat, string-bound draft
 * the review form edits. Single source of truth for which backend field feeds
 * which input.
 */
export function toCommitDraft(source: OcrInvoice | OcrExtractResult): OcrReviewDraft {
  const inv = flattenSource(source);
  return {
    invoiceNumber: getInvoiceNumber(inv) ?? '',
    supplier: getSupplier(inv) ?? '',
    poNumber: getPoNumber(inv) ?? '',
    documentType: getDocumentType(inv) ?? '',
    currency: getCurrency(inv),
    totalAmount: numToInput(getTotal(inv)),
    subtotal: numToInput(getSubtotal(inv)),
    taxAmount: numToInput(getTaxAmount(inv)),
    invoiceDate: toDateInput(getInvoiceDate(inv)),
    dueDate: toDateInput(getDueDate(inv)),
    lineItems: getLineItems(inv).map((li) => ({
      description: firstString(li.description, li['name'], li['item']) ?? '',
      quantity: numToInput(firstNumber(li.quantity, li['qty'])),
      unitPrice: numToInput(firstNumber(li.unitPrice, li['price'], li['unit_price'])),
      amount: numToInput(firstNumber(li.amount, li['total'], li['lineTotal'])),
    })),
  };
}

/** DocumentType values the backend's commit DTO accepts (`@IsEnum`). */
const COMMIT_DOCUMENT_TYPES = ['INVOICE', 'CFDI', 'RECEIPT', 'PURCHASE_ORDER'];

/**
 * Serialize the edited draft into the EXACT `CommitInvoiceDto` the unified
 * backend validates with `forbidNonWhitelisted` — any extra key is a 400.
 * `stagingId` (from the extract step) is mandatory; blanks are sent as null
 * so they explicitly override the extraction-time sidecar values.
 */
export function draftToCommitPayload(
  draft: OcrReviewDraft,
  original: OcrInvoice | OcrExtractResult,
): CommitPayload {
  const orig = flattenSource(original);
  const docType = draft.documentType.trim();

  const payload: CommitPayload = {
    stagingId: getStagingId(orig) ?? '',
    supplierName: draft.supplier.trim() || null,
    invoiceNumber: draft.invoiceNumber.trim() || null,
    invoiceDate: draft.invoiceDate || null,
    poNumber: draft.poNumber.trim() || null,
    currency: draft.currency.trim() || null,
    subtotal: toNumber(draft.subtotal),
    taxAmount: toNumber(draft.taxAmount),
    totalAmount: toNumber(draft.totalAmount),
    lineItems: draft.lineItems
      .filter((li) => li.description.trim() || li.amount.trim())
      .map((li) => ({
        description: li.description.trim() || null,
        quantity: toNumber(li.quantity),
        unitPrice: toNumber(li.unitPrice),
        lineTotal: toNumber(li.amount),
      })),
  };

  // Optional passthroughs — only included when valid, so the DTO whitelist
  // never rejects the request.
  if (COMMIT_DOCUMENT_TYPES.includes(docType)) payload.documentType = docType;
  const confidence = getConfidence(orig);
  if (confidence !== null) payload.confidenceScore = confidence;
  const language = firstString(orig.language);
  if (language) payload.language = language;
  if (typeof orig['cfdiDetected'] === 'boolean') {
    payload.cfdiDetected = orig['cfdiDetected'];
  } else if (typeof orig['cfdi_detected'] === 'boolean') {
    payload.cfdiDetected = orig['cfdi_detected'];
  }

  return payload;
}

// ─── Response normalizers ───────────────────────────────────────────────────
const ARRAY_KEYS = ['items', 'data', 'results', 'invoices', 'records', 'rows', 'docs'];
const TOTAL_KEYS = ['total', 'totalCount', 'totalItems', 'count'];
const PAGE_KEYS = ['page', 'currentPage', 'pageNumber'];
const LIMIT_KEYS = ['limit', 'pageSize', 'perPage', 'size'];
const TOTAL_PAGES_KEYS = ['totalPages', 'pageCount', 'pages', 'lastPage'];

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in obj && obj[k] != null) return obj[k];
  return undefined;
}

function findArray(obj: Record<string, unknown>): unknown[] | null {
  for (const k of ARRAY_KEYS) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  // One level deeper (e.g. { data: { items: [...] } }).
  for (const k of ARRAY_KEYS) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = findArray(v as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Coerce any of the common paginated shapes into a canonical `Paginated<T>`.
 * Handles bare arrays, `{data,total,page,limit}`, `{items,meta:{…}}`, etc.
 */
export function normalizePaginated<T>(
  raw: unknown,
  fallback: { page: number; limit: number },
): Paginated<T> {
  if (Array.isArray(raw)) {
    return {
      items: raw as T[],
      total: raw.length,
      page: fallback.page,
      limit: fallback.limit,
      totalPages: 1,
    };
  }

  if (!raw || typeof raw !== 'object') {
    return { items: [], total: 0, page: fallback.page, limit: fallback.limit, totalPages: 0 };
  }

  const obj = raw as Record<string, unknown>;
  const items = (findArray(obj) ?? []) as T[];

  // Pagination metadata may sit at the top level or inside meta/pagination.
  const metaObj =
    (obj.meta && typeof obj.meta === 'object' ? (obj.meta as Record<string, unknown>) : null) ??
    (obj.pagination && typeof obj.pagination === 'object'
      ? (obj.pagination as Record<string, unknown>)
      : null) ??
    obj;

  const total =
    toNumber(pick(metaObj, TOTAL_KEYS)) ?? toNumber(pick(obj, TOTAL_KEYS)) ?? items.length;
  const page = toNumber(pick(metaObj, PAGE_KEYS)) ?? fallback.page;
  const limit = toNumber(pick(metaObj, LIMIT_KEYS)) ?? fallback.limit;
  const totalPages =
    toNumber(pick(metaObj, TOTAL_PAGES_KEYS)) ??
    (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1);

  return { items, total, page, limit, totalPages };
}

/** Flatten an `OcrStats` payload into a status→count map for tiles/charts. */
export function statusCounts(stats: OcrStats | undefined | null): Record<string, number> {
  if (!stats) return {};
  const map = stats.byStatus ?? stats.statusCounts;
  if (map && typeof map === 'object') {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      const n = toNumber(v);
      if (n !== null) out[k.toUpperCase()] = n;
    }
    if (Object.keys(out).length) return out;
  }
  // Fall back to flat count fields.
  const out: Record<string, number> = {};
  const flat: Array<[string, unknown]> = [
    ['RECEIVED', stats.received],
    ['OCR_PROCESSING', stats.processing],
    ['PENDING_REVIEW', stats.pendingReview],
    ['COMPLETED', stats.completed],
    ['FAILED', stats.failed],
    ['REJECTED', stats.rejected],
    ['DUPLICATE_INVOICE', stats.duplicates],
  ];
  for (const [k, v] of flat) {
    const n = toNumber(v);
    if (n !== null) out[k] = n;
  }
  return out;
}
