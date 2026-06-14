import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractApiError, invoicesApi } from '@/lib/api';
import { invoiceRegistry } from '@/lib/invoice-registry';
import { queryKeys } from '@/lib/query-client';
import type { CreateInvoicePayload, Invoice } from '@/types/invoice';

function refreshInvoice(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
  qc.invalidateQueries({ queryKey: queryKeys.invoiceTransitions(id) });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) => invoicesApi.create(payload),
    onSuccess: (invoice: Invoice) => {
      invoiceRegistry.add(invoice.id);
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      toast.success(`Invoice ${invoice.invoiceNumber} created`);
    },
    onError: (err) => {
      toast.error(extractApiError(err, 'Failed to create invoice'));
    },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoicesApi.submitReview(id),
    onSuccess: (invoice) => {
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      refreshInvoice(qc, invoice.id);
      toast.success('Submitted for matching');
    },
    onError: (err) => toast.error(extractApiError(err, 'Submit failed')),
  });
}

export function useSubmitMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoicesApi.submitMatch(id),
    onSuccess: (invoice) => {
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      refreshInvoice(qc, invoice.id);
      toast.success('Match complete · routed for approval');
    },
    onError: (err) => toast.error(extractApiError(err, 'Match failed')),
  });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoicesApi.approve(id),
    onSuccess: (result) => {
      qc.setQueryData(queryKeys.invoice(result.id), result);
      refreshInvoice(qc, result.id);
      toast.success(
        result.chainComplete
          ? 'Invoice fully approved'
          : 'Approval recorded · routed to next approver',
      );
    },
    onError: (err) => toast.error(extractApiError(err, 'Approve failed')),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      invoicesApi.reject(id, reason),
    onSuccess: (invoice) => {
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      refreshInvoice(qc, invoice.id);
      toast.success('Invoice rejected · returned for review');
    },
    onError: (err) => toast.error(extractApiError(err, 'Reject failed')),
  });
}

export function useFlagException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoicesApi.flagException(id),
    onSuccess: (invoice) => {
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      refreshInvoice(qc, invoice.id);
      toast.success('Flagged as exception');
    },
    onError: (err) => toast.error(extractApiError(err, 'Flag failed')),
  });
}

/**
 * Generic state transition (POST /invoices/:id/transitions). Backend-gated to
 * Finance_Director; used by the Exceptions workbench to resolve exceptions
 * (EXCEPTION -> PENDING_MATCH | REJECTED per the state machine).
 */
export function useForceTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      to,
      notes,
    }: {
      id: string;
      to: Invoice['status'];
      notes?: string;
    }) => invoicesApi.transition(id, to, notes),
    onSuccess: (invoice) => {
      qc.setQueryData(queryKeys.invoice(invoice.id), invoice);
      refreshInvoice(qc, invoice.id);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Moved to ${invoice.status.replace(/_/g, ' ').toLowerCase()}`);
    },
    onError: (err) => toast.error(extractApiError(err, 'Transition failed')),
  });
}
