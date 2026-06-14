import {
  CheckCircle2,
  Gauge,
  Inbox,
  Loader2,
  ScanLine,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOcrStats } from '@/hooks/useOcr';
import { statusCounts, toNumber } from '@/lib/ocr';

interface Tile {
  key: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  iconClass: string;
  /** Status to filter by when the tile is clicked. */
  status?: string;
  spin?: boolean;
}

export function OcrStatsStrip({
  activeStatus,
  onSelectStatus,
}: {
  activeStatus?: string;
  onSelectStatus?: (status?: string) => void;
}) {
  const { data: stats, isLoading } = useOcrStats();

  const counts = statusCounts(stats);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  const total = toNumber(stats?.total) ?? sum;
  const avg = toNumber(stats?.averageConfidence);

  const tiles: Tile[] = [
    {
      key: 'total',
      label: 'Total documents',
      value: total,
      icon: Inbox,
      iconClass: 'bg-brand-50 text-brand',
    },
    {
      key: 'review',
      label: 'Pending review',
      value: toNumber(stats?.pendingReview) ?? counts.PENDING_REVIEW ?? 0,
      icon: ScanLine,
      iconClass: 'bg-amber-50 text-amber-700',
      status: 'PENDING_REVIEW',
    },
    {
      key: 'processing',
      label: 'Processing',
      value: toNumber(stats?.processing) ?? counts.OCR_PROCESSING ?? 0,
      icon: Loader2,
      iconClass: 'bg-sky-50 text-sky-700',
      status: 'OCR_PROCESSING',
      spin: true,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: toNumber(stats?.completed) ?? counts.COMPLETED ?? 0,
      icon: CheckCircle2,
      iconClass: 'bg-emerald-50 text-emerald-600',
      status: 'COMPLETED',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: toNumber(stats?.failed) ?? counts.FAILED ?? 0,
      icon: XCircle,
      iconClass: 'bg-rose-50 text-rose-600',
      status: 'FAILED',
    },
  ];

  if (avg !== null) {
    tiles.push({
      key: 'avg',
      label: 'Avg. confidence',
      value: `${Math.round(avg > 0 && avg <= 1 ? avg * 100 : avg)}%`,
      icon: Gauge,
      iconClass: 'bg-violet-50 text-violet-600',
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => {
        const clickable = !!onSelectStatus && !!tile.status;
        const active = !!tile.status && activeStatus === tile.status;
        const Icon = tile.icon;
        const content = (
          <CardContent className="flex items-center gap-3 px-4 py-3.5">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                tile.iconClass,
              )}
            >
              <Icon className={cn('h-[18px] w-[18px]', tile.spin && 'animate-spin')} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                {tile.label}
              </p>
              {isLoading ? (
                <Skeleton className="mt-1 h-6 w-12" />
              ) : (
                <p className="text-[22px] font-semibold leading-tight tracking-tight text-ink">
                  {tile.value}
                </p>
              )}
            </div>
          </CardContent>
        );

        if (clickable) {
          return (
            <Card
              key={tile.key}
              onClick={() => onSelectStatus?.(active ? undefined : tile.status)}
              className={cn(
                'cursor-pointer transition-all hover:border-brand-200 hover:shadow-sm',
                active && 'border-brand ring-1 ring-brand/30',
              )}
            >
              {content}
            </Card>
          );
        }
        return <Card key={tile.key}>{content}</Card>;
      })}
    </div>
  );
}
