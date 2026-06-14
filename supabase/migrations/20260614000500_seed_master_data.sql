-- ============================================================================
-- Seed master/reference data (idempotent). Auth users + demo invoices are
-- created by the `seed` edge function (they need the Auth admin API).
-- ============================================================================

-- ─── Approval rules (PRD WF-03 / legacy seed-rules.ts) ───────────────────────────
insert into public.approval_rules (rule_name, description, min_amount, max_amount, role_chain, priority, is_active)
values
  ('Tier-1-PlantManager',   'Invoice <= $50,000 : single approval by Plant Manager', null, 50000, array['Plant_Manager']::public.user_role[], 10, true),
  ('Tier-2-FinanceDirector','Invoice > $50,000 : single approval by Finance Director', 50000, null, array['Finance_Director']::public.user_role[], 20, true)
on conflict (rule_name) do update set
  description = excluded.description,
  min_amount = excluded.min_amount,
  max_amount = excluded.max_amount,
  role_chain = excluded.role_chain,
  priority = excluded.priority,
  is_active = excluded.is_active;

-- ─── Suppliers ───────────────────────────────────────────────────────────────────
insert into public.suppliers (supplier_code, name, country, is_cfdi) values
  ('SUP-ACME',  'Acme Steel Components',     'US', false),
  ('SUP-NORTH', 'Northbridge Tooling Inc.',  'US', false),
  ('SUP-MAPLE', 'Maple Logistics Ltd.',      'CA', false),
  ('SUP-RAMOS', 'Aceros del Norte SA de CV', 'MX', true),
  ('SUP-HERM',  'Componentes Hermosillo SA', 'MX', true),
  ('SUP-PREC',  'Precision Fasteners Co.',   'US', false)
on conflict (supplier_code) do update set name = excluded.name, country = excluded.country, is_cfdi = excluded.is_cfdi;

-- ─── Purchase orders + lines ──────────────────────────────────────────────────────
insert into public.purchase_orders (po_number, supplier_name, plant_id, instance_id, currency, total_amount, status) values
  ('PO-100245', 'Acme Steel Components',     'PLT-001', 'EPICOR-US-01', 'USD', 12450.00, 'OPEN'),
  ('PO-100312', 'Northbridge Tooling Inc.',  'PLT-001', 'EPICOR-US-01', 'USD', 64200.00, 'OPEN'),
  ('PO-100377', 'Maple Logistics Ltd.',      'PLT-003', 'EPICOR-CA-01', 'CAD',  8800.00, 'OPEN'),
  ('PO-100410', 'Aceros del Norte SA de CV', 'PLT-002', 'EPICOR-MX-01', 'MXN', 21500.00, 'OPEN'),
  ('PO-100488', 'Precision Fasteners Co.',   'PLT-002', 'EPICOR-US-01', 'USD',  3120.00, 'OPEN')
on conflict (po_number) do update set total_amount = excluded.total_amount, status = excluded.status;

-- Lines (rebuild deterministically)
delete from public.purchase_order_lines
  where po_id in (select id from public.purchase_orders where po_number in
    ('PO-100245','PO-100312','PO-100377','PO-100410','PO-100488'));

insert into public.purchase_order_lines (po_id, line_no, description, quantity, unit_price, line_total)
select po.id, x.line_no, x.description, x.quantity, x.unit_price, x.line_total
from (values
  ('PO-100245', 1, 'Cold-rolled steel sheet 1.2mm', 500, 18.90, 9450.00),
  ('PO-100245', 2, 'Galvanized brackets',           300, 10.00, 3000.00),
  ('PO-100312', 1, 'CNC tooling die set',             2, 28000.00, 56000.00),
  ('PO-100312', 2, 'Tooling calibration service',     1, 8200.00,  8200.00),
  ('PO-100377', 1, 'Freight & handling',             40, 220.00,  8800.00),
  ('PO-100410', 1, 'Aluminio laminado',             860, 25.00,  21500.00),
  ('PO-100488', 1, 'Hex bolts M8 (box)',            260, 12.00,   3120.00)
) as x(po_number, line_no, description, quantity, unit_price, line_total)
join public.purchase_orders po on po.po_number = x.po_number;

-- ─── Goods receipts + lines (received qty intentionally varies vs PO for demos) ───
delete from public.goods_receipt_lines where gr_id in (select id from public.goods_receipts);
delete from public.goods_receipts where po_number in
  ('PO-100245','PO-100312','PO-100377','PO-100410','PO-100488');

insert into public.goods_receipts (po_number, plant_id, instance_id, received_date) values
  ('PO-100245', 'PLT-001', 'EPICOR-US-01', current_date - 6),
  ('PO-100312', 'PLT-001', 'EPICOR-US-01', current_date - 4),
  ('PO-100377', 'PLT-003', 'EPICOR-CA-01', current_date - 9),
  ('PO-100410', 'PLT-002', 'EPICOR-MX-01', current_date - 3),
  ('PO-100488', 'PLT-002', 'EPICOR-US-01', current_date - 2);

insert into public.goods_receipt_lines (gr_id, line_no, description, ordered_qty, received_qty, unit_price, line_total)
select gr.id, x.line_no, x.description, x.ordered_qty, x.received_qty, x.unit_price, x.line_total
from (values
  ('PO-100245', 1, 'Cold-rolled steel sheet 1.2mm', 500, 500, 18.90, 9450.00),
  ('PO-100245', 2, 'Galvanized brackets',           300, 280, 10.00, 2800.00),  -- short receipt
  ('PO-100312', 1, 'CNC tooling die set',             2,   2, 28000.00, 56000.00),
  ('PO-100312', 2, 'Tooling calibration service',     1,   1, 8200.00,  8200.00),
  ('PO-100377', 1, 'Freight & handling',             40,  40, 220.00,  8800.00),
  ('PO-100410', 1, 'Aluminio laminado',             860, 860, 25.00,  21500.00),
  ('PO-100488', 1, 'Hex bolts M8 (box)',            260, 260, 12.00,   3120.00)
) as x(po_number, line_no, description, ordered_qty, received_qty, unit_price, line_total)
join public.goods_receipts gr on gr.po_number = x.po_number;
