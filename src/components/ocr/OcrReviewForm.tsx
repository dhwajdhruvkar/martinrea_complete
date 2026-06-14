import { useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCommitOcr } from '@/hooks/useOcr';
import { draftToCommitPayload, toCommitDraft } from '@/lib/ocr';
import { OCR_DOCUMENT_TYPES, docTypeMeta } from '@/lib/ocr-constants';
import type {
  OcrExtractResult,
  OcrInvoice,
  OcrLineItemDraft,
  OcrReviewDraft,
} from '@/types/ocr';

const NONE = '__none__';

const EMPTY_LINE: OcrLineItemDraft = {
  description: '',
  quantity: '',
  unitPrice: '',
  amount: '',
};

/**
 * Editable side-by-side review form. Seeds from the tolerant `toCommitDraft`
 * mapping, lets the reviewer correct OCR output, and persists via
 * `POST /invoices/commit` (create for a fresh extract, update when the source
 * carries an `id`).
 */
export function OcrReviewForm({
  source,
  submitLabel = 'Save invoice',
  onCommitted,
  onCancel,
}: {
  source: OcrInvoice | OcrExtractResult;
  submitLabel?: string;
  onCommitted?: (saved: OcrInvoice) => void;
  onCancel?: () => void;
}) {
  const commit = useCommitOcr();
  const [draft, setDraft] = useState<OcrReviewDraft>(() => toCommitDraft(source));

  function set<K extends keyof OcrReviewDraft>(key: K, value: OcrReviewDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setLine(idx: number, key: keyof OcrLineItemDraft, value: string) {
    setDraft((d) => ({
      ...d,
      lineItems: d.lineItems.map((li, i) => (i === idx ? { ...li, [key]: value } : li)),
    }));
  }

  function addLine() {
    setDraft((d) => ({ ...d, lineItems: [...d.lineItems, { ...EMPTY_LINE }] }));
  }

  function removeLine(idx: number) {
    setDraft((d) => ({ ...d, lineItems: d.lineItems.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    commit.mutate(draftToCommitPayload(draft, source), {
      onSuccess: (saved) => onCommitted?.(saved),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header fields */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h4 className="mb-3 text-[12.5px] font-semibold text-ink">Invoice fields</h4>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="Invoice number">
            <Input
              value={draft.invoiceNumber}
              onChange={(e) => set('invoiceNumber', e.target.value)}
              placeholder="e.g. INV-10293"
            />
          </Field>
          <Field label="PO number">
            <Input
              value={draft.poNumber}
              onChange={(e) => set('poNumber', e.target.value)}
              placeholder="e.g. PO-55821"
            />
          </Field>
          <Field label="Supplier" className="sm:col-span-2">
            <Input
              value={draft.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              placeholder="Supplier name"
            />
          </Field>
          <Field label="Document type">
            <Select
              value={draft.documentType || NONE}
              onValueChange={(v) => set('documentType', v === NONE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unspecified</SelectItem>
                {OCR_DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {docTypeMeta(t).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Input
              value={draft.currency}
              onChange={(e) => set('currency', e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
            />
          </Field>
          <Field label="Invoice date">
            <Input
              type="date"
              value={draft.invoiceDate}
              onChange={(e) => set('invoiceDate', e.target.value)}
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </Field>
          <Field label="Subtotal">
            <Input
              inputMode="decimal"
              value={draft.subtotal}
              onChange={(e) => set('subtotal', e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Tax">
            <Input
              inputMode="decimal"
              value={draft.taxAmount}
              onChange={(e) => set('taxAmount', e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Total" className="sm:col-span-2">
            <Input
              inputMode="decimal"
              value={draft.totalAmount}
              onChange={(e) => set('totalAmount', e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
      </section>

      {/* Line items */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <h4 className="text-[12.5px] font-semibold text-ink">
            Line items{draft.lineItems.length > 0 ? ` (${draft.lineItems.length})` : ''}
          </h4>
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
        </div>

        {draft.lineItems.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">
            No line items. Add a row if the document lists individual items.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="hidden grid-cols-[1fr_64px_84px_84px_32px] gap-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-subtle sm:grid">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {draft.lineItems.map((li, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_64px_84px_84px_32px]"
              >
                <Input
                  value={li.description}
                  onChange={(e) => setLine(idx, 'description', e.target.value)}
                  placeholder="Description"
                  className="col-span-2 h-9 sm:col-span-1"
                />
                <Input
                  inputMode="decimal"
                  value={li.quantity}
                  onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                  placeholder="Qty"
                  className="h-9 text-right"
                />
                <Input
                  inputMode="decimal"
                  value={li.unitPrice}
                  onChange={(e) => setLine(idx, 'unitPrice', e.target.value)}
                  placeholder="Unit"
                  className="h-9 text-right"
                />
                <Input
                  inputMode="decimal"
                  value={li.amount}
                  onChange={(e) => setLine(idx, 'amount', e.target.value)}
                  placeholder="Amount"
                  className="h-9 text-right"
                />
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  className="flex h-9 items-center justify-center rounded-md text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button type="submit" disabled={commit.isPending} className="gap-1.5">
          {commit.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {commit.isPending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={commit.isPending}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </Label>
      {children}
    </div>
  );
}
