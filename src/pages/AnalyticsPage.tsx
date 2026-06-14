import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoicesList } from '@/hooks/useInvoices';
import { PIPELINE_ORDER, STATUS_META } from '@/lib/constants';
import { cn, formatCompactNumber, formatCurrency } from '@/lib/utils';
import type { InvoiceStatus } from '@/types/invoice';

const CHART_STATUSES: InvoiceStatus[] = [...PIPELINE_ORDER, 'REJECTED', 'EXCEPTION'];

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function AnalyticsPage() {
  const qc = useQueryClient();
  const { invoices, isLoading, isFetching } = useInvoicesList();

  const stats = useMemo(() => {
    const total = invoices.length;
    const approved = invoices.filter((i) => i.status === 'APPROVED');
    const approvedValue = approved.reduce((s, i) => s + Number(i.totalAmount), 0);
    const exceptions = invoices.filter((i) => i.status === 'EXCEPTION').length;
    const inFlight = invoices.filter(
      (i) => !['APPROVED', 'REJECTED'].includes(i.status),
    ).length;
    const exceptionRate = total ? Math.round((exceptions / total) * 100) : 0;

    const byStatus = CHART_STATUSES.map((status) => ({
      status,
      label: STATUS_META[status].short,
      count: invoices.filter((i) => i.status === status).length,
      color: STATUS_META[status].color,
    }));

    const plantMap = new Map<string, number>();
    for (const i of invoices) {
      const k = i.plantId || 'Unassigned';
      plantMap.set(k, (plantMap.get(k) ?? 0) + Number(i.totalAmount));
    }
    const byPlant = [...plantMap.entries()]
      .map(([plant, value]) => ({ plant, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Throughput: invoices created per day for the last 14 days.
    const days: { day: string; label: string; count: number }[] = [];
    for (let d = 13; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      days.push({
        day: key,
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: 0,
      });
    }
    const dayIndex = new Map(days.map((d, idx) => [d.day, idx]));
    for (const i of invoices) {
      const idx = dayIndex.get(dayKey(i.createdAt));
      if (idx !== undefined) days[idx].count += 1;
    }

    return { total, approvedValue, exceptions, inFlight, exceptionRate, byStatus, byPlant, days };
  }, [invoices]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Pipeline health, throughput, and exception trends across all invoices.
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total invoices" value={formatCompactNumber(stats.total)} icon={BarChart3} iconClass="bg-brand-50 text-brand" loading={isLoading} />
        <Kpi label="Approved value" value={formatCurrency(stats.approvedValue)} icon={CheckCircle2} iconClass="bg-emerald-50 text-emerald-600" loading={isLoading} small />
        <Kpi label="In-flight" value={stats.inFlight} icon={Activity} iconClass="bg-sky-50 text-sky-600" loading={isLoading} />
        <Kpi label="Exception rate" value={`${stats.exceptionRate}%`} icon={AlertTriangle} iconClass="bg-rose-50 text-rose-600" loading={isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pipeline distribution" subtitle="Invoices by lifecycle status" loading={isLoading}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.byStatus} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.byStatus.map((d) => (
                  <Cell key={d.status} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Value by plant" subtitle="Total invoice value per plant" loading={isLoading}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.byPlant} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef0f3" />
              <XAxis type="number" tickFormatter={(v) => formatCompactNumber(v as number)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="plant" width={90} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="value" fill="#1e3a8a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Intake throughput" subtitle="Invoices received per day (last 14 days)" loading={isLoading}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={stats.days} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={1} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  loading,
  children,
}: {
  title: string;
  subtitle: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <p className="text-[12px] text-ink-muted">{subtitle}</p>
        </div>
        {loading ? <Skeleton className="h-[240px] w-full" /> : children}
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
  icon: typeof BarChart3;
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
