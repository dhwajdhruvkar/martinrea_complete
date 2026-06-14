-- ============================================================================
-- Row Level Security + role helpers
-- Model: clients get SELECT only on transactional tables; ALL writes flow
-- through SECURITY DEFINER RPCs that enforce role + state-machine rules.
-- ============================================================================

-- Role of the current user, read from profiles. SECURITY DEFINER so it does
-- not recurse through profiles' own RLS policies.
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_plant_id()
returns text
language sql stable security definer set search_path = public as $$
  select plant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_finance_director()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'Finance_Director', false)
$$;

create or replace function public.can_create_invoice()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('AP_Clerk','Finance_Director'), false)
$$;

-- ─── Enable RLS ────────────────────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.invoices            enable row level security;
alter table public.invoice_lines       enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.approval_rules      enable row level security;
alter table public.suppliers           enable row level security;
alter table public.purchase_orders     enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.goods_receipts      enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.notifications       enable row level security;

-- ─── profiles ──────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated with check (public.is_finance_director());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_finance_director())
  with check (public.is_finance_director());

-- ─── invoices / lines / audit (SELECT only; writes via RPC) ─────────────────────
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (is_deleted = false);

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select to authenticated using (true);

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select to authenticated using (true);

-- ─── approval_rules (FD manages, everyone reads) ────────────────────────────────
drop policy if exists rules_select on public.approval_rules;
create policy rules_select on public.approval_rules
  for select to authenticated using (true);

drop policy if exists rules_write on public.approval_rules;
create policy rules_write on public.approval_rules
  for all to authenticated
  using (public.is_finance_director())
  with check (public.is_finance_director());

-- ─── master data caches (read-only to clients; writes via service role/seed) ────
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated using (true);

drop policy if exists po_select on public.purchase_orders;
create policy po_select on public.purchase_orders
  for select to authenticated using (true);

drop policy if exists po_lines_select on public.purchase_order_lines;
create policy po_lines_select on public.purchase_order_lines
  for select to authenticated using (true);

drop policy if exists gr_select on public.goods_receipts;
create policy gr_select on public.goods_receipts
  for select to authenticated using (true);

drop policy if exists gr_lines_select on public.goods_receipt_lines;
create policy gr_lines_select on public.goods_receipt_lines
  for select to authenticated using (true);

-- ─── notifications (own rows) ───────────────────────────────────────────────────
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
