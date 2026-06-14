import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileText,
  Flag,
  GitBranch,
  GitMerge,
  Loader2,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { useInvoicesList } from '@/hooks/useInvoices';
import { useFlagException, useSubmitMatch } from '@/hooks/useInvoiceMutations';
import { useOciFiles } from '@/hooks/useOci';
import { ociObjectUrl, type OciObject } from '@/lib/object-storage';
import { useAuth } from '@/auth/useAuth';
import { profileFor } from '@/lib/permissions';
import { cn, formatCurrency, relativeFromNow } from '@/lib/utils';
import type { Invoice, InvoiceStatus } from '@/types/invoice';

// ─── Match checks ───────────────────────────────────────────────────────────
type CheckState = 'pass' | 'fail' | 'warn' | 'na';

interface MatchCheck {
  label: string;
  state: CheckState;
  detail: string;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort lookup of the invoice's source document in the storage bucket:
 * a file matches when its normalized name contains the invoice or PO number.
 */
function findSourceDocs(invoice: Invoice, files: OciObject[]): OciObject[] {
  const keys = [invoice.invoiceNumber, invoice.poNumber]
    .filter((v): v is string => !!v)
    .map(normalizeForMatch)
    .filter((k) => k.length >= 4);
  if (keys.length === 0) return [];
  return files.filter((f) => {
    const name = normalizeForMatch(f.name);
    return keys.some((k) => name.includes(k));
  });
}

function buildChecks(invoice: Invoice, sourceDocs: OciObject[]): MatchCheck[] {
  return [
    {
      label: 'Purchase order reference',
      state: invoice.poNumber ? 'pass' : 'fail',
      detail: invoice.poNumber
        ? `PO ${invoice.poNumber} on file — 2-way match possible`
        : 'No PO number captured — cannot reconcile against a purchase order',
    },
    {
      label: 'Supplier identified',
      state: invoice.supplierId ? 'pass' : 'warn',
      detail: invoice.supplierId
        ? `Supplier master record ${invoice.supplierId}`
        : 'No supplier ID — name-only match is weaker evidence',
    },
    {
      label: 'Invoice amount',
      state: Number(invoice.totalAmount) > 0 ? 'pass' : 'fail',
      detail:
        Number(invoice.totalAmount) > 0
          ? `${formatCurrency(Number(invoice.totalAmount), invoice.currency)} stated`
          : 'Amount is zero or missing',
    },
    {
      label: 'CFDI validation (MX)',
      state:
        invoice.cfdiValid === null ? 'na' : invoice.cfdiValid ? 'pass' : 'fail',
      detail:
        invoice.cfdiValid === null
          ? 'Not applicable for this invoice'
          : invoice.cfdiValid
          ? 'Fiscal document validated'
          : 'CFDI invalid — blocks routing to approval',
    },
    {
      label: 'Source document in storage',
      state: sourceDocs.length > 0 ? 'pass' : 'warn',
      detail:
        sourceDocs.length > 0
          ? `${sourceDocs.length} matching file${sourceDocs.length === 1 ? '' : 's'} found in the bucket`
          : 'No bucket file matches the invoice/PO number — verify manually in the Document Viewer',
    },
    {
      label: 'Goods receipt (3-way)',
      state: 'na',
      detail: 'GRN feed not connected yet — match runs as 2-way (invoice ↔ PO)',
    },
  ];
}

// ─── Page ───────────────────────────────────────────────────────────────────
const QUEUE_TABS: { key: InvoiceStatus; label: string }[] = [
  { key: 'PENDING_MATCH', label: 'Pending match' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'EXCEPTION', label: 'Exceptions' },
];

export default function MatchPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canEdit = profileFor(user?.role)?.canEdit ?? false;

  const { invoices, isLoading, isFetching } = useInvoicesList();
  const { data: bucketFiles } = useOciFiles();

  const submitMatch = useSubmitMatch();
  const flagException = useFlagException();

  const [tab, setTab] = useState<InvoiceStatus>('PENDING_MATCH');

  const byStatus = useMemo(() => {
    const map = new Map<InvoiceStatus, Invoice[]>();
    for (const t of QUEUE_TABS) map.set(t.key, []);
    for (const inv of invoices) {
      const bucket = map.get(inv.status);
      if (bucket) bucket.push(inv);
    }
    return map;
  }, [invoices]);

  const queue = byStatus.get(tab) ?? [];

  // Deep link (/match/:id): align the active tab with the routed invoice's
  // status once data is in. Runs per route change, so manual tab switching
  // afterwards isn't fought.
  useEffect(() => {
    if (!routeId) return;
    const inv = invoices.find((i) => i.id === routeId);
    if (inv && QUEUE_TABS.some((t) => t.key === inv.status)) {
      setTab(inv.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, invoices.length]);

  // Landing on bare /match: route to the first invoice in the queue.
  useEffect(() => {
    if (!routeId && queue.length > 0) {
      navigate(`/match/${queue[0].id}`, { replace: true });
    }
  }, [routeId, queue, navigate]);

  function switchTab(next: InvoiceStatus) {
    setTab(next);
    const first = (byStatus.get(next) ?? [])[0];
    navigate(first ? `/match/${first.id}` : '/match', { replace: true });
  }

  // Selection comes from the URL. Searched across ALL invoices (not just the
  // active tab) so deep links keep working after a status transition.
  const selected = invoices.find((i) => i.id === routeId) ?? null;
  const pendingValue = (byStatus.get('PENDING_MATCH') ?? []).reduce(
    (sum, i) => sum + Number(i.totalAmount),
    0,
  );

  const isBusy = submitMatch.isPending || flagException.isPending;

  function runMatch(id: string) {
    submitMatch.mutate(id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    });
  }

  function flag(id: string) {
    flagException.mutate(id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">
            2-Way / 3-Way Match
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Reconcile invoices against purchase orders and source documents, then route them
            for approval or flag discrepancies.
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

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Awaiting match"
          value={(byStatus.get('PENDING_MATCH') ?? []).length}
          icon={GitMerge}
          iconClass="bg-violet-50 text-violet-600"
          loading={isLoading}
        />
        <Kpi
          label="Value in queue"
          value={formatCurrency(pendingValue)}
          icon={GitBranch}
          iconClass="bg-brand-50 text-brand"
          loading={isLoading}
          small
        />
        <Kpi
          label="Matched"
          value={(byStatus.get('MATCHED') ?? []).length}
          icon={CheckCircle2}
          iconClass="bg-cyan-50 text-cyan-600"
          loading={isLoading}
        />
        <Kpi
          label="Exceptions"
          value={(byStatus.get('EXCEPTION') ?? []).length}
          icon={AlertTriangle}
          iconClass="bg-rose-50 text-rose-600"
          loading={isLoading}
        />
      </div>

      {/* Queue tabs */}
      <div className="flex flex-wrap gap-1.5">
        {QUEUE_TABS.map((t) => {
          const count = (byStatus.get(t.key) ?? []).length;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all',
                tab === t.key
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-white text-ink-muted hover:border-brand-200 hover:text-ink',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[10.5px] font-semibold',
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-canvas text-ink-muted',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && queue.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <GitMerge className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">
                {tab === 'PENDING_MATCH'
                  ? 'Nothing waiting for match'
                  : tab === 'MATCHED'
                  ? 'No matched invoices yet'
                  : 'No exceptions'}
              </h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                {tab === 'PENDING_MATCH'
                  ? 'Invoices arrive here after OCR review. Submit one for review from Invoice Processing to feed this queue.'
                  : tab === 'MATCHED'
                  ? 'Run a match on a pending invoice and it will show up here on its way to approval.'
                  : 'Discrepancies flagged during matching will be listed here for AP follow-up.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_1fr]">
          {/* Queue list */}
          <Card className="overflow-hidden">
            <CardContent className="max-h-[64vh] overflow-y-auto px-0">
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {queue.map((inv) => (
                    <li key={inv.id}>
                      <QueueItem
                        invoice={inv}
                        active={routeId === inv.id}
                        onClick={() => navigate(`/match/${inv.id}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Match workbench */}
          <div className="xl:sticky xl:top-20 xl:self-start">
            {selected ? (
              <MatchWorkbench
                invoice={selected}
                bucketFiles={bucketFiles ?? []}
                canEdit={canEdit}
                isBusy={isBusy}
                onRunMatch={() => runMatch(selected.id)}
                onFlagException={() => flag(selected.id)}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
                  <GitMerge className="h-8 w-8 text-ink-subtle" />
                  <p className="text-[13.5px] font-medium text-ink">Select an invoice</p>
                  <p className="max-w-xs text-[12.5px] text-ink-muted">
                    Pick an invoice from the queue to review its match checks.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Workbench panel ────────────────────────────────────────────────────────
function MatchWorkbench({
  invoice,
  bucketFiles,
  canEdit,
  isBusy,
  onRunMatch,
  onFlagException,
}: {
  invoice: Invoice;
  bucketFiles: OciObject[];
  canEdit: boolean;
  isBusy: boolean;
  onRunMatch: () => void;
  onFlagException: () => void;
}) {
  const sourceDocs = useMemo(
    () => findSourceDocs(invoice, bucketFiles),
    [invoice, bucketFiles],
  );
  const checks = useMemo(() => buildChecks(invoice, sourceDocs), [invoice, sourceDocs]);

  const failCount = checks.filter((c) => c.state === 'fail').length;
  const warnCount = checks.filter((c) => c.state === 'warn').length;
  const matchBlocked = invoice.cfdiValid === false;
  const isPending = invoice.status === 'PENDING_MATCH';

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
      {/* Invoice header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/invoices/${invoice.id}`}
              className="text-[17px] font-semibold tracking-tight text-ink hover:text-brand hover:underline"
            >
              {invoice.invoiceNumber}
            </Link>
            <StatusBadge status={invoice.status} size="sm" />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {invoice.supplierName}
            {invoice.poNumber && (
              <span className="text-ink-subtle"> · PO {invoice.poNumber}</span>
            )}
            <span className="text-ink-subtle"> · updated {relativeFromNow(invoice.updatedAt)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Amount
          </p>
          <p className="text-[20px] font-semibold tabular-nums text-ink">
            {formatCurrency(Number(invoice.totalAmount), invoice.currency)}
          </p>
        </div>
      </div>

      {/* Readiness summary */}
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[12.5px]',
          failCount > 0
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : warnCount > 0
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        )}
      >
        {failCount > 0 ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : warnCount > 0 ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>
          {failCount > 0
            ? `${failCount} check${failCount === 1 ? '' : 's'} failing — resolve or flag as an exception.`
            : warnCount > 0
            ? `Checks pass with ${warnCount} warning${warnCount === 1 ? '' : 's'} — review before routing.`
            : 'All checks pass — ready to match and route for approval.'}
        </span>
      </div>

      {/* Checks list */}
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-3 px-3.5 py-2.5">
            <CheckIcon state={check.state} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{check.label}</p>
              <p className="text-[12px] text-ink-muted">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Matched source documents */}
      {sourceDocs.length > 0 && (
        <div className="rounded-lg border border-line bg-white p-3.5">
          <p className="mb-2 text-[12.5px] font-semibold text-ink">Source documents</p>
          <ul className="space-y-1.5">
            {sourceDocs.map((doc) => (
              <li key={doc.name} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-muted">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{doc.name}</span>
                </span>
                <a
                  href={ociObjectUrl(doc.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-brand hover:underline"
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {canEdit ? (
            <>
              <Button
                onClick={onRunMatch}
                disabled={isBusy || matchBlocked}
                title={matchBlocked ? 'CFDI invalid — cannot route to approval' : undefined}
                className="gap-1.5"
              >
                <GitBranch className="h-4 w-4" />
                Run match &amp; route
              </Button>
              <Button
                variant="secondary"
                onClick={onFlagException}
                disabled={isBusy}
                className="gap-1.5"
              >
                <Flag className="h-4 w-4" />
                Flag as exception
              </Button>
            </>
          ) : (
            <p className="text-[12.5px] text-ink-muted">
              Your role can review match checks but not run match actions.
            </p>
          )}
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to={`/invoices/${invoice.id}`}>Full invoice detail →</Link>
          </Button>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function CheckIcon({ state }: { state: CheckState }) {
  switch (state) {
    case 'pass':
      return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
    case 'fail':
      return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />;
    case 'warn':
      return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
    default:
      return <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />;
  }
}

// ─── List + tiles ───────────────────────────────────────────────────────────
function QueueItem({
  invoice,
  active,
  onClick,
}: {
  invoice: Invoice;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
        active ? 'bg-brand-50' : 'hover:bg-canvas',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          active ? 'bg-brand text-white' : 'bg-slate-100 text-ink-muted',
        )}
      >
        <GitMerge className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-ink">
            {invoice.invoiceNumber}
          </p>
          <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
            {formatCurrency(Number(invoice.totalAmount), invoice.currency)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-ink-muted">
          {invoice.supplierName}
          {invoice.poNumber ? ` · PO ${invoice.poNumber}` : ' · no PO'}
        </p>
        {invoice.cfdiValid === false && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1 py-px text-[10px] font-semibold text-rose-700">
            <AlertTriangle className="h-2.5 w-2.5" />
            CFDI invalid
          </span>
        )}
      </div>
    </button>
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
  icon: typeof GitMerge;
  iconClass: string;
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4 py-3.5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconClass,
          )}
        >
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
