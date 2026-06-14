import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Database,
  Loader2,
  RotateCw,
  Search as SearchIcon,
  Store,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { useInvoicesList } from '@/hooks/useInvoices';
import { cn, formatCurrency, initials, relativeFromNow } from '@/lib/utils';
import { TERMINAL_STATUSES } from '@/lib/constants';
import type { Invoice } from '@/types/invoice';

interface Vendor {
  key: string;
  name: string;
  supplierId: string | null;
  invoices: Invoice[];
  totalSpend: number;
  openCount: number;
  exceptionCount: number;
  plants: string[];
  lastActivity: string;
}

/**
 * Vendor directory derived from invoice data. The authoritative supplier
 * master (banking, contacts, onboarding) arrives with the Epicor CMS sync
 * (PRD INT-01/02); until then this aggregates what the invoices already know.
 */
export default function VendorsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { invoices, isLoading, isFetching } = useInvoicesList();
  const [q, setQ] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const vendors = useMemo<Vendor[]>(() => {
    const map = new Map<string, Vendor>();
    for (const inv of invoices) {
      const key = inv.supplierId ?? inv.supplierName.trim().toLowerCase();
      let v = map.get(key);
      if (!v) {
        v = {
          key,
          name: inv.supplierName,
          supplierId: inv.supplierId,
          invoices: [],
          totalSpend: 0,
          openCount: 0,
          exceptionCount: 0,
          plants: [],
          lastActivity: inv.updatedAt,
        };
        map.set(key, v);
      }
      v.invoices.push(inv);
      v.totalSpend += Number(inv.totalAmount);
      if (!TERMINAL_STATUSES.includes(inv.status) && inv.status !== 'EXCEPTION') {
        v.openCount++;
      }
      if (inv.status === 'EXCEPTION') v.exceptionCount++;
      if (inv.plantId && !v.plants.includes(inv.plantId)) v.plants.push(inv.plantId);
      if (new Date(inv.updatedAt) > new Date(v.lastActivity)) v.lastActivity = inv.updatedAt;
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [invoices]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.supplierId?.toLowerCase().includes(term) ?? false),
    );
  }, [vendors, q]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((cur) =>
      cur && filtered.some((v) => v.key === cur) ? cur : filtered[0].key,
    );
  }, [filtered]);
  const selected = filtered.find((v) => v.key === selectedKey) ?? null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Vendor Portal</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Supplier directory with spend and invoice history, derived from processed
            invoices.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['invoices'] })}
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

      {/* Master-source note */}
      <div className="flex items-start gap-2.5 rounded-md border border-line bg-white px-3.5 py-2.5 text-[12.5px] text-ink-muted">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          This directory is computed from invoice data. The authoritative supplier master
          (contacts, banking, payment terms) syncs from Epicor CMS when the integrations
          track ships (PRD INT-01/02).
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search vendors by name or supplier ID…"
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

      {!isLoading && vendors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <Store className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">No vendors yet</h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Vendors appear here as invoices flow through the pipeline.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_1fr]">
          {/* Vendor list */}
          <Card className="overflow-hidden">
            <CardContent className="max-h-[64vh] overflow-y-auto px-0">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
                  No vendors match “{q}”.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {filtered.map((v) => (
                    <li key={v.key}>
                      <button
                        onClick={() => setSelectedKey(v.key)}
                        className={cn(
                          'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
                          selectedKey === v.key ? 'bg-brand-50' : 'hover:bg-canvas',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold',
                            selectedKey === v.key
                              ? 'bg-brand text-white'
                              : 'bg-slate-100 text-ink-muted',
                          )}
                        >
                          {initials(v.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold text-ink">
                              {v.name}
                            </p>
                            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                              {formatCurrency(v.totalSpend)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                            {v.invoices.length} invoice{v.invoices.length === 1 ? '' : 's'}
                            {v.supplierId ? ` · ${v.supplierId}` : ''}
                            {v.exceptionCount > 0 ? ` · ${v.exceptionCount} exception` : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Vendor detail */}
          <div className="xl:sticky xl:top-20 xl:self-start">
            {selected ? (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-[13px] font-semibold text-brand">
                        {initials(selected.name)}
                      </span>
                      <div>
                        <h3 className="text-[17px] font-semibold tracking-tight text-ink">
                          {selected.name}
                        </h3>
                        <p className="text-[12.5px] text-ink-muted">
                          {selected.supplierId ?? 'No supplier ID'} · active{' '}
                          {relativeFromNow(selected.lastActivity)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                        Total spend
                      </p>
                      <p className="text-[20px] font-semibold tabular-nums text-ink">
                        {formatCurrency(selected.totalSpend)}
                      </p>
                    </div>
                  </div>

                  {/* Stat strip */}
                  <dl className="grid grid-cols-3 gap-3">
                    <Stat label="Invoices" value={String(selected.invoices.length)} />
                    <Stat label="Open" value={String(selected.openCount)} />
                    <Stat
                      label="Plants"
                      value={selected.plants.length ? selected.plants.join(', ') : '—'}
                      icon={Building2}
                    />
                  </dl>

                  {/* Invoice history */}
                  <div className="rounded-lg border border-line bg-white">
                    <p className="border-b border-line px-4 py-2.5 text-[12.5px] font-semibold text-ink">
                      Invoice history
                    </p>
                    <div className="max-h-[40vh] divide-y divide-line overflow-y-auto">
                      {selected.invoices
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                        )
                        .map((inv) => (
                          <button
                            key={inv.id}
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-ink">
                                {inv.invoiceNumber}
                              </p>
                              <p className="truncate text-[11.5px] text-ink-muted">
                                {inv.poNumber ? `PO ${inv.poNumber} · ` : ''}
                                {relativeFromNow(inv.updatedAt)}
                              </p>
                            </div>
                            <span className="text-[13px] font-semibold tabular-nums text-ink">
                              {formatCurrency(Number(inv.totalAmount), inv.currency)}
                            </span>
                            <StatusBadge status={inv.status} size="sm" />
                          </button>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
                  <Store className="h-8 w-8 text-ink-subtle" />
                  <p className="text-[13.5px] font-medium text-ink">Select a vendor</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Building2;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className="mt-1 truncate text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
