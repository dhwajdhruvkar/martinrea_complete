import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock,
  DollarSign,
  FileWarning,
  GitMerge,
  Loader2,
  RotateCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { useInvoicesList } from '@/hooks/useInvoices';
import { useForceTransition } from '@/hooks/useInvoiceMutations';
import { useAuth } from '@/auth/useAuth';
import { profileFor } from '@/lib/permissions';
import { cn, formatCurrency, formatDate, relativeFromNow } from '@/lib/utils';
import { PLANTS } from '@/lib/constants';
import type { Invoice } from '@/types/invoice';

/**
 * Exceptions workbench (PRD UI-B-04): invoices flagged with discrepancies sit
 * in EXCEPTION until a supervisor resolves them. Per the WF-02 state machine,
 * EXCEPTION -> PENDING_MATCH (retry the match) or -> REJECTED. The generic
 * transitions endpoint is Finance_Director-only, so resolution actions are
 * gated to FD; everyone else triages read-only.
 */
export default function ExceptionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canResolve = profileFor(user?.role)?.canForceTransition ?? false;

  const { invoices, isLoading, isFetching } = useInvoicesList();
  const forceTransition = useForceTransition();

  const exceptions = useMemo(
    () => invoices.filter((i) => i.status === 'EXCEPTION'),
    [invoices],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (exceptions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) =>
      cur && exceptions.some((i) => i.id === cur) ? cur : exceptions[0].id,
    );
  }, [exceptions]);
  const selected = exceptions.find((i) => i.id === selectedId) ?? null;

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  const heldValue = exceptions.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const oldest = exceptions.reduce<Invoice | null>(
    (acc, i) =>
      !acc || new Date(i.updatedAt).getTime() < new Date(acc.updatedAt).getTime() ? i : acc,
    null,
  );

  function resolveToMatch(id: string) {
    forceTransition.mutate({
      id,
      to: 'PENDING_MATCH',
      notes: 'Exception resolved - returned to matching',
    });
  }

  function confirmReject() {
    if (!selected) return;
    forceTransition.mutate(
      {
        id: selected.id,
        to: 'REJECTED',
        notes: rejectNotes.trim() || 'Rejected from exception queue',
      },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectNotes('');
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Exceptions</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Triage invoices that failed validation, matching, or approval rules. Resolved
            exceptions return to matching; unrecoverable ones are rejected.
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
          label="Open exceptions"
          value={exceptions.length}
          icon={FileWarning}
          iconClass="bg-rose-50 text-rose-600"
          loading={isLoading}
        />
        <Kpi
          label="Value held"
          value={formatCurrency(heldValue)}
          icon={DollarSign}
          iconClass="bg-amber-50 text-amber-700"
          loading={isLoading}
          small
        />
        <Kpi
          label="Oldest exception"
          value={oldest ? relativeFromNow(oldest.updatedAt) : '—'}
          icon={Clock}
          iconClass="bg-slate-100 text-ink-muted"
          loading={isLoading}
          small
        />
      </div>

      {!isLoading && exceptions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">No open exceptions</h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Nothing is held up right now. Discrepancies flagged from the Match workbench
                land here for supervisor resolution.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/match">
                Go to matching
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_1fr]">
          {/* Queue */}
          <Card className="overflow-hidden">
            <CardContent className="max-h-[64vh] overflow-y-auto px-0">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {exceptions.map((inv) => (
                    <li key={inv.id}>
                      <button
                        onClick={() => setSelectedId(inv.id)}
                        className={cn(
                          'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
                          selectedId === inv.id ? 'bg-rose-50/70' : 'hover:bg-canvas',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                            selectedId === inv.id
                              ? 'bg-rose-500 text-white'
                              : 'bg-rose-50 text-rose-600',
                          )}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold text-ink">
                              {inv.invoiceNumber}
                            </p>
                            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                              {formatCurrency(Number(inv.totalAmount), inv.currency)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                            {inv.supplierName}
                            {inv.poNumber ? ` · PO ${inv.poNumber}` : ''}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink-subtle">
                            Held {relativeFromNow(inv.updatedAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Detail + resolution */}
          <div className="xl:sticky xl:top-20 xl:self-start">
            {selected ? (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/invoices/${selected.id}`}
                          className="text-[17px] font-semibold tracking-tight text-ink hover:text-brand hover:underline"
                        >
                          {selected.invoiceNumber}
                        </Link>
                        <StatusBadge status={selected.status} size="sm" />
                        {selected.cfdiValid === false && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            <AlertTriangle className="h-3 w-3" />
                            CFDI invalid
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] text-ink-muted">
                        {selected.supplierName}
                        {selected.poNumber && (
                          <span className="text-ink-subtle"> · PO {selected.poNumber}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                        Amount
                      </p>
                      <p className="text-[20px] font-semibold tabular-nums text-ink">
                        {formatCurrency(Number(selected.totalAmount), selected.currency)}
                      </p>
                    </div>
                  </div>

                  {/* Facts */}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg border border-line bg-white p-3.5 sm:grid-cols-3">
                    <Fact
                      icon={Building2}
                      label="Plant"
                      value={
                        PLANTS.find((p) => p.id === selected.plantId)?.name ??
                        selected.plantId ??
                        '—'
                      }
                    />
                    <Fact
                      icon={Clock}
                      label="Flagged"
                      value={formatDate(selected.updatedAt)}
                    />
                    <Fact
                      icon={GitMerge}
                      label="Channel"
                      value={selected.ingestionChannel ?? '—'}
                    />
                  </dl>

                  {/* Resolution guidance */}
                  <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Per the workflow state machine, an exception can be{' '}
                      <strong>returned to matching</strong> once the discrepancy is corrected,
                      or <strong>rejected</strong> if the invoice is unrecoverable.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {canResolve ? (
                      <>
                        <Button
                          onClick={() => resolveToMatch(selected.id)}
                          disabled={forceTransition.isPending}
                          className="gap-1.5"
                        >
                          <GitMerge className="h-4 w-4" />
                          Return to matching
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => setRejectOpen(true)}
                          disabled={forceTransition.isPending}
                          className="gap-1.5"
                        >
                          <X className="h-4 w-4" />
                          Reject invoice
                        </Button>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Exception resolution requires the Finance Director role. You can review
                        the queue and coordinate the fix.
                      </p>
                    )}
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link to={`/invoices/${selected.id}`}>Full invoice detail →</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
                  <FileWarning className="h-8 w-8 text-ink-subtle" />
                  <p className="text-[13.5px] font-medium text-ink">Select an exception</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject invoice</DialogTitle>
            <DialogDescription>
              Marks {selected?.invoiceNumber} as REJECTED. The note is recorded in the audit
              log.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="exception-reject-notes">Note</Label>
            <Textarea
              id="exception-reject-notes"
              rows={4}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="e.g. Duplicate of INV-2026-002 — vendor double-billed"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={forceTransition.isPending}
            >
              {forceTransition.isPending ? 'Rejecting…' : 'Confirm rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  icon: typeof Clock;
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
                small ? 'text-[17px]' : 'text-[22px]',
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

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="text-[13px] text-ink">{value}</dd>
    </div>
  );
}
