/**
 * Data-access layer — Supabase edition.
 *
 * Preserves the exact public surface the app already consumes (authApi,
 * invoicesApi, escalationApi, auditApi, extractApiError) but routes everything
 * through Supabase: Auth for sign-in, PostgREST for reads, and SECURITY DEFINER
 * RPCs (app_*) for every state-changing operation (the workflow engine lives in
 * Postgres). Invoice rows come back snake_case and are mapped to the camelCase
 * `Invoice` type the UI already uses.
 */
import { supabase } from './supabase';
import type {
  AllowedTransitionsResponse,
  ApprovalRecord,
  ApproveResult,
  CreateInvoicePayload,
  Invoice,
  InvoiceStatus,
} from '@/types/invoice';
import type { AuthUser, LoginResponse, Role } from '@/types/user';

// ─── Error helper (kept signature-compatible with the old axios version) ─────
export function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const e = err as { message?: string; error_description?: string; details?: string; hint?: string };
  return e.message || e.error_description || e.details || e.hint || fallback;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

export function mapInvoice(r: Row): Invoice {
  return {
    id: String(r.id),
    invoiceNumber: (r.invoice_number as string) ?? '',
    supplierName: (r.supplier_name as string) ?? '',
    supplierId: (r.supplier_id as string) ?? null,
    poNumber: (r.po_number as string) ?? null,
    totalAmount: num(r.total_amount),
    currency: (r.currency as string) ?? 'USD',
    status: r.status as InvoiceStatus,
    cfdiValid: (r.cfdi_valid as boolean | null) ?? null,
    ingestionChannel: (r.ingestion_channel as string) ?? null,
    plantId: (r.plant_id as string) ?? null,
    currentApproverId: (r.current_approver_id as string) ?? null,
    approvalChain: (r.approval_chain as string[]) ?? null,
    approvalsCompleted: (r.approvals_completed as ApprovalRecord[]) ?? null,
    rejectionReason: (r.rejection_reason as string) ?? null,
    pendingApprovalSince: (r.pending_approval_since as string) ?? null,
    lastEscalatedAt: (r.last_escalated_at as string) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

function mapProfileToUser(p: Row): AuthUser {
  return {
    id: String(p.id),
    email: (p.email as string) ?? '',
    fullName: (p.full_name as string) ?? (p.email as string) ?? '',
    role: ((p.role as Role) ?? 'AP_Clerk') as Role,
    plantId: (p.plant_id as string) ?? null,
  };
}

/** Throw a clean Error from a Supabase response so callers' toasts read well. */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const session = data.session;
    const user = await authApi.me();
    return { accessToken: session?.access_token ?? '', user };
  },

  me: async (): Promise<AuthUser> => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error('Not authenticated');
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, plant_id')
      .eq('id', uid)
      .single();
    if (error) {
      // Fall back to the auth record if the profile row hasn't propagated yet.
      return {
        id: uid,
        email: auth.user?.email ?? '',
        fullName: (auth.user?.user_metadata?.full_name as string) ?? auth.user?.email ?? '',
        role: ((auth.user?.user_metadata?.role as Role) ?? 'AP_Clerk') as Role,
        plantId: (auth.user?.user_metadata?.plant_id as string) ?? null,
      };
    }
    return mapProfileToUser(profile as Row);
  },

  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
  },
};

// ─── Invoices ────────────────────────────────────────────────────────────────
export const invoicesApi = {
  list: async (): Promise<Invoice[]> => {
    const res = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    return unwrap(res).map(mapInvoice);
  },

  get: async (id: string): Promise<Invoice> => {
    const res = await supabase.from('invoices').select('*').eq('id', id).single();
    return mapInvoice(unwrap(res) as Row);
  },

  create: async (payload: CreateInvoicePayload): Promise<Invoice> => {
    const res = await supabase.rpc('app_create_invoice', { p: payload });
    return mapInvoice(unwrap(res) as Row);
  },

  allowedTransitions: async (id: string): Promise<AllowedTransitionsResponse> => {
    const res = await supabase.rpc('app_allowed_transitions', { p_invoice: id });
    return unwrap(res) as AllowedTransitionsResponse;
  },

  submitReview: async (id: string): Promise<Invoice> => {
    const res = await supabase.rpc('app_submit_review', { p_invoice: id });
    return mapInvoice(unwrap(res) as Row);
  },

  submitMatch: async (id: string): Promise<Invoice> => {
    const res = await supabase.rpc('app_submit_match', { p_invoice: id });
    return mapInvoice(unwrap(res) as Row);
  },

  approve: async (id: string, notes?: string): Promise<ApproveResult> => {
    const res = await supabase.rpc('app_approve', { p_invoice: id, p_notes: notes ?? null });
    const out = unwrap(res) as { invoice: Row; chainComplete: boolean; nextApproverId: string | null };
    return {
      ...mapInvoice(out.invoice),
      chainComplete: out.chainComplete,
      nextApproverId: out.nextApproverId,
    };
  },

  reject: async (id: string, reason: string): Promise<Invoice> => {
    const res = await supabase.rpc('app_reject', { p_invoice: id, p_reason: reason });
    return mapInvoice(unwrap(res) as Row);
  },

  flagException: async (id: string, reasonCode?: string, notes?: string): Promise<Invoice> => {
    const res = await supabase.rpc('app_flag_exception', {
      p_invoice: id,
      p_reason_code: reasonCode ?? null,
      p_notes: notes ?? null,
    });
    return mapInvoice(unwrap(res) as Row);
  },

  resolveException: async (
    id: string,
    to: Extract<InvoiceStatus, 'PENDING_MATCH' | 'REJECTED'>,
    notes?: string,
  ): Promise<Invoice> => {
    const res = await supabase.rpc('app_resolve_exception', {
      p_invoice: id,
      p_to: to,
      p_notes: notes ?? null,
    });
    return mapInvoice(unwrap(res) as Row);
  },

  transition: async (id: string, to: InvoiceStatus, notes?: string): Promise<Invoice> => {
    const res = await supabase.rpc('app_transition', { p_invoice: id, p_to: to, p_notes: notes ?? null });
    return mapInvoice(unwrap(res) as Row);
  },
};

// ─── Escalation ─────────────────────────────────────────────────────────────
export const escalationApi = {
  runNow: async (): Promise<{ checked: number; escalated: number }> => {
    const res = await supabase.rpc('app_run_escalation', { p_sla_hours: 48 });
    return unwrap(res) as { checked: number; escalated: number };
  },
};

// ─── Audit logs ─────────────────────────────────────────────────────────────
export type AuditLogRecord = Record<string, unknown>;

export const auditApi = {
  list: async (): Promise<AuditLogRecord[]> => {
    const res = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    return unwrap(res) as AuditLogRecord[];
  },
};
