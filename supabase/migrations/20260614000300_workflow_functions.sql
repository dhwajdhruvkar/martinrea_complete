-- ============================================================================
-- Workflow engine: state machine, rules engine, and transition RPCs.
-- Faithful port of the legacy NestJS InvoicesService / RulesEngineService /
-- state-machine transitions. All functions are SECURITY DEFINER and enforce
-- role + segregation-of-duties internally.
-- ============================================================================

-- ─── State machine ─────────────────────────────────────────────────────────────
create or replace function public._allowed_targets(p_from public.invoice_status)
returns public.invoice_status[]
language sql immutable as $$
  select case p_from
    when 'RECEIVED'         then array['OCR_PROCESSING']::public.invoice_status[]
    when 'OCR_PROCESSING'   then array['PENDING_REVIEW','EXCEPTION']::public.invoice_status[]
    when 'PENDING_REVIEW'   then array['PENDING_MATCH','EXCEPTION']::public.invoice_status[]
    when 'PENDING_MATCH'    then array['MATCHED','EXCEPTION']::public.invoice_status[]
    when 'MATCHED'          then array['PENDING_APPROVAL']::public.invoice_status[]
    when 'PENDING_APPROVAL' then array['APPROVED','REJECTED']::public.invoice_status[]
    when 'APPROVED'         then array[]::public.invoice_status[]
    when 'REJECTED'         then array['PENDING_REVIEW']::public.invoice_status[]
    when 'EXCEPTION'        then array['PENDING_MATCH','REJECTED']::public.invoice_status[]
    else array[]::public.invoice_status[]
  end
$$;

create or replace function public._assert_transition(
  p_from public.invoice_status,
  p_to   public.invoice_status,
  p_cfdi_valid boolean
) returns void language plpgsql immutable as $$
begin
  if not (p_to = any(public._allowed_targets(p_from))) then
    raise exception 'Illegal transition % -> %', p_from, p_to
      using errcode = 'check_violation';
  end if;
  -- PRD INT-04: a CFDI that failed SAT validation may not be matched.
  if p_from = 'PENDING_MATCH' and p_to = 'MATCHED' and p_cfdi_valid is false then
    raise exception 'CFDI validation failed (cfdi_valid=false). SAT compliance required before matching (PRD INT-04).'
      using errcode = 'check_violation';
  end if;
end $$;

create or replace function public._audit(
  p_invoice uuid, p_action text, p_by uuid,
  p_old jsonb, p_new jsonb, p_notes text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(invoice_id, action_type, performed_by, old_value, new_value, notes)
  values (p_invoice, p_action, p_by, p_old, p_new, p_notes);
end $$;

create or replace function public._uid() returns uuid
language plpgsql stable as $$
declare u uuid;
begin
  u := auth.uid();
  if u is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return u;
end $$;

-- ─── Rules engine (WF-03) ──────────────────────────────────────────────────────
-- Returns the ordered approver chain (user ids), the role chain, and rule name.
create or replace function public._compute_chain(p_amount numeric, p_plant text)
returns table(user_chain uuid[], role_chain public.user_role[], rule_name text)
language plpgsql stable security definer set search_path = public as $$
declare
  r           public.approval_rules%rowtype;
  matched     public.approval_rules%rowtype;
  role_item   public.user_role;
  resolved    uuid;
  chain       uuid[] := array[]::uuid[];
begin
  for r in
    select * from public.approval_rules
    where is_active
    order by priority asc, min_amount asc nulls first
  loop
    if (r.min_amount is null or p_amount > r.min_amount)
       and (r.max_amount is null or p_amount <= r.max_amount) then
      matched := r;
      exit;
    end if;
  end loop;

  if matched.id is null then
    raise exception 'No active approval rule matches amount %', p_amount;
  end if;

  foreach role_item in array matched.role_chain loop
    if role_item = 'Plant_Manager' then
      select p.id into resolved from public.profiles p
        where p.role = role_item and p.is_active
          and (p.plant_id is not distinct from p_plant)
        order by p.created_at asc limit 1;
      -- Fallback: any active Plant_Manager if none matches the plant exactly.
      if resolved is null then
        select p.id into resolved from public.profiles p
          where p.role = role_item and p.is_active
          order by p.created_at asc limit 1;
      end if;
    else
      select p.id into resolved from public.profiles p
        where p.role = role_item and p.is_active
        order by p.created_at asc limit 1;
    end if;

    if resolved is null then
      raise exception 'Rule % requires role % but no active user has it', matched.rule_name, role_item;
    end if;
    chain := array_append(chain, resolved);
  end loop;

  return query select chain, matched.role_chain, matched.rule_name;
end $$;

-- ─── Generic transition (used by submit-review, flag-exception, resolve, FD ops) ─
create or replace function public._transition(
  p_invoice uuid, p_to public.invoice_status, p_by uuid,
  p_notes text default null, p_reject text default null, p_meta jsonb default null
) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; from_status public.invoice_status;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice % not found', p_invoice using errcode='no_data_found'; end if;
  from_status := inv.status;

  perform public._assert_transition(from_status, p_to, inv.cfdi_valid);

  if p_to = 'REJECTED' then
    if p_reject is null or length(trim(p_reject)) = 0 then
      raise exception 'A rejectionReason is required when moving to REJECTED';
    end if;
    inv.rejection_reason := p_reject;
  elsif from_status = 'REJECTED' and p_to = 'PENDING_REVIEW' then
    inv.rejection_reason := null;
  end if;

  inv.status := p_to;
  update public.invoices set
    status = inv.status,
    rejection_reason = inv.rejection_reason,
    updated_at = now()
  where id = p_invoice
  returning * into inv;

  perform public._audit(
    p_invoice, 'INVOICE_STATE_TRANSITION', p_by,
    jsonb_build_object('status', from_status),
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('status', p_to)
      || case when p_reject is not null then jsonb_build_object('rejectionReason', p_reject) else '{}'::jsonb end,
    p_notes
  );
  return inv;
end $$;

-- ─── allowed-transitions ────────────────────────────────────────────────────────
create or replace function public.app_allowed_transitions(p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice % not found', p_invoice using errcode='no_data_found'; end if;
  return jsonb_build_object(
    'id', inv.id,
    'currentStatus', inv.status,
    'allowedTransitions', to_jsonb(public._allowed_targets(inv.status))
  );
end $$;

-- ─── create invoice (manual) ────────────────────────────────────────────────────
create or replace function public.app_create_invoice(p jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; uid uuid;
begin
  uid := public._uid();
  if not public.can_create_invoice() then
    raise exception 'Your role may not create invoices' using errcode='42501';
  end if;

  insert into public.invoices(
    invoice_number, supplier_name, supplier_id, po_number, total_amount,
    currency, cfdi_valid, ingestion_channel, plant_id, status, created_by
  ) values (
    p->>'invoiceNumber',
    p->>'supplierName',
    nullif(p->>'supplierId',''),
    nullif(p->>'poNumber',''),
    coalesce((p->>'totalAmount')::numeric, 0),
    coalesce(nullif(p->>'currency',''), 'USD'),
    case when p ? 'cfdiValid' and p->>'cfdiValid' <> '' then (p->>'cfdiValid')::boolean else null end,
    nullif(p->>'ingestionChannel',''),
    coalesce(nullif(p->>'plantId',''), public.current_plant_id()),
    'RECEIVED', uid
  ) returning * into inv;

  perform public._audit(inv.id, 'INVOICE_CREATED', uid, null,
    jsonb_build_object('status', inv.status, 'invoiceNumber', inv.invoice_number), null);
  return inv;
end $$;

-- ─── OCR commit + bridge to workflow (PENDING_MATCH) ─────────────────────────────
create or replace function public.app_commit_ocr_invoice(p jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; uid uuid; line jsonb; conf numeric; needs_review boolean;
begin
  uid := public._uid();
  if not public.can_create_invoice() then
    raise exception 'Your role may not commit invoices' using errcode='42501';
  end if;

  conf := coalesce((p->>'confidenceScore')::numeric, 0);
  needs_review := conf > 0 and conf < 80;

  insert into public.invoices(
    invoice_number, supplier_name, po_number, currency, subtotal, tax_amount,
    total_amount, confidence_score, requires_review, document_type, language,
    cfdi_detected, cfdi_valid, ingestion_channel, plant_id, file_path,
    original_filename, mime_type, file_size, raw_ocr_text, status, created_by
  ) values (
    coalesce(nullif(p->>'invoiceNumber',''), 'OCR-' || substr(gen_random_uuid()::text,1,8)),
    coalesce(nullif(p->>'supplierName',''), 'Unknown supplier (OCR)'),
    nullif(p->>'poNumber',''),
    coalesce(nullif(p->>'currency',''), 'USD'),
    nullif(p->>'subtotal','')::numeric,
    nullif(p->>'taxAmount','')::numeric,
    coalesce(nullif(p->>'totalAmount','')::numeric, 0),
    conf, needs_review,
    coalesce(nullif(p->>'documentType','')::public.document_type, 'INVOICE'),
    nullif(p->>'language',''),
    coalesce((p->>'cfdiDetected')::boolean, false),
    case when p ? 'cfdiValid' and p->>'cfdiValid' <> '' then (p->>'cfdiValid')::boolean else null end,
    'PORTAL',
    public.current_plant_id(),
    nullif(p->>'filePath',''),
    nullif(p->>'originalFilename',''),
    nullif(p->>'mimeType',''),
    nullif(p->>'fileSize','')::int,
    nullif(p->>'rawOcrText',''),
    'RECEIVED', uid
  ) returning * into inv;

  if p ? 'lineItems' and jsonb_typeof(p->'lineItems') = 'array' then
    for line in select * from jsonb_array_elements(p->'lineItems') loop
      insert into public.invoice_lines(invoice_id, description, quantity, unit_price, line_total)
      values (
        inv.id,
        nullif(line->>'description',''),
        nullif(line->>'quantity','')::numeric,
        nullif(line->>'unitPrice','')::numeric,
        nullif(line->>'lineTotal','')::numeric
      );
    end loop;
  end if;

  perform public._audit(inv.id, 'UPLOAD', uid, null,
    jsonb_build_object('status','RECEIVED','confidence',conf,'requiresReview',needs_review), 'OCR commit');

  -- Bridge through the state machine to PENDING_MATCH (mirrors legacy OCR bridge).
  inv := public._transition(inv.id, 'OCR_PROCESSING', uid, 'Auto-bridge from verified OCR commit');
  inv := public._transition(inv.id, 'PENDING_REVIEW', uid, 'Auto-bridge from verified OCR commit');
  inv := public._transition(inv.id, 'PENDING_MATCH', uid, 'Auto-bridge from verified OCR commit');
  return inv;
end $$;

-- ─── submit-review (PENDING_REVIEW -> PENDING_MATCH) ─────────────────────────────
create or replace function public.app_submit_review(p_invoice uuid)
returns public.invoices language plpgsql security definer set search_path = public as $$
begin
  return public._transition(p_invoice, 'PENDING_MATCH', public._uid(), 'OCR review completed by AP Clerk');
end $$;

-- ─── flag-exception (-> EXCEPTION, with reason code) ─────────────────────────────
create or replace function public.app_flag_exception(
  p_invoice uuid, p_reason_code text default null, p_notes text default null
) returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; uid uuid;
begin
  uid := public._uid();
  inv := public._transition(
    p_invoice, 'EXCEPTION', uid,
    coalesce(p_notes, 'Discrepancy flagged from workbench'),
    null,
    case when p_reason_code is not null then jsonb_build_object('reasonCode', p_reason_code) else null end
  );
  update public.invoices set exception_reason_code = p_reason_code where id = p_invoice returning * into inv;
  return inv;
end $$;

-- ─── resolve-exception (EXCEPTION -> PENDING_MATCH | REJECTED) — supervisors ──────
create or replace function public.app_resolve_exception(
  p_invoice uuid, p_to public.invoice_status, p_notes text default null
) returns public.invoices language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  uid := public._uid();
  if public.current_user_role() not in ('Plant_Manager','Finance_Director','VP_Finance') then
    raise exception 'Only a supervisor may resolve exceptions' using errcode='42501';
  end if;
  if p_to not in ('PENDING_MATCH','REJECTED') then
    raise exception 'Exceptions resolve only to PENDING_MATCH or REJECTED';
  end if;
  return public._transition(p_invoice, p_to, uid, coalesce(p_notes,'Exception resolved'),
    case when p_to = 'REJECTED' then coalesce(p_notes,'Rejected from exception queue') else null end);
end $$;

-- ─── generic transition (FD only break-glass) ────────────────────────────────────
create or replace function public.app_transition(
  p_invoice uuid, p_to public.invoice_status, p_notes text default null
) returns public.invoices language plpgsql security definer set search_path = public as $$
begin
  if not public.is_finance_director() then
    raise exception 'Generic transitions are restricted to Finance_Director' using errcode='42501';
  end if;
  return public._transition(p_invoice, p_to, public._uid(), p_notes,
    case when p_to = 'REJECTED' then coalesce(p_notes,'Force-rejected') else null end);
end $$;

-- ─── submit-match (PENDING_MATCH -> MATCHED -> PENDING_APPROVAL + routing) ────────
create or replace function public.app_submit_match(p_invoice uuid)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; uid uuid; chain uuid[]; roles public.user_role[]; rname text;
begin
  uid := public._uid();

  -- 1. PENDING_MATCH -> MATCHED
  inv := public._transition(p_invoice, 'MATCHED', uid, '3-way match completed - no unresolved discrepancies');

  -- 2. Compute approval chain (WF-03)
  select c.user_chain, c.role_chain, c.rule_name
    into chain, roles, rname
    from public._compute_chain(inv.total_amount, inv.plant_id) c;

  -- 3. MATCHED -> PENDING_APPROVAL, assign first approver
  perform public._assert_transition('MATCHED','PENDING_APPROVAL', inv.cfdi_valid);
  update public.invoices set
    status = 'PENDING_APPROVAL',
    approval_chain = to_jsonb(chain),
    current_approver_id = chain[1],
    approvals_completed = '[]'::jsonb,
    pending_approval_since = now(),
    last_escalated_at = null,
    updated_at = now()
  where id = p_invoice returning * into inv;

  perform public._audit(p_invoice, 'INVOICE_STATE_TRANSITION', uid,
    jsonb_build_object('status','MATCHED'),
    jsonb_build_object('status','PENDING_APPROVAL','rule',rname,'roleChain',to_jsonb(roles),'userChain',to_jsonb(chain)),
    'Routed via rule ' || rname);

  -- 4. Notify first approver (in-app)
  if chain[1] is not null then
    insert into public.notifications(user_id, invoice_id, type, title, body)
    values (chain[1], p_invoice, 'APPROVAL_REQUIRED',
      'Approval required: ' || coalesce(inv.invoice_number,'(no number)'),
      coalesce(inv.supplier_name,'') || ' · ' || inv.currency || ' ' || inv.total_amount::text);
  end if;

  return inv;
end $$;

-- ─── approve (single step; advance chain or APPROVE) ─────────────────────────────
create or replace function public.app_approve(p_invoice uuid, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices; uid uuid; chain uuid[]; idx int; nextid uuid;
  complete boolean; completed jsonb;
begin
  uid := public._uid();
  if public.current_user_role() not in ('Plant_Manager','Finance_Director','VP_Finance') then
    raise exception 'Your role may not approve invoices' using errcode='42501';
  end if;

  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice % not found', p_invoice using errcode='no_data_found'; end if;
  if inv.status <> 'PENDING_APPROVAL' then
    raise exception 'Invoice is in status %, not PENDING_APPROVAL', inv.status using errcode='check_violation';
  end if;
  if inv.current_approver_id is distinct from uid then
    raise exception 'You are not the current required approver (segregation of duties).' using errcode='42501';
  end if;

  chain := coalesce(array(select jsonb_array_elements_text(inv.approval_chain))::uuid[], array[]::uuid[]);
  idx := array_position(chain, uid);
  nextid := case when idx is not null and idx < array_length(chain,1) then chain[idx+1] else null end;
  complete := nextid is null;

  completed := coalesce(inv.approvals_completed,'[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('approverId', uid, 'decision','APPROVED','timestamp', now(), 'notes', p_notes));

  if complete then
    perform public._assert_transition('PENDING_APPROVAL','APPROVED', inv.cfdi_valid);
  end if;

  update public.invoices set
    approvals_completed = completed,
    current_approver_id = nextid,
    pending_approval_since = case when complete then null else now() end,
    last_escalated_at = null,
    status = case when complete then 'APPROVED' else status end,
    updated_at = now()
  where id = p_invoice returning * into inv;

  perform public._audit(p_invoice,
    case when complete then 'INVOICE_STATE_TRANSITION' else 'INVOICE_APPROVAL_STEP' end,
    uid,
    case when complete then jsonb_build_object('status','PENDING_APPROVAL') else null end,
    case when complete then jsonb_build_object('status','APPROVED','approvals',completed)
         else jsonb_build_object('advancedTo', nextid, 'approvals', completed) end,
    p_notes);

  if not complete and nextid is not null then
    insert into public.notifications(user_id, invoice_id, type, title, body)
    values (nextid, p_invoice, 'APPROVAL_REQUIRED',
      'Approval required: ' || coalesce(inv.invoice_number,'(no number)'),
      coalesce(inv.supplier_name,'') || ' · ' || inv.currency || ' ' || inv.total_amount::text);
  end if;

  return jsonb_build_object('invoice', to_jsonb(inv), 'chainComplete', complete, 'nextApproverId', nextid);
end $$;

-- ─── reject (any approver in the chain) ──────────────────────────────────────────
create or replace function public.app_reject(p_invoice uuid, p_reason text)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; uid uuid; chain uuid[]; completed jsonb;
begin
  uid := public._uid();
  if public.current_user_role() not in ('Plant_Manager','Finance_Director','VP_Finance') then
    raise exception 'Your role may not reject invoices' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to reject';
  end if;

  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice % not found', p_invoice using errcode='no_data_found'; end if;
  if inv.status <> 'PENDING_APPROVAL' then
    raise exception 'Invoice is in status %, not PENDING_APPROVAL', inv.status using errcode='check_violation';
  end if;

  chain := coalesce(array(select jsonb_array_elements_text(inv.approval_chain))::uuid[], array[]::uuid[]);
  if array_position(chain, uid) is null then
    raise exception 'Only an approver in the chain may reject this invoice.' using errcode='42501';
  end if;

  completed := coalesce(inv.approvals_completed,'[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('approverId', uid, 'decision','REJECTED','timestamp', now(), 'notes', p_reason));

  perform public._assert_transition('PENDING_APPROVAL','REJECTED', inv.cfdi_valid);
  update public.invoices set
    status = 'REJECTED',
    rejection_reason = p_reason,
    approvals_completed = completed,
    current_approver_id = null,
    updated_at = now()
  where id = p_invoice returning * into inv;

  perform public._audit(p_invoice, 'INVOICE_STATE_TRANSITION', uid,
    jsonb_build_object('status','PENDING_APPROVAL'),
    jsonb_build_object('status','REJECTED','rejectionReason',p_reason,'rejectedBy',uid),
    p_reason);
  return inv;
end $$;

-- ─── grants ──────────────────────────────────────────────────────────────────────
grant execute on function
  public.app_allowed_transitions(uuid),
  public.app_create_invoice(jsonb),
  public.app_commit_ocr_invoice(jsonb),
  public.app_submit_review(uuid),
  public.app_submit_match(uuid),
  public.app_approve(uuid, text),
  public.app_reject(uuid, text),
  public.app_flag_exception(uuid, text, text),
  public.app_resolve_exception(uuid, public.invoice_status, text),
  public.app_transition(uuid, public.invoice_status, text)
to authenticated;
