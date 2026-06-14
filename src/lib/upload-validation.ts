/**
 * Client-side validation for invoice document uploads.
 *
 * Uploads now go through the AI OCR service (POST /invoices/upload, see
 * `@/lib/ocr-api`), which accepts the document and runs OCR asynchronously.
 * These helpers mirror the service's accepted types + size limit so we can
 * reject obviously-bad files before spending a round-trip.
 */

/** Accepted invoice document types (PDF, JPG, PNG, TIF). */
export const ACCEPTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
] as const;

export const ACCEPTED_UPLOAD_ACCEPT_ATTR =
  '.pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff';

/** Max document size — 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Returns an error message if the file is invalid, or null if it's acceptable. */
export function validateInvoiceFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const okType = ACCEPTED_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!okType) {
    return 'Unsupported type — use PDF, JPG, PNG, or TIF.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'Too large — the limit is 10 MB.';
  }
  if (file.size === 0) {
    return 'File is empty.';
  }
  return null;
}
