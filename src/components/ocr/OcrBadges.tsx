import { cn } from '@/lib/utils';
import {
  confidenceTier,
  docTypeMeta,
  ocrStatusMeta,
} from '@/lib/ocr-constants';

export function OcrStatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = ocrStatusMeta(status);
  const Icon = meta.icon;
  const spin = status === 'OCR_PROCESSING';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium',
        meta.badge,
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
    >
      <Icon className={cn('h-3 w-3', spin && 'animate-spin')} />
      {meta.label}
    </span>
  );
}

export function DocTypeBadge({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  const meta = docTypeMeta(type);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        meta.badge,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/** Compact confidence pill, e.g. "92%" coloured by tier. */
export function ConfidenceBadge({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500',
          className,
        )}
      >
        —
      </span>
    );
  }
  const meta = confidenceTier(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        meta.badge,
        className,
      )}
      title={`${meta.label} confidence`}
    >
      {score}%
    </span>
  );
}

/** Confidence as a labelled progress meter for detail surfaces. */
export function ConfidenceMeter({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return <p className={cn('text-[13px] text-ink-muted', className)}>No confidence score</p>;
  }
  const meta = confidenceTier(score);
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between text-[12px]">
        <span className={cn('font-semibold', meta.text)}>{meta.label} confidence</span>
        <span className={cn('font-semibold tabular-nums', meta.text)}>{score}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full transition-all', meta.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
