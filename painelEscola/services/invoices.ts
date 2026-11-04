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

export type InvoiceSituation = "open" | "overdue" | "due_soon" | "paid" | "cancelled";

export type InvoiceSituationTotals = {
  situations: Record<InvoiceSituation, { count: number; amount: string }>;
  due_soon_days: number;
  today: string;
};

/** Contagem e valor por situação com os mesmos filtros da listagem (exceto a situação). */
export async function fetchInvoiceSituations(params: Record<string, string | number>): Promise<InvoiceSituationTotals> {
  const { data } = await api.get("/invoices/situations", { params });
  return data.body ?? data;
}

export type InvoiceAuditAction = "created" | "updated" | "paid" | "cancelled" | "charge_generated" | "deleted" | "restored";

export type InvoiceAuditEntry = {
  id: number;
  action: InvoiceAuditAction;
  source: "user" | "system" | "webhook";
  user: { id: number; name: string } | null;
  /** Feito durante um acesso de suporte do super admin. */
  support_access: boolean;
  changes: Record<string, { from: string | number | null; to: string | number | null }>;
  reason: string | null;
  created_at: string;
};

export async function fetchInvoiceAudit(invoiceId: number): Promise<InvoiceAuditEntry[]> {
  const { data } = await api.get(`/invoices/${invoiceId}/audit`);
  return (data.body ?? data).items ?? [];
}
