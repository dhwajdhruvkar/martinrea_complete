import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOcrFile } from '@/hooks/useOcr';
import { isOcrAuthError } from '@/lib/ocr-api';

type Resolved =
  | { status: 'success'; url: string; contentType: string }
  | { status: 'loading' }
  | { status: 'error'; authError: boolean; message: string };

export function OcrFilePreview({
  invoiceId,
  fileName,
  localFile,
  enabled = true,
  className,
}: {
  invoiceId?: string | null;
  fileName?: string | null;
  /**
   * Preview a not-yet-saved file directly from the browser (post-extract, before
   * commit). When set, the server `/file` fetch is skipped.
   */
  localFile?: File | null;
  enabled?: boolean;
  className?: string;
}) {
  // Server fetch — disabled while a local file is being previewed.
  const fetched = useOcrFile(invoiceId, enabled && !localFile);

  // Local object URL for the post-extract case.
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!localFile) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(localFile);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  let resolved: Resolved;
  let downloadName: string;
  if (localFile) {
    downloadName = fileName || localFile.name;
    resolved = localUrl
      ? { status: 'success', url: localUrl, contentType: localFile.type || '' }
      : { status: 'loading' };
  } else {
    downloadName = fileName || fetched.fileName || `invoice-${invoiceId ?? 'file'}`;
    if (fetched.status === 'success') {
      resolved = { status: 'success', url: fetched.url, contentType: fetched.contentType };
    } else if (fetched.status === 'error') {
      resolved = {
        status: 'error',
        authError: isOcrAuthError(fetched.error),
        message: fetched.error.message,
      };
    } else {
      resolved = { status: 'loading' };
    }
  }

  let body: React.ReactNode;
  if (resolved.status === 'success') {
    if (isImage(resolved.contentType)) {
      body = (
        <div className="absolute inset-0 overflow-auto bg-slate-800/5 p-3">
          <img src={resolved.url} alt={downloadName} className="mx-auto max-w-full rounded shadow-sm" />
        </div>
      );
    } else if (isPdf(resolved.contentType, downloadName)) {
      body = (
        <iframe title={downloadName} src={resolved.url} className="absolute inset-0 h-full w-full" />
      );
    } else {
      body = <FilePreviewUnsupported url={resolved.url} name={downloadName} />;
    }
  } else if (resolved.status === 'error') {
    body = <FilePreviewError authError={resolved.authError} message={resolved.message} />;
  } else {
    body = (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-[12.5px]">Loading document…</p>
      </div>
    );
  }

  const showFileActions = resolved.status === 'success';
  const fileUrl = resolved.status === 'success' ? resolved.url : '';

  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-lg border border-line bg-canvas', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-ink">
          <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <span className="truncate">{downloadName}</span>
        </span>
        {showFileActions && (
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="icon-sm" title="Open in new tab">
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" title="Download">
              <a href={fileUrl} download={downloadName}>
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        )}
      </div>

      <div className="relative min-h-[320px] flex-1">{body}</div>
    </div>
  );
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isPdf(contentType: string, name: string): boolean {
  return contentType.includes('pdf') || name.toLowerCase().endsWith('.pdf');
}

function FilePreviewError({ authError, message }: { authError: boolean; message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
      {authError ? (
        <>
          <Lock className="h-6 w-6 text-amber-500" />
          <p className="text-[13px] font-semibold text-ink">OCR service rejected the session</p>
          <p className="max-w-xs text-[12px] text-ink-muted">
            The document couldn't be loaded because the OCR service didn't accept the current
            credentials. It may authenticate separately from the workflow app.
          </p>
        </>
      ) : (
        <>
          <TriangleAlert className="h-6 w-6 text-rose-500" />
          <p className="text-[13px] font-semibold text-ink">Couldn't load the document</p>
          <p className="max-w-xs text-[12px] text-ink-muted">{message}</p>
        </>
      )}
    </div>
  );
}

function FilePreviewUnsupported({ url, name }: { url: string; name: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <FileText className="h-8 w-8 text-ink-subtle" />
      <p className="text-[13px] font-medium text-ink">Preview not available for this file type</p>
      <Button asChild variant="secondary" size="sm">
        <a href={url} download={name}>
          <Download className="h-4 w-4" />
          Download {name}
        </a>
      </Button>
    </div>
  );
}
