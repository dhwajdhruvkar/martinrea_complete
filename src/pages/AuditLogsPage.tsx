import { useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Ban,
  CheckCircle2,
  CreditCard,
  FilePlus2,
  Flag,
  GitMerge,
  Loader2,
  RotateCw,
  ScanLine,
  ScrollText,
  Search,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModuleScaffold } from '@/components/layout/ModuleScaffold';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { auditApi, extractApiError, type AuditLogRecord } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { cn, formatDateTime, relativeFromNow } from '@/lib/utils';

/** Turn an axios/query error into a human, status-prefixed message. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ERR_NETWORK') {
      return 'Network/CORS error — the browser could not reach the API.';
    }
    const status = err.response?.status;
    const base = extractApiError(err, 'Request failed');
    if (status === 403) {
      return `HTTP 403 · ${base}. Your role may not be permitted to view audit logs.`;
    }
    if (status === 404) {
      return `HTTP 404 · ${base}. The /audit-logs endpoint was not found.`;
    }
    return status ? `HTTP ${status} · ${base}` : base;
  }
  return extractApiError(err);
}

/* ─── Normalisation onto the requested columns ──────────────────────────── */

interface AuditEntry {
  id: string;
  action: string;
  invoiceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  notes: string | null;
  createdAt: string | null;
}

function displayValue(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Flatten any value to plain text for searching. */
function valueText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  return String(v);
}

function pick(obj: AuditLogRecord, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function nestedInvoiceId(obj: AuditLogRecord): string | null {
  const nested = obj.invoice;
  if (nested && typeof nested === 'object') {
    const o = nested as Record<string, unknown>;
    return displayValue(o.id) ?? displayValue(o.invoiceId);
  }
  return null;
}

function normalize(raw: AuditLogRecord, idx: number): AuditEntry {
  return {
    id: displayValue(pick(raw, ['id', '_id', 'uuid', 'logId', 'auditId'])) ?? `log-${idx}`,
    action:
      displayValue(
        pick(raw, ['action', 'actionType', 'action_type', 'event', 'eventType', 'type', 'operation']),
      ) ?? 'EVENT',
    invoiceId:
      displayValue(pick(raw, ['invoiceId', 'invoice_id', 'entityId', 'resourceId'])) ??
      nestedInvoiceId(raw),
    oldValue: pick(raw, ['oldValue', 'old_value', 'previousValue', 'fromValue', 'oldStatus', 'previousStatus', 'fromStatus']) ?? null,
    newValue: pick(raw, ['newValue', 'new_value', 'toValue', 'newStatus', 'status', 'toStatus']) ?? null,
    notes: displayValue(
      pick(raw, ['notes', 'note', 'detail', 'details', 'message', 'description', 'reason']),
    ),
    createdAt: displayValue(
      pick(raw, ['createdAt', 'created_at', 'timestamp', 'time', 'date', 'at']),
    ),
  };
}

/* ─── Action → visual style (keyword-matched) ───────────────────────────── */

function actionStyle(action: string): { icon: LucideIcon; chip: string } {
  const a = action.toUpperCase();
  if (a.includes('APPROV')) return { icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (a.includes('REJECT')) return { icon: Ban, chip: 'bg-red-50 text-red-700 border-red-200' };
  if (a.includes('EXCEPT') || a.includes('FLAG')) return { icon: Flag, chip: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (a.includes('MATCH')) return { icon: GitMerge, chip: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
  if (a.includes('CREATE')) return { icon: FilePlus2, chip: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (a.includes('OCR') || a.includes('REVIEW')) return { icon: ScanLine, chip: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (a.includes('PAY')) return { icon: CreditCard, chip: 'bg-brand-50 text-brand-700 border-brand-100' };
  if (a.includes('SUBMIT') || a.includes('ROUTE') || a.includes('TRANSITION')) return { icon: Send, chip: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
  return { icon: Activity, chip: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function prettyAction(action: string): string {
  return action.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function AuditLogsPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.auditLogs,
    queryFn: auditApi.list,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('all');

  const entries = useMemo<AuditEntry[]>(() => {
    const list = (query.data ?? []).map(normalize);
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [query.data]);

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (action !== 'all' && e.action !== action) return false;
      if (!term) return true;
      return [
        e.id,
        e.action,
        e.invoiceId ?? '',
        valueText(e.oldValue),
        valueText(e.newValue),
        e.notes ?? '',
      ].some((v) => v.toLowerCase().includes(term));
    });
  }, [entries, search, action]);

  return (
    <ModuleScaffold
      title="Audit Logs"
      description="Inspect a complete, immutable history of every action in the system."
      icon={ScrollText}
    >
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by action, invoice ID, value, or notes…"
                  className="pl-9"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: queryKeys.auditLogs })}
                disabled={query.isFetching}
              >
                {query.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>
            {actions.length > 0 && (
              <div className="-mx-1 flex flex-wrap gap-1.5">
                <Chip active={action === 'all'} onClick={() => setAction('all')} label="All actions" />
                {actions.map((a) => (
                  <Chip key={a} active={action === a} onClick={() => setAction(a)} label={prettyAction(a)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="px-0">
            {query.isLoading ? (
              <div className="space-y-3 px-5 py-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <div className="mx-auto max-w-md py-12 text-center">
                <p className="text-sm font-medium text-ink">Couldn't load the audit trail</p>
                <p className="mt-1.5 text-xs text-ink-muted">{describeError(query.error)}</p>
                <Button variant="secondary" size="sm" className="mt-4" onClick={() => query.refetch()}>
                  <RotateCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">
                {entries.length === 0 ? 'No audit events recorded yet.' : 'No events match your filters.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px] lg:min-w-0 lg:table-fixed">
                <colgroup>
                  <col className="w-[136px]" />
                  <col className="w-[150px]" />
                  <col className="w-[104px]" />
                  <col />
                  <col />
                  <col />
                  <col className="w-[96px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-canvas text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-4 py-3">Created at</th>
                    <th className="px-3 py-3">Action type</th>
                    <th className="px-3 py-3">Invoice ID</th>
                    <th className="px-3 py-3">Old value</th>
                    <th className="px-3 py-3">New value</th>
                    <th className="px-3 py-3">Notes</th>
                    <th className="px-4 py-3">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const style = actionStyle(e.action);
                    const Icon = style.icon;
                    return (
                      <tr key={e.id} className="border-b border-line align-top last:border-0 hover:bg-canvas">
                        <td className="px-4 py-3">
                          {e.createdAt ? (
                            <div className="flex flex-col">
                              <span className="text-ink">{formatDateTime(e.createdAt)}</span>
                              <span className="text-[11px] text-ink-subtle">{relativeFromNow(e.createdAt)}</span>
                            </div>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight', style.chip)}>
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="break-words">{prettyAction(e.action)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {e.invoiceId ? (
                            <Link
                              to={`/invoices/${e.invoiceId}`}
                              className="font-mono text-[12px] text-brand hover:underline"
                              title={e.invoiceId}
                            >
                              {truncateId(e.invoiceId)}
                            </Link>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <ValueCell value={e.oldValue} />
                        </td>
                        <td className="px-3 py-3">
                          <ValueCell value={e.newValue} emphasis />
                        </td>
                        <td className="px-3 py-3 text-ink-muted">
                          <span className="block break-words">{e.notes ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11.5px] text-ink-subtle" title={e.id}>
                            {truncateId(e.id)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!query.isLoading && !query.isError && filtered.length > 0 && (
          <p className="text-[12px] text-ink-muted">
            Showing <span className="font-semibold text-ink">{filtered.length}</span> of {entries.length} events
          </p>
        )}
      </div>
    </ModuleScaffold>
  );
}

/**
 * Renders an audit value. Objects (e.g. {"status":"RECEIVED",...}) are shown as
 * readable key → value rows; primitives render as wrapped text.
 */
function ValueCell({ value, emphasis }: { value: unknown; emphasis?: boolean }) {
  if (value == null || value === '') {
    return <span className="text-ink-subtle">—</span>;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-1.5 text-[12px] leading-snug">
            <span className="text-ink-subtle">{k}:</span>
            <span className={cn('break-all', emphasis ? 'font-medium text-ink' : 'text-ink-muted')}>
              {valueText(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <span className={cn('block break-words', emphasis ? 'font-medium text-ink' : 'text-ink-muted')}>
      {String(value)}
    </span>
  );
}

/** Shorten long UUIDs for table display while keeping the full value in a tooltip. */
function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all',
        active
          ? 'border-brand bg-brand text-white shadow-sm'
          : 'border-line bg-white text-ink-muted hover:border-brand-200 hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
