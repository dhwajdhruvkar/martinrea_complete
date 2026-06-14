import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Filter,
  Loader2,
  RotateCw,
  Search as SearchIcon,
  X,
} from 'lucide-react';
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
import { EmptyInvoicesState } from '@/components/invoices/EmptyInvoicesState';
import { useInvoicesList } from '@/hooks/useInvoices';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate, relativeFromNow } from '@/lib/utils';
import {
  PIPELINE_ORDER,
  PLANTS,
  STATUS_META,
  TERMINAL_STATUSES,
} from '@/lib/constants';
import type { Invoice, InvoiceStatus } from '@/types/invoice';

type StatusFilter = 'all' | 'open' | 'closed' | InvoiceStatus;
type SortKey = 'updatedAt' | 'totalAmount' | 'invoiceNumber';

export default function InvoiceProcessingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { invoices, isEmpty, isLoading, isFetching, errors } =
    useInvoicesList();

  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(
    (params.get('status') as StatusFilter) ?? 'all',
  );
  const [plant, setPlant] = useState<string>(params.get('plant') ?? 'all');
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = invoices;

    if (status !== 'all') {
      if (status === 'open') {
        list = list.filter((i) => !TERMINAL_STATUSES.includes(i.status));
      } else if (status === 'closed') {
        list = list.filter((i) => TERMINAL_STATUSES.includes(i.status));
      } else {
        list = list.filter((i) => i.status === status);
      }
    }

    if (plant !== 'all') {
      list = list.filter((i) => i.plantId === plant);
    }

    if (term) {
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(term) ||
          i.supplierName.toLowerCase().includes(term) ||
          (i.poNumber?.toLowerCase().includes(term) ?? false) ||
          (i.supplierId?.toLowerCase().includes(term) ?? false),
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort === 'updatedAt') {
        cmp =
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sort === 'totalAmount') {
        cmp = Number(a.totalAmount) - Number(b.totalAmount);
      } else if (sort === 'invoiceNumber') {
        cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [invoices, q, status, plant, sort, sortDir]);

  // Sync filters → URL so links + reloads keep state
  function updateUrl(next: Partial<{ q: string; status: StatusFilter; plant: string }>) {
    const p = new URLSearchParams(params);
    const setOrDelete = (key: string, value: string | undefined, defaultValue: string) => {
      if (!value || value === defaultValue) p.delete(key);
      else p.set(key, value);
    };
    if (next.q !== undefined) setOrDelete('q', next.q, '');
    if (next.status !== undefined) setOrDelete('status', next.status, 'all');
    if (next.plant !== undefined) setOrDelete('plant', next.plant, 'all');
    setParams(p, { replace: true });
  }

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setSortDir('desc');
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['invoices'] });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Invoice processing
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Track every invoice across its lifecycle, from receipt to approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
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

      {isEmpty ? (
        <EmptyInvoicesState />
      ) : (
        <>
          {/* Status quick-filter chips */}
          <div className="-mx-1 flex flex-wrap gap-1.5">
            <Chip
              label="All"
              count={invoices.length}
              active={status === 'all'}
              onClick={() => {
                setStatus('all');
                updateUrl({ status: 'all' });
              }}
            />
            <Chip
              label="Open"
              count={invoices.filter((i) => !TERMINAL_STATUSES.includes(i.status)).length}
              active={status === 'open'}
              onClick={() => {
                setStatus('open');
                updateUrl({ status: 'open' });
              }}
            />
            {PIPELINE_ORDER.map((s) => {
              const count = invoices.filter((i) => i.status === s).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={s}
                  label={STATUS_META[s].label}
                  count={count}
                  color={STATUS_META[s].color}
                  active={status === s}
                  onClick={() => {
                    setStatus(s);
                    updateUrl({ status: s });
                  }}
                />
              );
            })}
            {(['REJECTED', 'EXCEPTION'] as InvoiceStatus[]).map((s) => {
              const count = invoices.filter((i) => i.status === s).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={s}
                  label={STATUS_META[s].label}
                  count={count}
                  color={STATUS_META[s].color}
                  active={status === s}
                  onClick={() => {
                    setStatus(s);
                    updateUrl({ status: s });
                  }}
                />
              );
            })}
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[260px] flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  updateUrl({ q: e.target.value });
                }}
                placeholder="Search by invoice #, PO, supplier…"
                className="pl-9 pr-9"
              />
              {q && (
                <button
                  onClick={() => {
                    setQ('');
                    updateUrl({ q: '' });
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-ink-muted" />
              <Select
                value={plant}
                onValueChange={(v) => {
                  setPlant(v);
                  updateUrl({ plant: v });
                }}
              >
                <SelectTrigger className="h-10 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plants</SelectItem>
                  {PLANTS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Errors banner (partial failures don't block the page) */}
          {errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12.5px] text-amber-800">
              Couldn't load {errors.length} invoice{errors.length === 1 ? '' : 's'}. The
              records may have been deleted. They've been left out of the list.
            </div>
          )}

          {/* Table */}
          <Card className="overflow-hidden">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      <Th
                        sortable
                        sorted={sort === 'invoiceNumber'}
                        dir={sortDir}
                        onClick={() => toggleSort('invoiceNumber')}
                      >
                        Invoice
                      </Th>
                      <Th>Supplier</Th>
                      <Th>PO</Th>
                      <Th>Status</Th>
                      <Th>Plant</Th>
                      <Th
                        sortable
                        sorted={sort === 'totalAmount'}
                        dir={sortDir}
                        onClick={() => toggleSort('totalAmount')}
                        align="right"
                      >
                        Amount
                      </Th>
                      <Th
                        sortable
                        sorted={sort === 'updatedAt'}
                        dir={sortDir}
                        onClick={() => toggleSort('updatedAt')}
                      >
                        Updated
                      </Th>
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
                      : filtered.map((inv) => (
                          <Row
                            key={inv.id}
                            invoice={inv}
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                          />
                        ))}
                  </tbody>
                </table>

                {!isLoading && filtered.length === 0 && (
                  <div className="px-6 py-14 text-center">
                    <p className="text-sm font-medium text-ink">
                      No invoices match these filters
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Try clearing the search or changing the status filter.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setQ('');
                        setStatus('all');
                        setPlant('all');
                        updateUrl({ q: '', status: 'all', plant: 'all' });
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-1 text-[12px] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing{' '}
              <span className="font-semibold text-ink">
                {filtered.length}
              </span>{' '}
              of {invoices.length} known invoices
            </p>
            <p>
              Need more? Open the{' '}
              <Link
                to="/admin"
                className="font-medium text-brand hover:underline"
              >
                Admin Panel
              </Link>{' '}
              to seed more demo data.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all ${
        active
          ? 'border-brand bg-brand text-white shadow-sm'
          : 'border-line bg-white text-ink-muted hover:border-brand-200 hover:text-ink'
      }`}
    >
      {color && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: active ? '#fff' : color }}
        />
      )}
      {label}
      <span
        className={`rounded-full px-1.5 py-px text-[10.5px] font-semibold ${
          active ? 'bg-white/20 text-white' : 'bg-canvas text-ink-muted'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function Th({
  children,
  sortable,
  sorted,
  dir,
  onClick,
  align = 'left',
}: {
  children: React.ReactNode;
  sortable?: boolean;
  sorted?: boolean;
  dir?: 'asc' | 'desc';
  onClick?: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {sortable ? (
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
            sorted ? 'text-ink' : ''
          }`}
        >
          {children}
          <ArrowUpDown
            className={`h-3 w-3 ${sorted ? 'opacity-100' : 'opacity-40'} ${
              sorted && dir === 'asc' ? 'rotate-180' : ''
            }`}
          />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Row({ invoice, onClick }: { invoice: Invoice; onClick: () => void }) {
  const plant = PLANTS.find((p) => p.id === invoice.plantId);
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-line text-[13px] transition-colors hover:bg-canvas"
    >
      <td className="px-4 py-3.5 font-semibold text-ink">
        <div className="flex flex-col">
          <span>{invoice.invoiceNumber}</span>
          <span className="text-[11px] font-normal text-ink-subtle">
            {invoice.ingestionChannel ?? 'MANUAL'}
            {invoice.cfdiValid === false && (
              <span className="ml-1.5 rounded-sm border border-rose-200 bg-rose-50 px-1 py-px text-[10px] font-semibold text-rose-700">
                CFDI ✗
              </span>
            )}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col">
          <span className="font-medium text-ink">{invoice.supplierName}</span>
          {invoice.supplierId && (
            <span className="text-[11px] text-ink-subtle">
              {invoice.supplierId}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5 text-ink-muted">
        {invoice.poNumber ?? '—'}
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={invoice.status} size="sm" />
      </td>
      <td className="px-4 py-3.5 text-ink-muted">{plant?.name ?? invoice.plantId ?? '—'}</td>
      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink">
        {formatCurrency(Number(invoice.totalAmount), invoice.currency)}
      </td>
      <td className="px-4 py-3.5 text-ink-muted">
        <div className="flex flex-col">
          <span>{relativeFromNow(invoice.updatedAt)}</span>
          <span className="text-[11px] text-ink-subtle">
            {formatDate(invoice.updatedAt)}
          </span>
        </div>
      </td>
    </tr>
  );
}
