# Handoff — Workflow & Approvals (Aman)

**From:** Dhwaj (UI/UX Track A — frontend)
**Date:** 12 Jun 2026
**Subject:** Frontend is fully integrated with the unified workflow+OCR service. Your code is untouched; your services are now consumed by a new OCR→workflow bridge. Details + a few asks below.

---

## TL;DR

- The frontend (login, Dashboard, Invoice Processing, Match, Approvals actions, Exceptions, Payments, Vendors, Search) now runs entirely against the unified service — your routes at `/api/*`, the merged OCR app at `/api/ocr/*`, one JWT. The old "two backends, two logins" problem is gone.
- **Zero changes were made to your modules** (`src/invoices`, `src/auth`, `src/common`, `src/rules-engine`, `src/notifications`, `src/escalation`).
- A new **bridge inside the OCR module** calls your exported `InvoicesService` after a human-verified OCR commit, so verified invoices now flow into YOUR pipeline automatically at `PENDING_MATCH`.

## How your services are being consumed (the bridge)

When a reviewer saves a verified invoice (`POST /api/ocr/invoices/commit`), the OCR module now does, in-process:

1. `InvoicesService.create(...)` — your invoice is created at `RECEIVED` with:
   - `ingestionChannel: 'PORTAL'`
   - `plantId`: the committing user's plant (from the JWT)
   - Fallbacks when OCR fields are missing: `invoiceNumber: OCR-<first8-of-ocr-id>`, `supplierName: 'Unknown supplier (OCR)'`, `totalAmount: 0`
   - `cfdiValid: null` — CFDI docs aren't SAT-validated yet (Manav's INT-04), and `null` correctly passes your CFDI guard
2. Three legal transitions through **your state machine**, each audited:
   `RECEIVED → OCR_PROCESSING → PENDING_REVIEW → PENDING_MATCH`
   with notes `"Auto-bridge from verified OCR commit <ocrInvoiceId>"`, performed by the committing user.
3. Failures are caught — a bridge error never breaks the OCR commit; it's logged + audited.

### What you'll observe in your data

- New invoices appearing at `PENDING_MATCH` with channel `PORTAL`.
- `Audit_Logs` rows for the three auto-transitions per bridged invoice. Expected — not a bug.
- From there your existing flow is in charge: `submit-match` → WF-03 rules engine → approval chain → WF-04/05 notifications + escalation.

### Verified end-to-end (live run)

upload → OCR extract → human review/correct → commit → **workflow invoice at `PENDING_MATCH`** → `POST /invoices/:id/submit-match` → **`PENDING_APPROVAL`** with the correct chain from your seeded rules (Tier-1 → Plant Manager for a $108 invoice). Segregation of duties intact.

## Frontend behaviors that touch your API (FYI)

- `GET /invoices` is called with `?limit=200` (your `QueryInvoicesDto` max) so list pages don't cut off at the default 20.
- Exception resolution UI uses your **generic** `POST /invoices/:id/transitions` (`EXCEPTION → PENDING_MATCH | REJECTED`). Since that endpoint is `Finance_Director`-only, the buttons are FD-gated in the UI; clerks see the queue read-only.
- Demo accounts and roles are unchanged (`clerk/pm/pm2/fd@martinrea.dev` / `Password123!`).

## Asks (small, prioritized)

1. **`resolve-exception` endpoint** — a role-appropriate way for AP supervisors (not just FD) to move `EXCEPTION → PENDING_MATCH` with a note, instead of the FD-only break-glass transitions route.
2. **Reason codes on `flag-exception`** — PRD UI-B-04 wants `{ reasonCode: 'PRICE_VARIANCE' | 'QTY_MISMATCH' | 'DUPLICATE_INVOICE' | 'MISSING_PO' | 'OTHER', notes }`. Today the endpoint takes no body.
3. **Deployment** — when you expose the unified service on a tunnel, the frontend needs just that one host (its `/api/*` and `/ocr-api/* → /api/ocr/*` rewrites are already shaped for a single origin).

## Local-environment notes (this machine)

- Service runs on **PORT=3002** locally (3001 was taken); Postgres via embedded binaries (no Docker available); `MAIL_ENABLED=false`; **Redis not running** — your WF-04/05 features no-op locally but the code paths are untouched.
- We copied the 24 invoices from your remote instance's DB into the local one (approver IDs remapped by email), so the team demos against familiar data.
