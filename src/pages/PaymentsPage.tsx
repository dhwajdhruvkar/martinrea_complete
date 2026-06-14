import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Loader2,
  PackageOpen,
  RotateCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { useInvoicesList } from '@/hooks/useInvoices';
import { cn, formatCurrency, formatDate, relativeFromNow } from '@/lib/utils';
import { PLANTS } from '@/lib/constants';
import type { Invoice } from '@/types/invoice';

interface VirtualPackage {
  key: string;
  plantId: string | null;
  plantName: string;
  currency: string;
  invoices: Invoice[];
  total: number;
}

/**
 * Payment Packages (PRD APAR-70/71/72): fully APPROVED invoices, grouped into
 * "virtual packages" by plant + currency — the PRD's virtual-grouping concept
 * for treasury payment runs. Phase 1 is read-only: scheduling and mark-as-paid
 * arrive with the payments backend (payment automation is Phase 3 scope).
 */
export default function PaymentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { invoices, isLoading, isFetching } = useInvoicesList();

  const approved = useMemo(
    () => invoices.filter((i) => i.status === 'APPROVED'),
    [invoices],
  );

  const packages = useMemo<VirtualPackage[]>(() => {
    const map = new Map<string, VirtualPackage>();
    for (const inv of approved) {
      const key = `${inv.plantId ?? 'NO-PLANT'}|${inv.currency}`;
      let pkg = map.get(key);
      if (!pkg) {
        pkg = {
          key,
          plantId: inv.plantId,
          plantName:
            PLANTS.find((p) => p.id === inv.plantId)?.name ?? inv.plantId ?? 'Unassigned plant',
          currency: inv.currency,
          invoices: [],
          total: 0,
        };
        map.set(key, pkg);
      }
      pkg.invoices.push(inv);
      pkg.total += Number(inv.totalAmount);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [approved]);

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const inv of approved) {
      totals.set(inv.currency, (totals.get(inv.currency) ?? 0) + Number(inv.totalAmount));
    }
    return Array.from(totals.entries());
  }, [approved]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Payment Packages
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Approved invoices bundled into payment runs for the treasury team, grouped by
            plant and currency.
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

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label="Ready for payment"
          value={approved.length}
          icon={CheckCircle2}
          iconClass="bg-emerald-50 text-emerald-600"
          loading={isLoading}
        />
        <Kpi
          label="Payment runs"
          value={packages.length}
          icon={CreditCard}
          iconClass="bg-brand-50 text-brand"
          loading={isLoading}
        />
        <Kpi
          label="Total approved value"
          value={
            totalsByCurrency.length === 0
              ? formatCurrency(0)
              : totalsByCurrency
                  .map(([cur, amt]) => formatCurrency(amt, cur))
                  .join(' · ')
          }
          icon={DollarSign}
          iconClass="bg-amber-50 text-amber-700"
          loading={isLoading}
          small
        />
      </div>

      {/* Phase note */}
      <div className="flex items-start gap-2.5 rounded-md border border-line bg-white px-3.5 py-2.5 text-[12.5px] text-ink-muted">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          Phase 1 shows payment readiness. Scheduling runs, check/voucher linking, and
          mark-as-paid arrive with the payments backend (Phase 2/3 scope per the PRD).
        </span>
      </div>

      {!isLoading && approved.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <PackageOpen className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">
                Nothing ready for payment yet
              </h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Invoices appear here once they clear the full approval chain. Drive one
                through matching and approvals to see it bundled into a payment run.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/approvals">
                Go to approvals
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {isLoading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)
            : packages.map((pkg) => (
                <Card key={pkg.key} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between border-b border-line bg-canvas/60">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-brand" />
                        {pkg.plantName}
                      </CardTitle>
                      <p className="mt-1 text-sm text-ink-muted">
                        {pkg.invoices.length} invoice{pkg.invoices.length === 1 ? '' : 's'} ·{' '}
                        {pkg.currency}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                        Run total
                      </p>
                      <p className="text-[20px] font-semibold tabular-nums text-ink">
                        {formatCurrency(pkg.total, pkg.currency)}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0">
                    <div className="divide-y divide-line">
                      {pkg.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-ink">
                              {inv.invoiceNumber}
                              <span className="font-normal text-ink-muted">
                                {' '}
                                · {inv.supplierName}
                              </span>
                            </p>
                            <p className="truncate text-[12px] text-ink-muted">
                              {inv.poNumber ? `${inv.poNumber} · ` : ''}
                              approved {relativeFromNow(inv.updatedAt)} ·{' '}
                              {formatDate(inv.updatedAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13.5px] font-semibold tabular-nums text-ink">
                              {formatCurrency(Number(inv.totalAmount), inv.currency)}
                            </p>
                            <div className="mt-0.5 flex justify-end">
                              <StatusBadge status={inv.status} size="sm" />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  iconClass,
  loading,
  small,
}: {
  label: string;
  value: number | string;
  icon: typeof CreditCard;
  iconClass: string;
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4 py-3.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p
              className={cn(
                'font-semibold leading-tight tracking-tight text-ink',
                small ? 'text-[15px]' : 'text-[22px]',
              )}
            >
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
