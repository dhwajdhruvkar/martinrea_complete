import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ScanSearch,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ACCEPTED_UPLOAD_ACCEPT_ATTR,
  validateInvoiceFile,
} from '@/lib/upload-validation';
import { extractOcrError, ocrApi } from '@/lib/ocr-api';
import { ocrKeys, useExtractOcr } from '@/hooks/useOcr';
import { setPendingExtract } from '@/lib/ocr-extract-store';

type ItemStatus = 'ready' | 'invalid' | 'uploading' | 'done' | 'error';

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  message?: string;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Invoice document intake against the unified workflow+OCR backend.
 *
 * Two paths:
 *  - "Extract & review" (primary, single file): synchronous OCR via
 *    POST /ocr/invoices/extract — nothing is saved until the reviewer commits.
 *  - "Upload" (bulk): POST /ocr/invoices/upload — queued for background OCR
 *    (requires the backend's Redis worker); low-confidence results land in the
 *    review queue.
 */
export function UploadInvoiceModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const extract = useExtractOcr();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readyItems = items.filter((i) => i.status === 'ready');
  const readyCount = readyItems.length;

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: UploadItem[] = Array.from(fileList).map((file) => {
      const err = validateInvoiceFile(file);
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: err ? 'invalid' : 'ready',
        message: err ?? undefined,
      };
    });
    setItems((prev) => [...prev, ...next]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function reset() {
    setItems([]);
    setBusy(false);
    setDragging(false);
  }

  function handleOpenChange(next: boolean) {
    if (busy || extract.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  /**
   * Primary flow: run synchronous OCR on the single selected document and route
   * to the review screen (nothing is saved until the reviewer commits).
   */
  async function handleExtractReview() {
    const item = readyItems[0];
    if (!item) {
      toast.error('Add a document to extract');
      return;
    }
    try {
      const result = await extract.mutateAsync(item.file);
      setPendingExtract({ result, file: item.file });
      reset();
      onOpenChange(false);
      navigate('/ocr/new');
    } catch {
      // toast handled in the mutation's onError
    }
  }

  async function handleUpload() {
    const queue = items.filter((i) => i.status === 'ready');
    if (queue.length === 0) {
      toast.error('Add at least one valid document');
      return;
    }
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const item of queue) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', message: undefined } : i)),
      );
      try {
        await ocrApi.upload(item.file);
        ok += 1;
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'done' } : i)),
        );
      } catch (err) {
        failed += 1;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'error',
                  message: extractOcrError(err, 'Upload failed'),
                }
              : i,
          ),
        );
      }
    }
    setBusy(false);

    if (ok > 0) {
      // New documents land in the OCR pipeline — refresh its queues/stats.
      qc.invalidateQueries({ queryKey: ocrKeys.all });
      toast.success(
        `${ok} document${ok === 1 ? '' : 's'} uploaded · queued for OCR` +
          (failed > 0 ? ` · ${failed} failed` : ''),
      );
    }
    if (ok > 0 && failed === 0) {
      // Give the user a beat to see the green ticks, then close.
      setTimeout(() => handleOpenChange(false), 600);
    } else if (failed > 0 && ok === 0) {
      toast.error(`All ${failed} upload${failed === 1 ? '' : 's'} failed`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <UploadCloud className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Upload invoice</DialogTitle>
              <DialogDescription>
                Drop a scanned invoice or PDF. "Extract &amp; review" runs OCR now
                and opens it for verification; "Upload" queues files for
                background processing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragging
              ? 'border-brand bg-brand-50'
              : 'border-line bg-canvas hover:border-brand-200',
          )}
        >
          <UploadCloud className="h-7 w-7 text-brand" />
          <div>
            <p className="text-[13.5px] font-medium text-ink">
              Drag &amp; drop, or click to browse
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              PDF, JPG, PNG, or TIF · up to 10 MB each
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </button>

        {/* Selected files */}
        {items.length > 0 && (
          <div className="max-h-[220px] space-y-1.5 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {item.file.name}
                  </p>
                  <p
                    className={cn(
                      'truncate text-[11px]',
                      item.status === 'invalid' || item.status === 'error'
                        ? 'text-rose-600'
                        : 'text-ink-subtle',
                    )}
                  >
                    {item.message ?? prettySize(item.file.size)}
                  </p>
                </div>
                <StatusIcon status={item.status} />
                {!busy && item.status !== 'uploading' && item.status !== 'done' && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded p-1 text-ink-subtle hover:text-ink"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={busy || extract.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleUpload}
            disabled={busy || extract.isPending || readyCount === 0}
            title="Queue files for background OCR processing"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Upload{readyCount > 0 ? ` (${readyCount})` : ''}
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={handleExtractReview}
            disabled={busy || extract.isPending || readyCount !== 1}
            title={
              readyCount > 1
                ? 'Select a single document to extract and review'
                : 'Run OCR now and open for review'
            }
          >
            {extract.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <ScanSearch className="h-4 w-4" />
                Extract &amp; review
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'uploading':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />;
    case 'done':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
    case 'invalid':
    case 'error':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />;
    default:
      return null;
  }
}
