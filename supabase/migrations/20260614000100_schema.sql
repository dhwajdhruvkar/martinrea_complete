-- ============================================================================
-- Martinrea AP Phase 1 — core schema (Supabase / Postgres)
-- Unifies the legacy Sequelize "workflow" model and the Prisma "OCR" model
-- into a single source of truth. All writes go through SECURITY DEFINER RPCs
-- (see 20260614000300_workflow_functions.sql); clients get SELECT via RLS.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum (
    'AP_Clerk', 'Plant_Manager', 'Finance_Director', 'VP_Finance'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum (
    'RECEIVED', 'OCR_PROCESSING', 'PENDING_REVIEW', 'PENDING_MATCH',
    'MATCHED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXCEPTION'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum (
    'INVOICE', 'CFDI', 'RECEIPT', 'PURCHASE_ORDER'
  );
exception when duplicate_object then null; end $$;

-- ─── updated_at helper ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─── profiles (1:1 with auth.users) ───────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.user_role not null default 'AP_Clerk',
  plant_id    text,
  manager_id  uuid references public.profiles(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_plant on public.profiles(plant_id);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever an auth user is created (dashboard / admin API / SQL).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, plant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'AP_Clerk'),
    nullif(new.raw_user_meta_data->>'plant_id', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── suppliers ────────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  supplier_code text unique,
  name          text not null,
  country       text,
  is_cfdi       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ─── purchase_orders + lines (CMS cache for the match workbench) ───────────────
create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_number     text not null unique,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  plant_id      text,
  instance_id   text,
  currency      text not null default 'USD',
  total_amount  numeric(14,2),
  status        text not null default 'OPEN',
  created_at    timestamptz not null default now()
);
create index if not exists idx_po_number on public.purchase_orders(po_number);

create table if not exists public.purchase_order_lines (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references public.purchase_orders(id) on delete cascade,
  line_no     int,
  description text,
  quantity    numeric(14,4),
  unit_price  numeric(14,4),
  line_total  numeric(14,2)
);
create index if not exists idx_po_lines_po on public.purchase_order_lines(po_id);

-- ─── goods_receipts + lines ────────────────────────────────────────────────────
create table if not exists public.goods_receipts (
  id            uuid primary key default gen_random_uuid(),
  po_number     text not null,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  plant_id      text,
  instance_id   text,
  received_date date,
  created_at    timestamptz not null default now()
);
create index if not exists idx_gr_po on public.goods_receipts(po_number);

create table if not exists public.goods_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  gr_id        uuid not null references public.goods_receipts(id) on delete cascade,
  line_no      int,
  description  text,
  ordered_qty  numeric(14,4),
  received_qty numeric(14,4),
  unit_price   numeric(14,4),
  line_total   numeric(14,2)
);
create index if not exists idx_gr_lines_gr on public.goods_receipt_lines(gr_id);

-- ─── approval_rules (WF-03 routing) ────────────────────────────────────────────
create table if not exists public.approval_rules (
  id          uuid primary key default gen_random_uuid(),
  rule_name   text not null unique,
  description text,
  min_amount  numeric(14,2),
  max_amount  numeric(14,2),
  role_chain  public.user_role[] not null,
  priority    int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── invoices (unified superset: workflow + OCR) ───────────────────────────────
create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  invoice_number        text,
  supplier_name         text,
  supplier_id           text,
  po_number             text,
  currency              text not null default 'USD',
  subtotal              numeric(14,2),
  tax_amount            numeric(14,2),
  total_amount          numeric(14,2) not null default 0,
  status                public.invoice_status not null default 'RECEIVED',
  document_type         public.document_type not null default 'INVOICE',
  language              text,
  cfdi_detected         boolean not null default false,
  cfdi_valid            boolean,
  confidence_score      numeric not null default 0,
  requires_review       boolean not null default false,
  review_reason         text,
  ingestion_channel     text,
  plant_id              text,
  current_approver_id   uuid references public.profiles(id) on delete set null,
  approval_chain        jsonb,
  approvals_completed   jsonb,
  rejection_reason      text,
  exception_reason_code text,
  pending_approval_since timestamptz,
  last_escalated_at     timestamptz,
  file_path             text,
  original_filename     text,
  mime_type             text,
  file_size             int,
  raw_ocr_text          text,
  created_by            uuid references public.profiles(id) on delete set null,
  is_deleted            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_invoices_number on public.invoices(invoice_number);
create index if not exists idx_invoices_supplier on public.invoices(supplier_name);
create index if not exists idx_invoices_po on public.invoices(po_number);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_approver on public.invoices(current_approver_id);
create index if not exists idx_invoices_created on public.invoices(created_at desc);
create index if not exists idx_invoices_requires_review on public.invoices(requires_review);

drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  line_no     int,
  description text,
  quantity    numeric(14,4),
  unit_price  numeric(14,4),
  line_total  numeric(14,2)
);
create index if not exists idx_invoice_lines_invoice on public.invoice_lines(invoice_id);

-- ─── audit_logs (append-only) ──────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid references public.invoices(id) on delete set null,
  action_type text not null,
  performed_by uuid references public.profiles(id) on delete set null,
  old_value   jsonb,
  new_value   jsonb,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_invoice on public.audit_logs(invoice_id);
create index if not exists idx_audit_action on public.audit_logs(action_type);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- Enforce append-only at the DB level (PRD DAT-04).
create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only (UPDATE/DELETE not permitted)';
end $$;

drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- ─── notifications (in-app) ────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  type       text not null default 'INFO',
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, is_read);
