import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DatabaseZap,
  Loader2,
  PlayCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { escalationApi, extractApiError } from '@/lib/api';
import { ROLE_PROFILES } from '@/lib/permissions';
import { useAuth } from '@/auth/useAuth';
import { cn, formatCurrency } from '@/lib/utils';
import { Role } from '@/types/user';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  plant_id: string | null;
  is_active: boolean;
}

interface RuleRow {
  id: string;
  rule_name: string;
  min_amount: number | null;
  max_amount: number | null;
  role_chain: string[];
  priority: number;
  is_active: boolean;
}

const ROLE_OPTIONS = Object.keys(ROLE_PROFILES) as Role[];

export default function AdminPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const profiles = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, plant_id, is_active')
        .order('role', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProfileRow[];
    },
  });

  const rules = useQuery({
    queryKey: ['admin', 'rules'],
    queryFn: async (): Promise<RuleRow[]> => {
      const { data, error } = await supabase
        .from('approval_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RuleRow[];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'profiles'] });
      toast.success('Role updated');
    },
    onError: (e) => toast.error(extractApiError(e, 'Could not update role')),
  });

  const [seeding, setSeeding] = useState(false);
  async function runSeed() {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed', { body: {} });
      if (error) throw error;
      const d = data as { invoices?: number };
      toast.success(`Demo data seeded · ${d?.invoices ?? 0} invoices`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast.error(extractApiError(e, 'Seeding failed (is the edge function deployed?)'));
    } finally {
      setSeeding(false);
    }
  }

  const escalate = useMutation({
    mutationFn: escalationApi.runNow,
    onSuccess: (r) => toast.success(`Escalation run · ${r.escalated} escalated of ${r.checked} checked`),
    onError: (e) => toast.error(extractApiError(e, 'Escalation failed')),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-ink">Admin Panel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage users and roles, review approval routing rules, and run governance operations.
        </p>
      </div>

      {/* Operations */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Settings} title="Operations" />
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={runSeed} disabled={seeding} className="gap-1.5">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              Seed demo data
            </Button>
            <Button variant="secondary" onClick={() => escalate.mutate()} disabled={escalate.isPending} className="gap-1.5">
              {escalate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Run SLA escalation now
            </Button>
          </div>
          <p className="mt-2.5 text-[12px] text-ink-muted">
            Seeding creates the demo accounts + a spread of invoices. Escalation re-notifies
            approvers (and their managers) for invoices past the 48h SLA.
          </p>
        </CardContent>
      </Card>

      {/* Users & roles */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={Users} title="Users & roles" count={profiles.data?.length} />
          {profiles.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : profiles.isError ? (
            <ErrorNote message={extractApiError(profiles.error)} />
          ) : (profiles.data ?? []).length === 0 ? (
            <Empty text="No users yet — run “Seed demo data” to create the demo accounts." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-3 py-2.5">User</th>
                    <th className="px-3 py-2.5">Plant</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {(profiles.data ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-ink">{p.full_name || p.email}</div>
                        <div className="text-[11.5px] text-ink-subtle">{p.email}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{p.plant_id ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', p.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600')}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Select
                          value={p.role}
                          onValueChange={(role) => setRole.mutate({ id: p.id, role: role as Role })}
                          disabled={setRole.isPending || p.id === user?.id}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_PROFILES[r].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-ink-subtle">
                You can't change your own role (prevents accidental lock-out).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval rules */}
      <Card>
        <CardContent className="p-5">
          <SectionHeader icon={ShieldCheck} title="Approval routing rules" count={rules.data?.length} />
          {rules.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rules.isError ? (
            <ErrorNote message={extractApiError(rules.error)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-3 py-2.5">Rule</th>
                    <th className="px-3 py-2.5">Amount band</th>
                    <th className="px-3 py-2.5">Approver chain</th>
                    <th className="px-3 py-2.5">Priority</th>
                    <th className="px-3 py-2.5">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(rules.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 font-medium text-ink">{r.rule_name}</td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {r.min_amount != null ? `> ${formatCurrency(Number(r.min_amount))}` : '—'}
                        {' … '}
                        {r.max_amount != null ? `≤ ${formatCurrency(Number(r.max_amount))}` : 'any'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {r.role_chain.map((role, i) => (
                            <span key={i} className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">
                              {ROLE_PROFILES[role as Role]?.short ?? role}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.priority}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', r.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600')}>
                          {r.is_active ? 'Active' : 'Off'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Settings; title: string; count?: number }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {typeof count === 'number' && (
        <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">{count}</span>
      )}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
      <ScrollText className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[13px] text-ink-muted">{text}</p>;
}
