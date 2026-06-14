export const InvoiceStatus = {
  RECEIVED: 'RECEIVED',
  OCR_PROCESSING: 'OCR_PROCESSING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_MATCH: 'PENDING_MATCH',
  MATCHED: 'MATCHED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXCEPTION: 'EXCEPTION',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export interface ApprovalRecord {
  approverId: string;
  decision: 'APPROVED' | 'REJECTED';
  timestamp: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  supplierId: string | null;
  poNumber: string | null;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  cfdiValid: boolean | null;
  ingestionChannel: string | null;
  plantId: string | null;
  currentApproverId: string | null;
  approvalChain: string[] | null;
  approvalsCompleted: ApprovalRecord[] | null;
  rejectionReason: string | null;
  pendingApprovalSince: string | null;
  lastEscalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllowedTransitionsResponse {
  id: string;
  currentStatus: InvoiceStatus;
  allowedTransitions: InvoiceStatus[];
}

export interface CreateInvoicePayload {
  invoiceNumber: string;
  supplierName: string;
  supplierId?: string;
  poNumber?: string;
  totalAmount: number;
  currency?: string;
  cfdiValid?: boolean;
  ingestionChannel?: string;
  plantId?: string;
}

export interface ApproveResult extends Invoice {
  chainComplete?: boolean;
  nextApproverId?: string | null;
}
