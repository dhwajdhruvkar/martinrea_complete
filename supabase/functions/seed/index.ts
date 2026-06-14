// Supabase Edge Function: seed demo users + demo invoices.
//
// - Bootstrap mode: callable WITHOUT auth only while no profiles exist yet
//   (so the very first login has accounts to use).
// - Afterwards: requires a Finance_Director bearer token.
//
// Creates the 4 demo accounts (all password "Password123!") and a spread of
// invoices across the lifecycle so the dashboard / queues have realistic data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const PASSWORD = "Password123!";

const DEMO_USERS = [
  { email: "fd@martinrea.dev",    full_name: "Demo Finance Director",        role: "Finance_Director", plant_id: null,      manager: null },
  { email: "pm@martinrea.dev",    full_name: "Demo Plant Manager (PLT-001)", role: "Plant_Manager",    plant_id: "PLT-001", manager: "fd@martinrea.dev" },
  { email: "pm2@martinrea.dev",   full_name: "Demo Plant Manager (PLT-002)", role: "Plant_Manager",    plant_id: "PLT-002", manager: "fd@martinrea.dev" },
  { email: "clerk@martinrea.dev", full_name: "Demo AP Clerk",                role: "AP_Clerk",         plant_id: "PLT-001", manager: "pm@martinrea.dev" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── Authorisation ──────────────────────────────────────────────────────────
  const { count } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });
  const bootstrap = (count ?? 0) === 0;

  if (!bootstrap) {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Auth required (seed already bootstrapped)" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Invalid token" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
    if (prof?.role !== "Finance_Director") {
      return json({ error: "Only Finance_Director may reseed" }, 403);
    }
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  const idByEmail = new Map<string, string>();
  async function ensureUser(email: string, full_name: string, role: string, plant_id: string | null) {
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name, role, plant_id },
    });
    if (created.data?.user) {
      idByEmail.set(email, created.data.user.id);
      return created.data.user.id;
    }
    // Already exists → find it.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((x) => x.email === email);
    if (found) {
      idByEmail.set(email, found.id);
      return found.id;
    }
    throw new Error(`Could not create or find user ${email}: ${created.error?.message}`);
  }

  try {
    for (const u of DEMO_USERS) await ensureUser(u.email, u.full_name, u.role, u.plant_id);

    // Profiles (role/plant/manager) — upsert to be safe across reruns.
    for (const u of DEMO_USERS) {
      const id = idByEmail.get(u.email)!;
      const manager_id = u.manager ? idByEmail.get(u.manager) ?? null : null;
      await admin.from("profiles").upsert({
        id, email: u.email, full_name: u.full_name, role: u.role,
        plant_id: u.plant_id, manager_id, is_active: true,
      });
    }

    const fd = idByEmail.get("fd@martinrea.dev")!;
    const pm1 = idByEmail.get("pm@martinrea.dev")!;
    const pm2 = idByEmail.get("pm2@martinrea.dev")!;
    const clerk = idByEmail.get("clerk@martinrea.dev")!;

    // ── Demo invoices (idempotent: clear prior SEED rows) ──────────────────────
    await admin.from("invoices").delete().eq("ingestion_channel", "SEED");

    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

    type Row = Record<string, unknown>;
    const rows: Row[] = [
      { invoice_number: "INV-50231", supplier_name: "Acme Steel Components", supplier_id: "SUP-ACME", po_number: "PO-100245", total_amount: 12450, currency: "USD", plant_id: "PLT-001", status: "RECEIVED", document_type: "INVOICE", confidence_score: 96, ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50232", supplier_name: "Precision Fasteners Co.", supplier_id: "SUP-PREC", po_number: "PO-100488", total_amount: 3120, currency: "USD", plant_id: "PLT-002", status: "PENDING_REVIEW", document_type: "INVOICE", confidence_score: 72, requires_review: true, review_reason: "Low OCR confidence", ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50233", supplier_name: "Maple Logistics Ltd.", supplier_id: "SUP-MAPLE", po_number: "PO-100377", total_amount: 8800, currency: "CAD", plant_id: "PLT-003", status: "PENDING_MATCH", document_type: "INVOICE", confidence_score: 91, ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50234", supplier_name: "Aceros del Norte SA de CV", supplier_id: "SUP-RAMOS", po_number: "PO-100410", total_amount: 21500, currency: "MXN", plant_id: "PLT-002", status: "PENDING_MATCH", document_type: "CFDI", cfdi_detected: true, cfdi_valid: true, language: "es", confidence_score: 88, ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50235", supplier_name: "Acme Steel Components", supplier_id: "SUP-ACME", po_number: "PO-100245", total_amount: 12450, currency: "USD", plant_id: "PLT-001", status: "PENDING_APPROVAL", document_type: "INVOICE", confidence_score: 97, current_approver_id: pm1, approval_chain: [pm1], approvals_completed: [], pending_approval_since: hoursAgo(6), ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50236", supplier_name: "Northbridge Tooling Inc.", supplier_id: "SUP-NORTH", po_number: "PO-100312", total_amount: 64200, currency: "USD", plant_id: "PLT-001", status: "PENDING_APPROVAL", document_type: "INVOICE", confidence_score: 95, current_approver_id: fd, approval_chain: [fd], approvals_completed: [], pending_approval_since: hoursAgo(60), last_escalated_at: null, ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50237", supplier_name: "Componentes Hermosillo SA", supplier_id: "SUP-HERM", po_number: null, total_amount: 5400, currency: "MXN", plant_id: "PLT-002", status: "PENDING_APPROVAL", document_type: "CFDI", cfdi_detected: true, cfdi_valid: true, language: "es", confidence_score: 84, current_approver_id: pm2, approval_chain: [pm2], approvals_completed: [], pending_approval_since: hoursAgo(2), ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50238", supplier_name: "Acme Steel Components", supplier_id: "SUP-ACME", po_number: "PO-100245", total_amount: 9450, currency: "USD", plant_id: "PLT-001", status: "APPROVED", document_type: "INVOICE", confidence_score: 98, approval_chain: [pm1], approvals_completed: [{ approverId: pm1, decision: "APPROVED", timestamp: hoursAgo(20) }], ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50239", supplier_name: "Northbridge Tooling Inc.", supplier_id: "SUP-NORTH", po_number: "PO-100312", total_amount: 82000, currency: "USD", plant_id: "PLT-001", status: "APPROVED", document_type: "INVOICE", confidence_score: 93, approval_chain: [fd], approvals_completed: [{ approverId: fd, decision: "APPROVED", timestamp: hoursAgo(30) }], ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50240", supplier_name: "Precision Fasteners Co.", supplier_id: "SUP-PREC", po_number: "PO-100488", total_amount: 3120, currency: "USD", plant_id: "PLT-002", status: "REJECTED", document_type: "INVOICE", confidence_score: 70, rejection_reason: "Duplicate of INV-50232", approval_chain: [pm2], approvals_completed: [{ approverId: pm2, decision: "REJECTED", timestamp: hoursAgo(12), notes: "Duplicate" }], ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50241", supplier_name: "Acme Steel Components", supplier_id: "SUP-ACME", po_number: "PO-100245", total_amount: 2800, currency: "USD", plant_id: "PLT-001", status: "EXCEPTION", document_type: "INVOICE", confidence_score: 90, exception_reason_code: "QTY_MISMATCH", review_reason: "Qty overbilled vs goods receipt", ingestion_channel: "SEED", created_by: clerk },
      { invoice_number: "INV-50242", supplier_name: "Maple Logistics Ltd.", supplier_id: "SUP-MAPLE", po_number: "PO-100377", total_amount: 8800, currency: "CAD", plant_id: "PLT-003", status: "RECEIVED", document_type: "INVOICE", confidence_score: 0, ingestion_channel: "SEED", created_by: clerk },
    ];

    // Insert one row at a time: the demo rows have heterogeneous keys, which a
    // single bulk insert (PostgREST) rejects ("all object keys must match").
    const inserted: Array<{ id: string; invoice_number: string; status: string }> = [];
    for (const row of rows) {
      const { data, error: insErr } = await admin
        .from("invoices")
        .insert(row)
        .select("id, invoice_number, status")
        .single();
      if (insErr) throw insErr;
      if (data) inserted.push(data as { id: string; invoice_number: string; status: string });
    }

    // A couple of audit rows so the audit log isn't empty.
    if (inserted?.length) {
      await admin.from("audit_logs").insert(
        inserted.slice(0, 6).map((inv) => ({
          invoice_id: inv.id,
          action_type: "INVOICE_CREATED",
          performed_by: clerk,
          new_value: { status: inv.status, invoiceNumber: inv.invoice_number },
          notes: "Seeded demo invoice",
        })),
      );
    }

    return json({
      ok: true,
      bootstrap,
      users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role, password: PASSWORD })),
      invoices: inserted?.length ?? 0,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
