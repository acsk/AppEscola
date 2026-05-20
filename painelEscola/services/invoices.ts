import api from "./api";

export type InvoiceSummary = {
  open: { count: number; amount: string };
  overdue: { count: number; amount: string };
  paid_in_period: { count: number; amount: string };
  by_payment_method: Array<{
    payment_method: string;
    count: number;
    amount: string;
  }>;
  period: { paid_at_from: string | null; paid_at_to: string | null };
};

export type MarkInvoicePaidPayload = {
  payment_method: string;
  paid_at?: string;
  payment_reference?: string;
  notes?: string;
};

export async function fetchInvoiceSummary(params?: {
  paid_at_from?: string;
  paid_at_to?: string;
}): Promise<InvoiceSummary> {
  const { data } = await api.get("/invoices/summary", { params });
  return data;
}

export type MarkInvoicePaidResult = {
  type: string;
  message: string;
  body: {
    invoice: Record<string, unknown>;
    cancelled_on_gateway: boolean;
  };
};

export async function markInvoiceAsPaid(
  invoiceId: number,
  payload: MarkInvoicePaidPayload
): Promise<MarkInvoicePaidResult> {
  const { data } = await api.post(`/invoices/${invoiceId}/mark-as-paid`, payload);
  return data;
}
