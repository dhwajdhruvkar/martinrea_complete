import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FileText,
  Filter,
  Loader2,
  RotateCw,
  ScanLine,
  Search as SearchIcon,
  Workflow,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { OcrStatusBadge } from '@/components/ocr/OcrBadges';
import { Pagination } from '@/components/ocr/Pagination';
import { useInvoicesList } from '@/hooks/useInvoices';
import { useOcrInvoices } from '@/hooks/useOcr';
import {
  getCreatedAt,
  getCurrency,
  getFileName,
  getInvoiceNumber,
  getSupplier,
  getTotal,
} from '@/lib/ocr';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { INGESTION_CHANNELS, STATUS_META } from '@/lib/constants';
import type { InvoiceStatus } from '@/types/invoice';

const PAGE_SIZE = 25; // PRD DAT-05 default page size
const OCR_PARAMS = { page: 1, limit: 200 } as const;
const ALL = '__all__';

type Source = 'WORKFLOW' | 'OCR';

interface SearchRow {
  source: Source;
  id: string;
  invoiceNumber: string;
  supplier: string;
  poNumber: string | null;
  amount: number | null;
  currency: string;
  status: string;
  channel: string | null;
  createdAt: string | null;
  link: string;
}

/**
 * Repository Search (PRD DAT-04/05): one search box over BOTH invoice stores —
 * the approval-workflow repository and the OCR document repository — with the
 * PRD's filter set (keyword, status, date range, amount range, channel) and
 * client-side CSV export. Server-side full-text search + CSV ships with the
 * Data & Repository track's search API.
 */
export default function SearchPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const wf = useInvoicesList();
  const ocr = useOcrInvoices(OCR_PARAMS);
  const isLoading = wf.isLoading || ocr.isLoading;
  const isFetching = wf.isFetching || ocr.isFetching;

  // Filters (PRD DAT-05)
  const [q, setQ] = useState('');
  const [source, setSource] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [channel, setChannel] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo<SearchRow[]>(() => {
    const out: SearchRow[] = [];
    for (const inv of wf.invoices) {
      out.push({
        source: 'WORKFLOW',
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplier: inv.supplierName,
        poNumber: inv.poNumber,
        amount: Number(inv.totalAmount),
        currency: inv.currency,
        status: inv.status,
        channel: inv.ingestionChannel,
        createdAt: inv.createdAt,
        link: `/invoices/${inv.id}`,
      });
    }
    for (const doc of ocr.data?.items ?? []) {
      out.push({
        source: 'OCR',
        id: doc.id,
        invoiceNumber: getInvoiceNumber(doc) ?? getFileName(doc) ?? 'Untitled',
        supplier: getSupplier(doc) ?? '—',
        poNumber: (doc.poNumber as string | null) ?? (doc['po_number'] as string | null),
        amount: getTotal(doc),
        currency: getCurrency(doc),
        status: String(doc.status ?? ''),
        channel: null,
        createdAt: getCreatedAt(doc),
        link: `/ocr/${doc.id}`,
      });
    }
    out.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
    return out;
  }, [wf.invoices, ocr.data]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const min = amountMin.trim() === '' ? null : Number(amountMin);
    const max = amountMax.trim() === '' ? null : Number(amountMax);
    return rows.filter((r) => {
      if (source !== ALL && r.source !== source) return false;
      if (status !== ALL && r.status !== status) return false;
      if (channel !== ALL && r.channel !== channel) return false;
      if (term) {
        const hay = `${r.invoiceNumber} ${r.supplier} ${r.poNumber ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (dateFrom && (!r.createdAt || r.createdAt.slice(0, 10) < dateFrom)) return false;
      if (dateTo && (!r.createdAt || r.createdAt.slice(0, 10) > dateTo)) return false;
      if (min !== null && Number.isFinite(min) && (r.amount ?? -Infinity) < min) return false;
      if (max !== null && Number.isFinite(max) && (r.amount ?? Infinity) > max) return false;
      return true;
    });
  }, [rows, q, source, status, channel, dateFrom, dateTo, amountMin, amountMax]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasFilters =
    q || source !== ALL || status !== ALL || channel !== ALL || dateFrom || dateTo || amountMin || amountMax;

  function clearFilters() {
    setQ('');
    setSource(ALL);
    setStatus(ALL);
    setChannel(ALL);
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
    setPage(1);
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Source',
      'Invoice Number',
      'Supplier',
      'PO Number',
      'Amount',
      'Currency',
      'Status',
      'Channel',
      'Created',
    ];
    const lines = [header.join(',')];
    for (const r of filtered) {
      lines.push(
        [
          r.source,
          r.invoiceNumber,
          r.supplier,
          r.poNumber ?? '',
          r.amount ?? '',
          r.currency,
          r.status,
          r.channel ?? '',
          r.createdAt ?? '',
        ]
          .map(esc)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-search-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Repository Search
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Search the full archive — workflow invoices and OCR documents — by number,
            supplier, PO, status, date, and amount.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={isLoading || filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV ({filtered.length})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['invoices'] });
              qc.invalidateQueries({ queryKey: ['ocr'] });
            }}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[260px] flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search by invoice #, supplier, PO…"
              className="pl-9 pr-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Filter className="h-3.5 w-3.5 text-ink-muted" />

          <Select value={source} onValueChange={(v) => { setSource(v); setPage(1); }}>
            <SelectTrigger className="h-10 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              <SelectItem value="WORKFLOW">Workflow</SelectItem>
              <SelectItem value="OCR">OCR repository</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="h-10 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s as InvoiceStatus]?.label ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1); }}>
            <SelectTrigger className="h-10 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All channels</SelectItem>
              {INGESTION_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-ink-muted">Created</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 w-[150px]"
            />
            <span className="text-ink-subtle">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-ink-muted">Amount</span>
            <Input
              inputMode="decimal"
              value={amountMin}
              onChange={(e) => { setAmountMin(e.target.value); setPage(1); }}
              placeholder="min"
              className="h-9 w-[90px]"
            />
            <span className="text-ink-subtle">–</span>
            <Input
              inputMode="decimal"
              value={amountMax}
              onChange={(e) => { setAmountMax(e.target.value); setPage(1); }}
              placeholder="max"
              className="h-9 w-[90px]"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-ink-muted">
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <Card className="overflow-hidden">
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-3">Invoice / Document</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">PO</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Created</th>
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
                  : pageRows.map((r) => (
                      <tr
                        key={`${r.source}-${r.id}`}
                        onClick={() => navigate(r.link)}
                        className="cursor-pointer border-b border-line text-[13px] transition-colors hover:bg-canvas"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-ink-muted">
                              <FileText className="h-4 w-4" />
                            </span>
                            <span className="font-semibold text-ink">{r.invoiceNumber}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-ink-muted">{r.supplier}</td>
                        <td className="px-4 py-3.5 text-ink-muted">{r.poNumber ?? '—'}</td>
                        <td className="px-4 py-3.5">
                          <SourceBadge source={r.source} />
                        </td>
                        <td className="px-4 py-3.5">
                          {r.source === 'WORKFLOW' && STATUS_META[r.status as InvoiceStatus] ? (
                            <StatusBadge status={r.status as InvoiceStatus} size="sm" />
                          ) : (
                            <OcrStatusBadge status={r.status} size="sm" />
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink">
                          {r.amount !== null ? formatCurrency(r.amount, r.currency) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-ink-muted">
                          {r.createdAt ? formatDate(r.createdAt) : '—'}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            {!isLoading && filtered.length === 0 && (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-medium text-ink">No records match this search</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Try a different keyword or clear the filters.
                </p>
                {hasFilters && (
                  <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          limit={PAGE_SIZE}
          itemsOnPage={pageRows.length}
          isFetching={isFetching}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  const isWf = source === 'WORKFLOW';
  const Icon = isWf ? Workflow : ScanLine;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        isWf
          ? 'border-brand-100 bg-brand-50 text-brand-700'
          : 'border-teal-200 bg-teal-50 text-teal-700',
      )}
    >
      <Icon className="h-3 w-3" />
      {isWf ? 'Workflow' : 'OCR'}
    </span>
  );
}
