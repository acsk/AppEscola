import api from "./api";

export type ReconciliationStatus = "pending" | "reconciled" | "divergent" | "ignored";
export type ReconciliationType = "pix" | "transfer" | "payment" | "fee" | "card";

export type ReconciliationSummary = {
  environment: string;
  /** Primeira cobrança Cora gerada pelo sistema; antes disso não há o que conciliar. */
  operating_since: string | null;
  credentials_active: boolean;
  credits: { count: number; amount: string };
  debits: { count: number; amount: string };
  reconciled: { amount: string; of_amount: string; percent: number | null };
  pending: { count: number; amount: string };
  counts: Record<ReconciliationStatus, number>;
  last_sync: {
    status: "running" | "success" | "failed";
    period_start: string | null;
    period_end: string | null;
    created: number;
    auto_reconciled: number;
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
  } | null;
  permissions: string[];
};

export type BankEntry = {
  id: number;
  external_id: string;
  transaction_id: string | null;
  source: string;
  environment: string;
  direction: "credit" | "debit";
  transaction_type: string | null;
  amount: string;
  occurred_at: string | null;
  description: string | null;
  counterparty_name: string | null;
  status: ReconciliationStatus;
  match_type: "auto" | "manual" | null;
  divergence: string | null;
  justification: string | null;
  cited_charge_ids: string[];
  reviewed_at: string | null;
  reviewed_by: { id: number; name: string } | null;
  invoice: {
    id: number;
    description: string | null;
    amount: string;
    due_date: string | null;
    status: string;
    paid_at: string | null;
    student: { id: number; name: string } | null;
  } | null;
};

export type BankEntriesPage = {
  items: BankEntry[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

export type ReconciliationCandidate = {
  id: number;
  description: string | null;
  amount: string;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  has_cora_charge: boolean;
  student: { id: number; name: string } | null;
  guardian: { id: number; name: string } | null;
  criteria: { charge_id_cited: boolean; amount_equal: boolean; date_window: boolean; name_hint: boolean };
};

export type ReconciliationHistoryItem = {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string;
  invoice_id: number | null;
  justification: string | null;
  user: { id: number; name: string } | null;
  created_at: string | null;
};

export type ReconciliationFilters = {
  status?: ReconciliationStatus | "";
  type?: ReconciliationType | "";
  direction?: "credit" | "debit" | "";
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export async function fetchReconciliationSummary(filters: ReconciliationFilters): Promise<ReconciliationSummary> {
  const { status: _status, page: _page, per_page: _perPage, ...rest } = filters;
  const { data } = await api.get("/finance/reconciliation/summary", { params: clean(rest) });
  return data.body ?? data;
}

export async function fetchBankEntries(filters: ReconciliationFilters): Promise<BankEntriesPage> {
  const { data } = await api.get("/finance/reconciliation/entries", { params: clean(filters) });
  return data.body ?? data;
}

export async function fetchReconciliationCandidates(entryId: number, search?: string): Promise<ReconciliationCandidate[]> {
  const { data } = await api.get(`/finance/reconciliation/entries/${entryId}/candidates`, { params: clean({ search }) });
  return (data.body ?? data).items ?? [];
}

export async function fetchReconciliationHistory(entryId: number): Promise<ReconciliationHistoryItem[]> {
  const { data } = await api.get(`/finance/reconciliation/entries/${entryId}/history`);
  return (data.body ?? data).items ?? [];
}

export async function syncBankStatement(range: { date_from?: string; date_to?: string }): Promise<string> {
  const { data } = await api.post("/finance/reconciliation/sync", clean(range));
  return data.message;
}

type Decision = { entry: BankEntry; message: string };

const decide = async (path: string, payload: Record<string, unknown>): Promise<Decision> => {
  const { data } = await api.post(path, payload);
  return { entry: data.body, message: data.message };
};

export const reconcileBankEntry = (entryId: number, invoiceId: number, justification: string) =>
  decide(`/finance/reconciliation/entries/${entryId}/reconcile`, { invoice_id: invoiceId, justification });

export const ignoreBankEntry = (entryId: number, justification: string) =>
  decide(`/finance/reconciliation/entries/${entryId}/ignore`, { justification });

export const markBankEntryDivergent = (entryId: number, justification: string) =>
  decide(`/finance/reconciliation/entries/${entryId}/divergent`, { justification });

export const undoBankEntry = (entryId: number, justification: string) =>
  decide(`/finance/reconciliation/entries/${entryId}/undo`, { justification });
