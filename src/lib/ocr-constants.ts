import {
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Inbox,
  Loader2,
  ScanLine,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { OcrDocumentType, OcrInvoiceStatus } from '@/types/ocr';

export interface OcrStatusMeta {
  label: string;
  short: string;
  /** Tailwind classes for a badge: background + text + border. */
  badge: string;
  /** Solid colour for dots / chart datapoints. */
  color: string;
  icon: LucideIcon;
  /** Coarse bucket used for grouping + summary tiles. */
  group: 'intake' | 'processing' | 'review' | 'done' | 'problem';
}

export const OCR_STATUS_META: Record<string, OcrStatusMeta> = {
  RECEIVED: {
    label: 'Received',
    short: 'Received',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    color: '#64748B',
    icon: Inbox,
    group: 'intake',
  },
  OCR_PROCESSING: {
    label: 'OCR Processing',
    short: 'Processing',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    color: '#0EA5E9',
    icon: Loader2,
    group: 'processing',
  },
  PENDING_REVIEW: {
    label: 'Pending Review',
    short: 'Review',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    color: '#F59E0B',
    icon: ScanLine,
    group: 'review',
  },
  PENDING_MATCH: {
    label: 'Pending Match',
    short: 'Match',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    color: '#8B5CF6',
    icon: Clock,
    group: 'done',
  },
  COMPLETED: {
    label: 'Completed',
    short: 'Completed',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    color: '#10B981',
    icon: CheckCircle2,
    group: 'done',
  },
  FAILED: {
    label: 'Failed',
    short: 'Failed',
    badge: 'bg-red-50 text-red-700 border-red-200',
    color: '#EF4444',
    icon: XCircle,
    group: 'problem',
  },
  REJECTED: {
    label: 'Rejected',
    short: 'Rejected',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    color: '#F43F5E',
    icon: XCircle,
    group: 'problem',
  },
  DUPLICATE_INVOICE: {
    label: 'Duplicate',
    short: 'Duplicate',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    color: '#F97316',
    icon: Copy,
    group: 'problem',
  },
};

/** Fallback for any status the backend adds that we don't know about yet. */
export const OCR_STATUS_FALLBACK: OcrStatusMeta = {
  label: 'Unknown',
  short: 'Unknown',
  badge: 'bg-slate-100 text-slate-600 border-slate-200',
  color: '#94A3B8',
  icon: FileText,
  group: 'intake',
};

export function ocrStatusMeta(status: string | null | undefined): OcrStatusMeta {
  if (!status) return OCR_STATUS_FALLBACK;
  return OCR_STATUS_META[status] ?? { ...OCR_STATUS_FALLBACK, label: status, short: status };
}

/** Display order for chips, tables, and charts. */
export const OCR_STATUS_ORDER: string[] = [
  OcrInvoiceStatus.RECEIVED,
  OcrInvoiceStatus.OCR_PROCESSING,
  OcrInvoiceStatus.PENDING_REVIEW,
  OcrInvoiceStatus.PENDING_MATCH,
  OcrInvoiceStatus.COMPLETED,
  OcrInvoiceStatus.FAILED,
  OcrInvoiceStatus.REJECTED,
  OcrInvoiceStatus.DUPLICATE_INVOICE,
];

// ─── Document types ─────────────────────────────────────────────────────────
export interface DocTypeMeta {
  label: string;
  badge: string;
}

export const DOC_TYPE_META: Record<string, DocTypeMeta> = {
  INVOICE: { label: 'Invoice', badge: 'bg-brand-50 text-brand-700 border-brand-100' },
  CFDI: { label: 'CFDI', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  RECEIPT: { label: 'Receipt', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PURCHASE_ORDER: {
    label: 'Purchase Order',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
};

export function docTypeMeta(type: string | null | undefined): DocTypeMeta {
  if (!type) return { label: '—', badge: 'bg-slate-100 text-slate-600 border-slate-200' };
  return DOC_TYPE_META[type] ?? { label: type, badge: 'bg-slate-100 text-slate-600 border-slate-200' };
}

export const OCR_DOCUMENT_TYPES = Object.values(OcrDocumentType);

// ─── Confidence tiers (score is 0–100) ──────────────────────────────────────
export type ConfidenceTier = 'high' | 'medium' | 'low';

export const CONFIDENCE_THRESHOLDS = {
  /** ≥ high → trustworthy enough to auto-advance. */
  high: 90,
  /** ≥ medium → usable but worth a glance. */
  medium: 75,
} as const;

export interface ConfidenceTierMeta {
  tier: ConfidenceTier;
  label: string;
  /** Tailwind text colour. */
  text: string;
  /** Tailwind badge classes. */
  badge: string;
  /** Tailwind progress-bar fill. */
  bar: string;
  /** Solid hex for inline styles. */
  color: string;
}

export function confidenceTier(score: number): ConfidenceTierMeta {
  if (score >= CONFIDENCE_THRESHOLDS.high) {
    return {
      tier: 'high',
      label: 'High',
      text: 'text-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      bar: 'bg-emerald-500',
      color: '#10B981',
    };
  }
  if (score >= CONFIDENCE_THRESHOLDS.medium) {
    return {
      tier: 'medium',
      label: 'Medium',
      text: 'text-amber-700',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      bar: 'bg-amber-500',
      color: '#F59E0B',
    };
  }
  return {
    tier: 'low',
    label: 'Low',
    text: 'text-rose-700',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
    color: '#F43F5E',
  };
}
