import { useEffect, useMemo, useState } from 'react';
import {
  FileSearch,
  FileText,
  Loader2,
  RotateCw,
  Search as SearchIcon,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate, relativeFromNow } from '@/lib/utils';
import { ociKeys, useOciFiles } from '@/hooks/useOci';
import { OciFilePreview, fileExtension } from '@/components/ocr/OciFilePreview';
import type { OciObject } from '@/lib/object-storage';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

export default function DocumentViewerPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error, isError } = useOciFiles();
  const [q, setQ] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const files = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return files;
    return files.filter((f) => f.name.toLowerCase().includes(term));
  }, [files, q]);

  // Auto-select the first document once the bucket loads (or when the current
  // selection disappears after a refresh).
  useEffect(() => {
    if (files.length === 0) {
      setSelectedName(null);
      return;
    }
    setSelectedName((cur) => (cur && files.some((f) => f.name === cur) ? cur : files[0].name));
  }, [files]);

  const selected = files.find((f) => f.name === selectedName) ?? null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Document Viewer</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Browse documents in the storage bucket and open the source PDF or image inline.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ociKeys.files })}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents by name…"
          className="pl-9 pr-9"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isError && (
        <div className="flex items-start gap-2.5 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] text-rose-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn't load the storage bucket</p>
            <p className="mt-0.5">
              {error instanceof Error ? error.message : 'Please try again in a moment.'}
            </p>
          </div>
        </div>
      )}

      {!isLoading && !isError && files.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <FileSearch className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-[16px] font-semibold text-ink">The bucket is empty</h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                No documents are in storage yet. Upload an invoice and it will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_1fr]">
          {/* Master list */}
          <div className="flex flex-col gap-2">
            <Card className="overflow-hidden">
              <CardContent className="max-h-[64vh] overflow-y-auto px-0">
                {isLoading ? (
                  <div className="space-y-1 p-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-md" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
                    No documents match “{q}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {filtered.map((file) => (
                      <li key={file.name}>
                        <DocListItem
                          file={file}
                          active={selectedName === file.name}
                          onClick={() => setSelectedName(file.name)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <p className="px-1 text-[12px] text-ink-muted">
              {filtered.length} of {files.length} document{files.length === 1 ? '' : 's'}
            </p>
          </div>

          {/* Detail / preview */}
          <div className="xl:sticky xl:top-20 xl:self-start">
            {selected ? (
              <Card>
                <CardContent className="p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <OciFilePreview name={selected.name} className="min-h-[360px] lg:min-h-0" />
                    <FileMeta file={selected} />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[360px] flex-col items-center justify-center gap-2 text-center">
                  <FileSearch className="h-8 w-8 text-ink-subtle" />
                  <p className="text-[13.5px] font-medium text-ink">Select a document</p>
                  <p className="max-w-xs text-[12.5px] text-ink-muted">
                    Choose a document from the list to preview it.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocListItem({
  file,
  active,
  onClick,
}: {
  file: OciObject;
  active: boolean;
  onClick: () => void;
}) {
  const meta = fileTypeMeta(fileExtension(file.name));
  const size = prettyBytes(file.size);
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
        active ? 'bg-brand-50' : 'hover:bg-canvas',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          active ? 'bg-brand text-white' : 'bg-slate-100 text-ink-muted',
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink">{file.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-subtle">
          <span className={cn('rounded border px-1.5 py-px font-medium', meta.badge)}>
            {meta.label}
          </span>
          {size && <span>{size}</span>}
          {file.timeCreated && <span>· {relativeFromNow(file.timeCreated)}</span>}
        </div>
      </div>
    </button>
  );
}

function FileMeta({ file }: { file: OciObject }) {
  const meta = fileTypeMeta(fileExtension(file.name));
  const size = prettyBytes(file.size);
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-all text-[16px] font-semibold tracking-tight text-ink">
            {file.name}
          </h3>
          <span className={cn('rounded border px-1.5 py-0.5 text-[11px] font-medium', meta.badge)}>
            {meta.label}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-lg border border-line bg-white p-3.5 sm:grid-cols-2">
        <Meta label="File name" value={file.name} />
        <Meta label="Type" value={meta.label} />
        <Meta label="Size" value={size ?? '—'} />
        <Meta
          label="Created"
          value={file.timeCreated ? formatDate(file.timeCreated, 'MMM d, yyyy · h:mm a') : '—'}
        />
      </dl>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </dt>
      <dd className="break-words text-[13px] text-ink">{value}</dd>
    </div>
  );
}

function fileTypeMeta(ext: string): { label: string; badge: string } {
  if (ext === 'pdf') return { label: 'PDF', badge: 'bg-red-50 text-red-700 border-red-200' };
  if (IMAGE_EXTS.includes(ext))
    return { label: 'Image', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  if (ext === 'doc' || ext === 'docx')
    return { label: 'Word', badge: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (ext === 'html' || ext === 'htm')
    return { label: 'HTML', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return { label: 'Sheet', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return {
    label: ext ? ext.toUpperCase() : 'File',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

function prettyBytes(bytes?: number): string | null {
  if (!bytes || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
