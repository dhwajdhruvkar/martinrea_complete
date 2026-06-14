import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  RotateCw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import { useApprove, useReject } from '@/hooks/useInvoiceMutations';
import { useAuth } from '@/auth/useAuth';
import { canApproveAmount } from '@/lib/permissions';
import { cn, formatCurrency, relativeFromNow } from '@/lib/utils';
import type { Invoice } from '@/types/invoice';

const SLA_HOURS = 48;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { invoices, isLoading, isFetching } = useInvoicesList();
  const approve = useApprove();
  const reject = useReject();

  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [rejectFor, setRejectFor] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');

  const pending = useMemo(
    () => invoices.filter((i) => i.status === 'PENDING_APPROVAL'),
    [invoices],
  );
  const mine = useMemo(
    () => pending.filter((i) => i.currentApproverId === user?.id),
    [pending, user?.id],
  );
  const overdue = useMemo(
    () => pending.filter((i) => (hoursSince(i.pendingApprovalSince) ?? 0) > SLA_HOURS),
    [pending],
  );

  const list = tab === 'mine' ? mine : pending;
  const queueValue = list.reduce((s, i) => s + Number(i.totalAmount), 0);
  const busy = approve.isPending || reject.isPending;

  function doApprove(inv: Invoice) {
    approve.mutate(inv.id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    });
  }

  function submitReject() {
    if (!rejectFor || !reason.trim()) return;
    reject.mutate(
      { id: rejectFor.id, reason: reason.trim() },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['invoices'] });
          setRejectFor(null);
          setReason('');
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            Approval Workflow
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Review invoices routed to you by the rules engine, then approve to advance the
            chain or reject with a reason.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['invoices'] })}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Awaiting you" value={mine.length} icon={ShieldCheck} iconClass="bg-brand-50 text-brand" loading={isLoading} />
        <Kpi label="All pending approval" value={pending.length} icon={Clock} iconClass="bg-yellow-50 text-yellow-700" loading={isLoading} />
        <Kpi label="Value in your queue" value={formatCurrency(mine.reduce((s, i) => s + Number(i.totalAmount), 0))} icon={CheckCircle2} iconClass="bg-emerald-50 text-emerald-600" loading={isLoading} small />
        <Kpi label="Past SLA (48h)" value={overdue.length} icon={AlertTriangle} iconClass="bg-rose-50 text-rose-600" loading={isLoading} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {([['mine', `My queue (${mine.length})`], ['all', `All pending (${pending.length})`]] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all',
                tab === key
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-white text-ink-muted hover:border-brand-200 hover:text-ink',
              )}
            >
              {label}
            </button>
          ),
        )}
        {list.length > 0 && (
          <span className="ml-auto self-center text-[12px] text-ink-muted">
            Queue value: <span className="font-semibold text-ink">{formatCurrency(queueValue)}</span>
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Inbox className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">
                {tab === 'mine' ? 'Nothing awaiting your approval' : 'No invoices pending approval'}
              </h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Invoices land here after a successful 3-way match routes them through the
                approval chain.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((inv) => (
            <ApprovalCard
              key={inv.id}
              invoice={inv}
              isMine={inv.currentApproverId === user?.id}
              canApprove={canApproveAmount(user?.role, Number(inv.totalAmount)) && inv.currentApproverId === user?.id}
              busy={busy}
              onApprove={() => doApprove(inv)}
              onReject={() => {
                setRejectFor(inv);
                setReason('');
              }}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject invoice {rejectFor?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              The invoice returns to the AP clerk for investigation. A reason is required and is
              recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Amount exceeds PO by 14% — confirm with supplier before re-submitting."
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReject} disabled={!reason.trim() || reject.isPending}>
              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
              Reject invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalCard({
  invoice,
  isMine,
  canApprove,
  busy,
  onApprove,
  onReject,
}: {
  invoice: Invoice;
  isMine: boolean;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const chain = invoice.approvalChain ?? [];
  const done = invoice.approvalsCompleted ?? [];
  const waiting = hoursSince(invoice.pendingApprovalSince);
  const overdue = (waiting ?? 0) > SLA_HOURS;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/invoices/${invoice.id}`}
              className="text-[15px] font-semibold tracking-tight text-ink hover:text-brand hover:underline"
            >
              {invoice.invoiceNumber}
            </Link>
            <StatusBadge status={invoice.status} size="sm" />
            {invoice.plantId && (
              <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                {invoice.plantId}
              </span>
            )}
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-700">
                <AlertTriangle className="h-2.5 w-2.5" /> SLA breached
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">
            {invoice.supplierName}
            {invoice.poNumber && <span className="text-ink-subtle"> · PO {invoice.poNumber}</span>}
            {waiting !== null && (
              <span className="text-ink-subtle"> · waiting {relativeFromNow(invoice.pendingApprovalSince)}</span>
            )}
          </p>
          <p className="mt-1.5 text-[11.5px] text-ink-subtle">
            Step {done.length + 1} of {chain.length || 1}
            {' · '}
            {isMine ? 'You are the current approver' : 'Awaiting another approver'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Amount</p>
            <p className="text-[18px] font-semibold tabular-nums text-ink">
              {formatCurrency(Number(invoice.totalAmount), invoice.currency)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={onApprove} disabled={!canApprove || busy} className="gap-1.5">
              <ThumbsUp className="h-4 w-4" />
              Approve
            </Button>
            <Button variant="secondary" onClick={onReject} disabled={!isMine || busy} className="gap-1.5">
              <ThumbsDown className="h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p className={cn('font-semibold leading-tight tracking-tight text-ink', small ? 'text-[17px]' : 'text-[22px]')}>
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
