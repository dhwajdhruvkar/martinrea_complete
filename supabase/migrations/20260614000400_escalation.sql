-- ============================================================================
-- WF-05 SLA escalation. Finds invoices stuck in PENDING_APPROVAL beyond the
-- SLA window, raises an in-app notification to the approver + their manager,
-- logs an SLA_BREACH audit event, and stamps last_escalated_at so it doesn't
-- re-fire until another full window passes. Scheduled hourly via pg_cron.
-- ============================================================================

create or replace function public.app_run_escalation(p_sla_hours int default 48)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - make_interval(hours => p_sla_hours);
  inv public.invoices;
  approver public.profiles;
  mgr public.profiles;
  checked int := 0;
  escalated int := 0;
begin
  -- Only Finance_Director (interactive) or the cron/service context (no auth.uid()) may run.
  if auth.uid() is not null and not public.is_finance_director() then
    raise exception 'Only Finance_Director may trigger escalation' using errcode='42501';
  end if;

  for inv in
    select * from public.invoices
    where status = 'PENDING_APPROVAL'
      and pending_approval_since < cutoff
      and (last_escalated_at is null or last_escalated_at < cutoff)
  loop
    checked := checked + 1;
    if inv.current_approver_id is null then continue; end if;

    select * into approver from public.profiles where id = inv.current_approver_id;
    if not found then continue; end if;

    insert into public.notifications(user_id, invoice_id, type, title, body)
    values (approver.id, inv.id, 'SLA_ESCALATION',
      'ACTION REQUIRED: invoice ' || coalesce(inv.invoice_number,'') || ' pending > ' || p_sla_hours || 'h',
      'This invoice has breached the approval SLA and has been escalated.');

    if approver.manager_id is not null then
      select * into mgr from public.profiles where id = approver.manager_id;
      if found then
        insert into public.notifications(user_id, invoice_id, type, title, body)
        values (mgr.id, inv.id, 'SLA_ESCALATION',
          'Escalation: invoice ' || coalesce(inv.invoice_number,'') || ' awaiting ' || approver.full_name,
          'An invoice assigned to your report has breached the approval SLA.');
      end if;
    end if;

    update public.invoices set last_escalated_at = now() where id = inv.id;

    perform public._audit(inv.id, 'SLA_BREACH', null, null,
      jsonb_build_object('slaHours', p_sla_hours, 'approverId', approver.id,
                         'approverEmail', approver.email, 'escalatedTo', approver.manager_id),
      'SLA escalation dispatched');
    escalated := escalated + 1;
  end loop;

  return jsonb_build_object('checked', checked, 'escalated', escalated);
end $$;

grant execute on function public.app_run_escalation(int) to authenticated;

-- ─── Schedule hourly via pg_cron (best-effort; ignore if extension unavailable) ──
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('martinrea-sla-escalation')
    where exists (select 1 from cron.job where jobname = 'martinrea-sla-escalation');
  perform cron.schedule('martinrea-sla-escalation', '0 * * * *',
    $cron$ select public.app_run_escalation(48); $cron$);
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
