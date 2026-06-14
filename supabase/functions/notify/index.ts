// Supabase Edge Function: optional transactional email.
//
// Sends an HTML email via Resend when RESEND_API_KEY is configured; otherwise
// it is a safe no-op (returns { skipped: true }). The app's approval/escalation
// flows already record in-app notifications in the DB, so email is supplementary.
//
// Body: { to: string, subject: string, html: string }  (requires a bearer token)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Require a valid session.
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Auth required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "Invalid token" }, 401);

  const { to, subject, html } = await req.json().catch(() => ({}));
  if (!to || !subject) return json({ error: "to and subject are required" }, 400);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM") ?? "Martinrea AP <onboarding@resend.dev>";
  if (!apiKey) return json({ skipped: true, reason: "RESEND_API_KEY not configured" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: html ?? subject }),
  });
  if (!res.ok) return json({ error: `Resend error ${res.status}: ${await res.text()}` }, 502);
  return json({ ok: true, id: (await res.json())?.id });
});
