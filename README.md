# Martinrea — Accounts Payable Automation (Phase 1)

A standalone, cloud-hosted AP automation suite: capture invoices, OCR them, run
3-way match, route them through a role-based approval workflow with SLA
escalation, and keep an immutable audit trail.

The app is a **React + Vite SPA** that talks **directly to Supabase**
(Auth + Postgres + Storage). There is **no separate API server** — the workflow
engine (state machine, approval routing, audit, escalation) lives in Postgres
functions, and OCR runs **in the browser** (tesseract.js + pdf.js).

```
React SPA (Vercel)
  ├── Supabase Auth ............ email/password sign-in, JWT session
  ├── Supabase Postgres (RLS) .. invoices, lines, audit_logs, profiles,
  │                              approval_rules, suppliers, POs, GRs
  │     └── RPCs (app_*) ........ state machine + rules engine + audit (atomic)
  │     └── pg_cron ............. hourly SLA escalation
  ├── Supabase Storage ......... invoice documents (PDF/JPG/PNG/TIF)
  └── Browser OCR .............. tesseract.js + pdf.js (extract → review → commit)
```

The original laptop-hosted NestJS service is retained, unused, under
`legacy-workflow-service/` for reference only.

---

## Tech stack

- **React 18 + TypeScript** (Vite 5), **React Router v6**, **TanStack Query v5**
- **@supabase/supabase-js** — Auth, PostgREST, RPC, Storage
- **tesseract.js + pdfjs-dist** — in-browser OCR
- **Tailwind CSS** + locally-vendored shadcn-style primitives
- **Recharts** — analytics · **React Hook Form + Zod** · **date-fns** · **sonner**

---

## One-time setup

### 1. Create / connect a Supabase project
Create a project at [supabase.com](https://supabase.com) (or reuse one). You'll
need the **Project URL** and **anon key** (Settings → API).

### 2. Apply the database schema, policies, functions, and seed
Using the Supabase CLI from the repo root:

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push                 # runs everything in supabase/migrations
supabase functions deploy seed notify
```

`supabase/migrations` creates the schema + RLS + workflow RPCs + escalation
(pg_cron) + storage bucket + master-data seed. The `seed` edge function creates
the demo Auth users and a spread of demo invoices.

### 3. Create the demo accounts + demo data
Call the `seed` function once (it's bootstrap-open while no users exist):

```bash
curl -X POST "https://<YOUR_PROJECT_REF>.functions.supabase.co/seed"
```

This creates four accounts (all password `Password123!`):

| Role             | Email                 |
| ---------------- | --------------------- |
| AP Clerk         | `clerk@martinrea.dev` |
| Plant Manager    | `pm@martinrea.dev`    |
| Plant Manager    | `pm2@martinrea.dev`   |
| Finance Director | `fd@martinrea.dev`    |

(You can also click **Admin Panel → Seed demo data** once signed in as the
Finance Director.)

### 4. Configure the frontend
```bash
cp .env.example .env
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev          # http://localhost:5173
```

---

## Deploy to Vercel

The repo is a static SPA build (`npm run build` → `dist/`), with SPA routing
fallback in `vercel.json`.

1. Set Project Environment Variables in Vercel (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Deploy (push to `main`, or `vercel --prod`).

No tunnels, no laptop, no server to keep running — the deployed site reaches
Supabase directly.

---

## Invoice lifecycle

```
RECEIVED → OCR_PROCESSING → PENDING_REVIEW → PENDING_MATCH
        → MATCHED → PENDING_APPROVAL → APPROVED
Off-ramps: → EXCEPTION (resolve to PENDING_MATCH | REJECTED) · → REJECTED → PENDING_REVIEW
```

- **Routing (WF-03):** ≤ $50,000 → Plant Manager; > $50,000 → Finance Director
  (configurable in `approval_rules`, editable from the Admin Panel).
- **Segregation of duties:** only the invoice's `current_approver_id` may
  approve; enforced in the Postgres RPC, not just the UI.
- **CFDI guard (INT-04):** a CFDI with `cfdi_valid = false` cannot advance to
  MATCHED.
- **SLA escalation (WF-05):** `app_run_escalation()` runs hourly via pg_cron and
  notifies the approver + their manager for invoices pending > 48h.

---

## Modules

Dashboard · Invoice Processing · OCR Validation (browser OCR) · Document Viewer ·
2-/3-Way Match · Approval Workflow · Exceptions · Payment Packages · Vendor
Portal · Repository Search · Analytics · Audit Logs · Admin Panel — all
role-gated (see `src/components/layout/nav-items.ts`).

---

## Project layout

```
src/
  lib/
    supabase.ts          # Supabase client
    api.ts               # auth + invoices + audit + escalation (queries + RPC)
    ocr-api.ts           # browser OCR client (extract → commit)
    ocr-engine.ts        # tesseract.js + pdf.js + heuristic invoice parser
    object-storage.ts    # Supabase Storage (list/upload/public URL)
  auth/                  # Supabase-session AuthContext + guards
  hooks/                 # useInvoices, useInvoiceMutations, useOcr, useOci
  pages/                 # all module pages
supabase/
  migrations/            # schema, RLS, workflow RPCs, escalation, seed, storage
  functions/seed         # demo users + demo invoices (service role)
  functions/notify       # optional Resend email (no-op without RESEND_API_KEY)
legacy-workflow-service/ # original NestJS service — reference only, not deployed
```

---

## Scripts

```bash
npm run dev       # vite dev server (5173)
npm run build     # type-check + production build → dist/
npm run preview   # serve dist/ locally
```

## Optional: approval/escalation emails
Deploy the `notify` edge function and set `RESEND_API_KEY` (+ `MAIL_FROM`) in the
function's secrets. Without it, notifications are in-app only (the `notifications`
table + the bell menu) and email is a safe no-op.
