import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOcrInvoice } from '@/hooks/useOcr';
import { extractOcrError } from '@/lib/ocr-api';
import {
  clearPendingExtract,
  getPendingExtract,
  type PendingExtract,
} from '@/lib/ocr-extract-store';
import { OcrDetailPanel } from '@/components/ocr/OcrDetailPanel';
import { OcrErrorBanner } from '@/components/ocr/OcrStates';
import { getFileName, getInvoiceNumber } from '@/lib/ocr';
import type { OcrInvoice } from '@/types/ocr';

/**
 * Side-by-side OCR review. Two entry points:
 *  - /ocr/new — review a freshly extracted (not-yet-saved) document, correct
 *    the fields, and commit it (the backend persists on POST /ocr/invoices/commit).
 *  - /ocr/:id — inspect an existing document read-only. The unified backend's
 *    commit is create-only (it needs a staged extraction), so queued documents
 *    can't be edited in place; use Retry OCR to re-process instead.
 */
export default function OcrReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id; // matched the /ocr/new route

  // Post-extract flow: read the pending extract handed over by the upload modal.
  const [pending] = useState<PendingExtract | null>(() =>
    isNew ? getPendingExtract() : null,
  );
  useEffect(() => {
    // Clear the hand-off once consumed so a later visit doesn't resurrect it.
    return () => {
      if (isNew) clearPendingExtract();
    };
  }, [isNew]);

  // Queued-edit flow: load the existing document.
  const query = useOcrInvoice(isNew ? null : id);
  const invoice = query.data ?? null;

  const title = useMemo(() => {
    const src = pending?.result ?? invoice;
    if (!src) return 'Document';
    return getInvoiceNumber(src as OcrInvoice) || getFileName(src as OcrInvoice) || 'Document';
  }, [pending, invoice]);

  function handleCommitted(saved: OcrInvoice) {
    clearPendingExtract();
    if (saved?.id) navigate(`/ocr/${saved.id}`, { replace: true });
    else navigate('/ocr', { replace: true });
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-ink-muted">
        <Link to="/ocr" className="flex items-center gap-1 font-medium hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" />
          OCR Validation queue
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" />
        <span className="text-ink">{isNew ? 'New document' : title}</span>
      </div>

      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-ink">
          Side-by-side review
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isNew
            ? 'Compare the source document against the OCR-extracted fields, correct anything the engine misread, then save.'
            : 'Compare the source document against the OCR-extracted fields. Re-run OCR if the extraction looks wrong.'}
        </p>
      </div>

      {isNew ? (
        pending ? (
          <Card>
            <CardContent className="p-4">
              <OcrDetailPanel
                invoice={pending.result}
                localFile={pending.file}
                editable
                submitLabel="Save invoice"
                onCommitted={handleCommitted}
                onCancel={() => navigate('/ocr')}
                className="lg:h-[calc(100vh-15rem)]"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
              <UploadCloud className="h-8 w-8 text-ink-subtle" />
              <p className="text-[14px] font-semibold text-ink">Nothing to review</p>
              <p className="max-w-sm text-[12.5px] text-ink-muted">
                This extraction expired (the page was reloaded). Upload the document again to
                review it.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-2">
                <Link to="/ocr">
                  <ArrowLeft className="h-4 w-4" />
                  Back to the queue
                </Link>
              </Button>
            </CardContent>
          </Card>
        )
      ) : query.isLoading ? (
        <Card>
          <CardContent className="flex min-h-[420px] items-center justify-center gap-2 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[13px]">Loading document…</span>
          </CardContent>
        </Card>
      ) : query.isError ? (
        <div className="space-y-4">
          <OcrErrorBanner error={query.error} />
          <Card>
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
              <XCircle className="h-8 w-8 text-rose-500" />
              <p className="text-[14px] font-semibold text-ink">Couldn't load this document</p>
              <p className="max-w-sm text-[12.5px] text-ink-muted">
                {extractOcrError(query.error, 'The document may no longer exist.')}
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-2">
                <Link to="/ocr">
                  <ArrowLeft className="h-4 w-4" />
                  Back to the queue
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : invoice ? (
        <Card>
          <CardContent className="p-4">
            {/* Read-only: the backend has no in-place update for saved documents. */}
            <OcrDetailPanel invoice={invoice} className="lg:h-[calc(100vh-15rem)]" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
