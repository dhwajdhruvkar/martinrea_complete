import { useEffect, useState } from 'react';
import { Filter, Search as SearchIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OCR_DOCUMENT_TYPES, ocrStatusMeta, docTypeMeta } from '@/lib/ocr-constants';
import { ALL_OCR_STATUSES, type OcrListParams } from '@/types/ocr';

export type OcrFilterValues = Omit<OcrListParams, 'page' | 'limit'>;

const ALL = '__all__';

function hasActiveFilters(v: OcrFilterValues): boolean {
  return Boolean(
    v.status ||
      v.documentType ||
      v.supplier ||
      v.dateFrom ||
      v.dateTo ||
      v.confidenceMin !== undefined ||
      v.confidenceMax !== undefined,
  );
}

export function OcrFilters({
  value,
  onChange,
  hideStatus = false,
  className,
}: {
  value: OcrFilterValues;
  onChange: (next: OcrFilterValues) => void;
  hideStatus?: boolean;
  className?: string;
}) {
  // Debounce the free-text supplier field so we don't refetch per keystroke.
  const [supplierDraft, setSupplierDraft] = useState(value.supplier ?? '');
  useEffect(() => {
    setSupplierDraft(value.supplier ?? '');
  }, [value.supplier]);
  useEffect(() => {
    const next = supplierDraft.trim() || undefined;
    if (next === value.supplier) return;
    const t = setTimeout(() => onChange({ ...value, supplier: next }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierDraft]);

  const set = (patch: Partial<OcrFilterValues>) => onChange({ ...value, ...patch });

  const parseScore = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(100, n));
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Supplier search */}
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={supplierDraft}
            onChange={(e) => setSupplierDraft(e.target.value)}
            placeholder="Search supplier…"
            className="pl-9 pr-9"
          />
          {supplierDraft && (
            <button
              type="button"
              onClick={() => setSupplierDraft('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
              aria-label="Clear supplier"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-ink-muted">
          <Filter className="h-3.5 w-3.5" />
        </div>

        {!hideStatus && (
          <Select
            value={value.status ?? ALL}
            onValueChange={(v) => set({ status: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="h-10 w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {ALL_OCR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ocrStatusMeta(s).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={value.documentType ?? ALL}
          onValueChange={(v) => set({ documentType: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="h-10 w-[170px]">
            <SelectValue placeholder="Document type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {OCR_DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {docTypeMeta(t).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Secondary row: confidence + date range */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink-muted">Confidence</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={value.confidenceMin ?? ''}
            onChange={(e) => set({ confidenceMin: parseScore(e.target.value) })}
            placeholder="min"
            className="h-9 w-[72px]"
          />
          <span className="text-ink-subtle">–</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={value.confidenceMax ?? ''}
            onChange={(e) => set({ confidenceMax: parseScore(e.target.value) })}
            placeholder="max"
            className="h-9 w-[72px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink-muted">Created</span>
          <Input
            type="date"
            value={value.dateFrom ?? ''}
            onChange={(e) => set({ dateFrom: e.target.value || undefined })}
            className="h-9 w-[150px]"
          />
          <span className="text-ink-subtle">–</span>
          <Input
            type="date"
            value={value.dateTo ?? ''}
            onChange={(e) => set({ dateTo: e.target.value || undefined })}
            className="h-9 w-[150px]"
          />
        </div>

        {hasActiveFilters(value) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            className="text-ink-muted"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
