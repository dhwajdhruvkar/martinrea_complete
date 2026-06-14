import { Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ociObjectUrl } from '@/lib/object-storage';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Renders the bucket object inline (image / PDF) with download + open links. */
export function OciFilePreview({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const url = ociObjectUrl(name);
  const ext = fileExtension(name);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-lg border border-line bg-canvas',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-ink">
          <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <span className="truncate">{name}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm" title="Open in new tab">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button asChild variant="ghost" size="icon-sm" title="Download">
            <a href={url} download={name}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div className="relative min-h-[320px] flex-1">
        {isImage ? (
          <div className="absolute inset-0 overflow-auto bg-slate-800/5 p-3">
            <img src={url} alt={name} className="mx-auto max-w-full rounded shadow-sm" />
          </div>
        ) : isPdf ? (
          <iframe title={name} src={url} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText className="h-8 w-8 text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink">
              No inline preview for .{ext || 'this'} files
            </p>
            <Button asChild variant="secondary" size="sm">
              <a href={url} download={name}>
                <Download className="h-4 w-4" />
                Download {name}
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
