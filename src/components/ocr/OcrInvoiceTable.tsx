import { FileText, Loader2, RotateCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate, relativeFromNow } from '@/lib/utils';
import { useRetryOcr } from '@/hooks/useOcr';
import {
  ConfidenceBadge,
  DocTypeBadge,
  OcrStatusBadge,
} from '@/components/ocr/OcrBadges';
import {
  getConfidence,
  getCreatedAt,
  getDocumentType,
  getFileName,
  getInvoiceNumber,
  getSupplier,
} from '@/lib/ocr';
import type { OcrInvoice } from '@/types/ocr';

export function OcrInvoiceTable({
  invoices,
  isLoading,
  selectedId,
  onRowClick,
}: {
  invoices: OcrInvoice[];
  isLoading: boolean;
  selectedId?: string | null;
  onRowClick: (invoice: OcrInvoice) => void;
}) {
  const retry = useRetryOcr();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-line bg-canvas text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Supplier</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-line">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <Skeleton className="h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : invoices.map((inv) => {
                const invoiceNumber = getInvoiceNumber(inv);
                const fileName = getFileName(inv);
                const supplier = getSupplier(inv);
                const created = getCreatedAt(inv);
                const canRetry = inv.status === 'FAILED' || inv.status === 'REJECTED';
                const retrying = retry.isPending && retry.variables === inv.id;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => onRowClick(inv)}
                    className={cn(
                      'cursor-pointer border-b border-line text-[13px] transition-colors hover:bg-canvas',
                      selectedId === inv.id && 'bg-brand-50/60 hover:bg-brand-50',
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-ink-muted">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {invoiceNumber || fileName || 'Untitled'}
                          </p>
                          {fileName && invoiceNumber && (
                            <p className="truncate text-[11px] text-ink-subtle">{fileName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted">
                      <span className="line-clamp-1">{supplier || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <DocTypeBadge type={getDocumentType(inv)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <ConfidenceBadge score={getConfidence(inv)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <OcrStatusBadge status={inv.status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted">
                      <div className="flex flex-col">
                        <span>{created ? relativeFromNow(created) : '—'}</span>
                        {created && (
                          <span className="text-[11px] text-ink-subtle">{formatDate(created)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {canRetry && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            retry.mutate(inv.id);
                          }}
                          disabled={retrying}
                          title="Retry OCR"
                          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[11.5px] font-medium text-ink-muted transition-colors hover:border-brand-200 hover:text-ink disabled:opacity-50"
                        >
                          {retrying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCw className="h-3 w-3" />
                          )}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
