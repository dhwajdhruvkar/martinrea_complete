import {
  AlertTriangle,
  Calendar,
  Clock,
  Hash,
  ListTree,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatDateTime, relativeFromNow } from '@/lib/utils';
import { useRetryOcr } from '@/hooks/useOcr';
import {
  ConfidenceMeter,
  DocTypeBadge,
  OcrStatusBadge,
} from '@/components/ocr/OcrBadges';
import { OcrFilePreview } from '@/components/ocr/OcrFilePreview';
import { OcrReviewForm } from '@/components/ocr/OcrReviewForm';
import {
  displayValue,
  flattenSource,
  getConfidence,
  getCreatedAt,
  getDocumentType,
  getErrorMessage,
  getExtractedFields,
  getFileName,
  getFileSize,
  getInvoiceNumber,
  getLineItems,
  getMimeType,
  getReviewReason,
  getSupplier,
  getTotal,
  getUpdatedAt,
  humanizeKey,
  toNumber,
} from '@/lib/ocr';
import type { OcrExtractResult, OcrInvoice } from '@/types/ocr';

export function OcrDetailPanel({
  invoice,
  editable = false,
  localFile,
  submitLabel,
  onCommitted,
  onCancel,
  className,
}: {
  invoice: OcrInvoice | OcrExtractResult;
  /** Render the editable review form instead of read-only extracted fields. */
  editable?: boolean;
  /** Preview a not-yet-saved local file (post-extract, before commit). */
  localFile?: File | null;
  submitLabel?: string;
  onCommitted?: (saved: OcrInvoice) => void;
  onCancel?: () => void;
  className?: string;
}) {
  // Flatten extract results ({ stagingId, file, fields }) so the header tiles
  // and metadata read the parsed values the same way as a saved invoice.
  const inv = flattenSource(invoice);
  const retry = useRetryOcr();

  const invoiceNumber = getInvoiceNumber(inv);
  const supplier = getSupplier(inv);
  const confidence = getConfidence(inv);
  const total = getTotal(inv);
  const docType = getDocumentType(inv);
  const error = getErrorMessage(inv);
  const reviewReason = getReviewReason(inv);
  const fields = getExtractedFields(inv);
  const lineItems = getLineItems(inv);
  const fieldEntries = Object.entries(fields).filter(([k]) => k.toLowerCase() !== 'lineitems');

  const isFailed = inv.status === 'FAILED';
  const isDuplicate = inv.status === 'DUPLICATE_INVOICE';

  return (
    <div className={cn('grid min-h-0 gap-4 lg:grid-cols-2', className)}>
      {/* Source document */}
      <OcrFilePreview
        invoiceId={inv.id}
        localFile={localFile}
        fileName={getFileName(inv)}
        className="min-h-[360px] lg:min-h-0"
      />

      {/* Extracted data + metadata */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-0.5">
        {/* Title row */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">
              {invoiceNumber || getFileName(inv) || 'Untitled document'}
            </h3>
            {inv.status && <OcrStatusBadge status={inv.status} />}
            {docType && <DocTypeBadge type={docType} />}
          </div>
          {supplier && <p className="mt-1 text-[13.5px] text-ink-muted">{supplier}</p>}
        </div>

        {/* Confidence + total */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-white p-3">
            <ConfidenceMeter score={confidence} />
          </div>
          <div className="rounded-lg border border-line bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Total
            </p>
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-ink">
              {total !== null ? formatCurrency(total, getMimeishCurrency(inv)) : '—'}
            </p>
          </div>
        </div>

        {/* Failure / duplicate callouts */}
        {isFailed && inv.id && (
          <div className="flex items-start gap-2.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-rose-800">OCR processing failed</p>
              {error && <p className="mt-0.5 text-[12.5px] text-rose-700">{error}</p>}
              <Button
                size="sm"
                variant="destructive"
                className="mt-2.5"
                onClick={() => retry.mutate(inv.id)}
                disabled={retry.isPending}
              >
                <RotateCw className={cn('h-3.5 w-3.5', retry.isPending && 'animate-spin')} />
                {retry.isPending ? 'Retrying…' : 'Retry OCR'}
              </Button>
            </div>
          </div>
        )}
        {isDuplicate && (
          <div className="flex items-start gap-2.5 rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 text-[12.5px] text-orange-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Flagged as a potential duplicate
              {inv.duplicateOfId ? ` of ${inv.duplicateOfId}` : ''}.
            </span>
          </div>
        )}
        {!isFailed && reviewReason && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{reviewReason}</span>
          </div>
        )}

        {editable ? (
          /* Editable review form (extract → correct → commit) */
          <OcrReviewForm
            source={invoice}
            submitLabel={submitLabel}
            onCommitted={onCommitted}
            onCancel={onCancel}
          />
        ) : (
          <>
        {/* Extracted fields */}
        <Section icon={ListTree} title="Extracted fields">
          {fieldEntries.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">
              No structured fields were returned for this document.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {humanizeKey(key)}
                  </dt>
                  <dd className="break-words text-[13px] text-ink">{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        {/* Line items */}
        {lineItems.length > 0 && (
          <Section icon={ListTree} title={`Line items (${lineItems.length})`}>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="px-2.5 py-1.5 font-semibold">Description</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Qty</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Unit</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={idx} className="border-b border-line last:border-0">
                      <td className="px-2.5 py-1.5 text-ink">
                        {displayValue(li.description ?? li['name'])}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-muted">
                        {displayValue(li.quantity ?? li['qty'])}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-muted">
                        {fmtMaybe(li.unitPrice ?? li['price'])}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums font-medium text-ink">
                        {fmtMaybe(li.amount ?? li['total'])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Metadata */}
        <Section icon={Hash} title="Document metadata">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Meta label="Document ID" value={inv.id ?? '—'} mono />
            <Meta label="File name" value={getFileName(inv) ?? '—'} />
            <Meta label="File type" value={getMimeType(inv) ?? '—'} />
            <Meta
              label="File size"
              value={getFileSize(inv) !== null ? prettyBytes(getFileSize(inv)!) : '—'}
            />
            <Meta
              label="Created"
              value={getCreatedAt(inv) ? formatDateTime(getCreatedAt(inv)) : '—'}
              icon={Calendar}
            />
            <Meta
              label="Last update"
              value={getUpdatedAt(inv) ? relativeFromNow(getUpdatedAt(inv)) : '—'}
              icon={Clock}
            />
          </dl>
        </Section>

        {/* Footer actions */}
        {inv.id && (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => retry.mutate(inv.id)}
              disabled={retry.isPending}
            >
              <RotateCw className={cn('h-3.5 w-3.5', retry.isPending && 'animate-spin')} />
              Re-run OCR
            </Button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function getMimeishCurrency(invoice: OcrInvoice): string {
  const c = invoice.currency;
  return typeof c === 'string' && c.trim() ? c : 'USD';
}

function fmtMaybe(value: unknown): string {
  const n = toNumber(value);
  return n === null ? displayValue(value) : formatCurrency(n);
}

function prettyBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Hash;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-3.5">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <Icon className="h-3.5 w-3.5 text-brand" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function Meta({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: typeof Hash;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className={cn('text-[13px] text-ink', mono && 'break-all font-mono text-[12px]')}>
        {value}
      </dd>
    </div>
  );
}
