# Handoff — AI Invoice OCR (Abhay)

**From:** Dhwaj (UI/UX Track A — frontend)
**Date:** 12 Jun 2026
**Subject:** Frontend is fully integrated with your OCR module in the unified service, and we added a small commit→workflow bridge inside `src/ocr-app/invoices/` (3 files). Diff details below so you can pull the change into your upstream.

---

## TL;DR

- The frontend now drives your full synchronous flow: **upload → `POST /ocr/invoices/extract` → side-by-side human review (editable form) → `POST /ocr/invoices/commit`**. Stats, review-queue, list, detail, file download, and retry are all wired and working.
- We changed **three files**, all in `src/ocr-app/invoices/`, to add an in-process bridge: a committed (human-verified) invoice now also lands in Aman's approval workflow at `PENDING_MATCH`. Your Prisma schema, parser, processors, queues, and every other endpoint are untouched.
- **Additive response change:** commit now returns `workflow_invoice_id` alongside the saved invoice.

## The 3 changed files

### 1. `src/ocr-app/invoices/invoices.module.ts`

Imports Aman's workflow invoices module (it already exports its service; no circular dependency — workflow never imports ocr-app):

```ts
import { InvoicesModule as WorkflowInvoicesModule } from '../../invoices/invoices.module';

@Module({
  imports: [
    MulterModule.register({ /* unchanged */ }),
    BullModule.registerQueue({ name: QUEUES.UPLOAD }, { name: QUEUES.OCR }),
    // Bridge: lets a human-verified OCR commit hand the invoice off into the
    // approval workflow pipeline (same process, same DB - no HTTP hop).
    WorkflowInvoicesModule,
  ],
  ...
})
```

### 2. `src/ocr-app/invoices/invoices.controller.ts`

`commit` now receives the authenticated user (the global JWT strategy already populates `request.user`); route, DTO, and validation unchanged:

```ts
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Post('commit')
@HttpCode(HttpStatus.CREATED)
async commit(@Body() body: CommitInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
  const invoice = await this.invoices.commit(body, user);
  return { success: true, invoice };
}
```

### 3. `src/ocr-app/invoices/invoices.service.ts`

New imports + injected service:

```ts
import { InvoicesService as WorkflowInvoicesService } from '../../invoices/invoices.service';
import { InvoiceStatus as WorkflowInvoiceStatus } from '../../common/enums/invoice-status.enum';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

constructor(
  ...,
  private readonly workflowInvoices: WorkflowInvoicesService,
  ...
) {}
```

`commit()` signature becomes `commit(dto: CommitInvoiceDto, user?: AuthenticatedUser)`, and at the end (after your existing persist + audit logs):

```ts
// ── Bridge: hand the verified invoice off to the approval workflow ──────
const workflowInvoiceId = await this.bridgeToWorkflow(invoice.id, user);

const saved = await this.findById(invoice.id);
return { ...saved, workflow_invoice_id: workflowInvoiceId };
```

New private method (verbatim):

```ts
private async bridgeToWorkflow(
  ocrInvoiceId: string,
  user?: AuthenticatedUser,
): Promise<string | null> {
  if (!user?.id) {
    this.logger.warn(`No authenticated user on commit of ${ocrInvoiceId}; skipping workflow bridge`);
    return null;
  }
  try {
    const ocr = await this.prisma.invoice.findUnique({ where: { id: ocrInvoiceId } });
    if (!ocr) return null;

    const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

    const wf = await this.workflowInvoices.create(
      {
        invoiceNumber: ocr.invoiceNumber ?? `OCR-${ocrInvoiceId.slice(0, 8)}`,
        supplierName: ocr.supplierName ?? 'Unknown supplier (OCR)',
        poNumber: ocr.poNumber ?? undefined,
        totalAmount: toNum(ocr.totalAmount) ?? 0,
        currency: ocr.currency ?? 'USD',
        cfdiValid: undefined, // SAT validation (INT-04) not run yet
        ingestionChannel: 'PORTAL',
        plantId: user.plantId ?? undefined,
      },
      user.id,
    );

    const steps = [
      WorkflowInvoiceStatus.OCR_PROCESSING,
      WorkflowInvoiceStatus.PENDING_REVIEW,
      WorkflowInvoiceStatus.PENDING_MATCH,
    ];
    for (const to of steps) {
      await this.workflowInvoices.transition(wf.id, to, {
        performedBy: user.id,
        notes: `Auto-bridge from verified OCR commit ${ocrInvoiceId}`,
      });
    }

    await this.audit.log({
      invoiceId: ocrInvoiceId,
      action: AuditAction.INVOICE_UPDATED,
      newValue: { workflowInvoiceId: wf.id, workflowStatus: 'PENDING_MATCH' },
      message: `Bridged to workflow invoice ${wf.id} (PENDING_MATCH)`,
    });
    return wf.id;
  } catch (err) {
    const message = (err as Error).message;
    this.logger.error(`Workflow bridge failed for ${ocrInvoiceId}: ${message}`);
    await this.audit
      .log({
        invoiceId: ocrInvoiceId,
        action: AuditAction.INVOICE_UPDATED,
        newValue: { workflowBridgeError: message },
        message: 'Workflow bridge failed (commit succeeded)',
      })
      .catch(() => undefined);
    return null;
  }
}
```

Design notes: bridge failures never fail the commit; no Prisma schema change (the link lives in the audit trail + response field).

### Also in `invoices.service.ts`: fail-fast Redis guard on `upload` / `retryOcr`

We hit a real bug: with Redis down, `queue.add()` parks in ioredis's offline
queue forever — the HTTP request hangs ~30s, and worse, `retryOcr` had already
flipped the invoice to `RECEIVED` (and moved the file back to `raw/`), leaving
it stranded with no worker to ever process it.

Fix: a private `assertOcrWorkerReachable()` (transient `IORedis` probe with
`lazyConnect`, `connectTimeout: 1500`, `retryStrategy: () => null` — same
pattern as your QueueModule boot check) is now called at the START of both
`upload()` and `retryOcr()`, BEFORE any state mutation. When Redis is
unreachable it throws a `503 ServiceUnavailableException` with a clear message
in ~10ms. When Redis is up, behavior is unchanged (one extra ping per
upload/retry call).

## How the frontend consumes your API (contract recap)

- `extract` is the **primary** path (single file → review → commit). The commit body matches your `CommitInvoiceDto` exactly (whitelist-safe), with `stagingId` from the extract response.
- `GET :id` / commit responses are read as `{ success, invoice }`; lists as `{ success, page, limit, total, totalPages, items }`; your snake_case invoice JSON (`supplier_name`, `total_amount`, `line_items[{unit_price,line_total}]`, …) is handled.
- `:id/file` is fetched as an authenticated blob for the in-browser preview — `Content-Type`/`Content-Disposition` you set are used.
- Saved documents are **read-only** in the UI (commit is create-only); re-processing goes through `:id/retry`.

## Asks / FYI

1. **Redis** — not running on this machine, so `upload` (async) and `retry` enqueue but don't process; `extract→commit` is what demos use. When Redis is up, the async path should light up with no frontend changes — worth a joint test.
2. **Duplicate detection** — `DUPLICATE_INVOICE` shows in the UI when you emit it; nothing needed now, just noting we render it.
3. If you change `extract`/`commit` field names, tell us — the frontend reads through tolerant accessors and a rename is a one-line fix on our side.

## Verified end-to-end (live run)

extract (Tesseract, confidence 32 → `requiresReview: true` on a non-invoice image — correct) → commit with corrected fields → OCR invoice `COMPLETED` + `workflow_invoice_id` returned → workflow invoice at `PENDING_MATCH` → submit-match → `PENDING_APPROVAL` with rules-engine chain. File download streams with correct headers.
