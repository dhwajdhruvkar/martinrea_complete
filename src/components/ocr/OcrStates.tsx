import { Lock, ScanLine, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { isOcrAuthError, extractOcrError } from '@/lib/ocr-api';

/** Inline banner for a failed OCR request, with a tailored auth message. */
export function OcrErrorBanner({ error }: { error: unknown }) {
  const auth = isOcrAuthError(error);
  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[12.5px] ${
        auth
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      {auth ? (
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div>
        <p className="font-semibold">
          {auth ? 'OCR service authentication failed' : "Couldn't reach the OCR service"}
        </p>
        <p className="mt-0.5">
          {auth
            ? 'The OCR service rejected the current session. It may use separate credentials from the workflow app — confirm the OCR login with Aman.'
            : extractOcrError(error, 'Please try again in a moment.')}
        </p>
      </div>
    </div>
  );
}

export function OcrEmptyState({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="max-w-md space-y-1.5">
          <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
          <p className="text-[13px] leading-relaxed text-ink-muted">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
