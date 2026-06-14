import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractOcrError, ocrApi } from '@/lib/ocr-api';
import type { CommitPayload, OcrListParams } from '@/types/ocr';

export const ocrKeys = {
  all: ['ocr'] as const,
  stats: () => ['ocr', 'stats'] as const,
  list: (params: OcrListParams) => ['ocr', 'list', params] as const,
  reviewQueue: (params: OcrListParams) => ['ocr', 'review-queue', params] as const,
  invoice: (id: string) => ['ocr', 'invoice', id] as const,
};

export function useOcrStats() {
  return useQuery({
    queryKey: ocrKeys.stats(),
    queryFn: ocrApi.stats,
    staleTime: 20_000,
  });
}

export function useOcrReviewQueue(params: OcrListParams) {
  return useQuery({
    queryKey: ocrKeys.reviewQueue(params),
    queryFn: () => ocrApi.reviewQueue(params),
    placeholderData: (prev) => prev, // keep prior page visible while fetching next
    staleTime: 15_000,
  });
}

export function useOcrInvoices(params: OcrListParams) {
  return useQuery({
    queryKey: ocrKeys.list(params),
    queryFn: () => ocrApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useOcrInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? ocrKeys.invoice(id) : ['ocr', 'invoice', 'noop'],
    queryFn: () => ocrApi.get(id!),
    enabled: !!id,
  });
}

export function useUploadOcr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => ocrApi.upload(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ocrKeys.all });
    },
  });
}

/**
 * Synchronous OCR extraction (POST /invoices/extract). Returns extracted fields
 * without persisting — the caller routes the user into the review form. No
 * cache invalidation since nothing is saved yet.
 */
export function useExtractOcr() {
  return useMutation({
    mutationFn: (file: File) => ocrApi.extract(file),
    onError: (err) => toast.error(extractOcrError(err, 'OCR extraction failed')),
  });
}

/** Persist a human-verified invoice (POST /invoices/commit). */
export function useCommitOcr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CommitPayload) => ocrApi.commit(payload),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ocrKeys.all });
      // The backend bridges the committed invoice into the approval workflow
      // (PENDING_MATCH), so the workflow lists must refresh too.
      qc.invalidateQueries({ queryKey: ['invoices'] });
      if (invoice?.id) {
        qc.setQueryData(ocrKeys.invoice(invoice.id), invoice);
      }
      toast.success('Invoice saved');
    },
    onError: (err) => toast.error(extractOcrError(err, 'Save failed')),
  });
}

export function useRetryOcr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ocrApi.retry(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ocrKeys.all });
      qc.invalidateQueries({ queryKey: ocrKeys.invoice(id) });
      toast.success('OCR re-processing started');
    },
    onError: (err) => toast.error(extractOcrError(err, 'Retry failed')),
  });
}

type FileState =
  | { status: 'idle' | 'loading'; url: null; contentType: null; fileName: null; error: null }
  | { status: 'success'; url: string; contentType: string; fileName: string | null; error: null }
  | { status: 'error'; url: null; contentType: null; fileName: null; error: Error };

const IDLE: FileState = {
  status: 'idle',
  url: null,
  contentType: null,
  fileName: null,
  error: null,
};

/**
 * Fetch the original document (GET /invoices/{id}/file) as an authenticated
 * blob and expose it as an object URL. The URL is revoked on change/unmount —
 * `<img>`/`<iframe>` can't carry the Bearer token, so a fetched blob is the
 * only way to preview a protected file.
 */
export function useOcrFile(id: string | null | undefined, enabled = true): FileState {
  const [state, setState] = useState<FileState>(IDLE);

  useEffect(() => {
    if (!id || !enabled) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading', url: null, contentType: null, fileName: null, error: null });

    ocrApi
      .downloadFile(id)
      .then(({ blob, contentType, fileName }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'success', url: objectUrl, contentType, fileName, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          url: null,
          contentType: null,
          fileName: null,
          error: err instanceof Error ? err : new Error('Failed to load file'),
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, enabled]);

  return state;
}
