import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  itemsOnPage,
  isFetching,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  itemsOnPage: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : from + itemsOnPage - 1;

  return (
    <div className="flex flex-col gap-2 text-[12.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing <span className="font-semibold text-ink">{from}</span>–
        <span className="font-semibold text-ink">{to}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="px-1 tabular-nums">
          Page <span className="font-semibold text-ink">{page}</span> of{' '}
          <span className="font-semibold text-ink">{Math.max(1, totalPages)}</span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
