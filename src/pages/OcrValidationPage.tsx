import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RotateCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ocrKeys, useOcrReviewQueue } from '@/hooks/useOcr';
import { OcrStatsStrip } from '@/components/ocr/OcrStatsStrip';
import { OcrFilters, type OcrFilterValues } from '@/components/ocr/OcrFilters';
import { OcrInvoiceTable } from '@/components/ocr/OcrInvoiceTable';
import { Pagination } from '@/components/ocr/Pagination';
import { OcrEmptyState, OcrErrorBanner } from '@/components/ocr/OcrStates';

const LIMIT = 25;

export default function OcrValidationPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<OcrFilterValues>({});
  const [page, setPage] = useState(1);

  const params = { ...filters, page, limit: LIMIT };
  const { data, isLoading, isFetching, error, isError } = useOcrReviewQueue(params);

  const invoices = data?.items ?? [];

  function applyFilters(next: OcrFilterValues) {
    setFilters(next);
    setPage(1);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ocrKeys.all });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">OCR Validation</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Review and correct OCR-extracted fields before invoices move into matching.
            Low-confidence documents land here automatically.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats overview */}
      <OcrStatsStrip />

      {/* Filters (status is implied by the review queue, so it's hidden here) */}
      <OcrFilters value={filters} onChange={applyFilters} hideStatus />

      {isError && <OcrErrorBanner error={error} />}

      {/* Queue */}
      {!isLoading && !isError && invoices.length === 0 ? (
        <OcrEmptyState
          title="Review queue is clear"
          hint="No documents are waiting for review right now. Newly uploaded invoices appear here when OCR confidence is low or fields need confirmation."
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardContent className="px-0">
              <OcrInvoiceTable
                invoices={invoices}
                isLoading={isLoading}
                onRowClick={(inv) => navigate(`/ocr/${inv.id}`)}
              />
            </CardContent>
          </Card>

          {data && data.total > 0 && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              limit={data.limit}
              itemsOnPage={invoices.length}
              isFetching={isFetching}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
