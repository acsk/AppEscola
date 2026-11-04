import api from "./api";
import { downloadBlob } from "./enrollmentCarne";

export type ExpenseStatus = "draft" | "pending_approval" | "approved" | "paid" | "cancelled";
export type ExpenseSituation = ExpenseStatus | "overdue" | "awaiting_link";
export type Named = { id: number; name: string };

export type Expense = {
  id: number;
  code: string;
  description: string;
  supplier: Named | null;
  category: Named | null;
  cost_center: Named | null;
  amount: string;
  due_date: string | null;
  days_to_due: number | null;
  status: ExpenseStatus;
  situation: ExpenseSituation;
  recurrence: "none" | "monthly";
  series_id: number | null;
  auto_debit: boolean;
  system_managed: boolean;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  approved_at: string | null;
  attachments_count: number;
  reconciled: boolean;
  created_at: string | null;
};

export type ExpenseDetail = Expense & {
  attachments: { id: number; name: string; mime: string; size: number; created_at: string | null }[];
  bank_entries: { id: number; amount: string; occurred_at: string | null; description: string | null; counterparty_name: string | null }[];
  history: {
    id: number;
    action: string;
    changes: Record<string, { from: unknown; to: unknown }> | null;
    reason: string | null;
    user: Named | null;
    created_at: string | null;
  }[];
};

export type ExpensesPage = {
  items: Expense[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

type Total = { count: number; amount: string };

export type PayablesSummary = {
  month: string;
  due_30_days: Total;
  overdue: Total;
  pending_approval: Total;
  paid_in_month: Total;
  without_receipt: Total;
  by_category: { name: string; amount: string }[];
  permissions: string[];
};

export type PayablesOptions = {
  categories: Named[];
  cost_centers: Named[];
  suppliers: Named[];
  payment_methods: { value: string; label: string }[];
};

export type Supplier = {
  id: number;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  system_managed: boolean;
};

export type ExpenseFilters = {
  search?: string;
  category_id?: number | "";
  cost_center_id?: number | "";
  recurrence?: "recurring" | "one_off" | "";
  situation?: ExpenseSituation | "";
  without_receipt?: boolean;
  due_from?: string;
  due_to?: string;
  page?: number;
  per_page?: number;
};

export type ExpenseInput = {
  description: string;
  supplier_id: number | null;
  category_id: number | null;
  cost_center_id: number | null;
  amount: number;
  due_date: string;
  recurrence: "none" | "monthly";
  auto_debit: boolean;
  notes: string | null;
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)
      .map(([k, v]) => [k, v === true ? 1 : v])
  );

type Result = { expense: ExpenseDetail; message: string };
const result = (data: any): Result => ({ expense: data.body, message: data.message });

export async function fetchPayablesSummary(month?: string): Promise<PayablesSummary> {
  const { data } = await api.get("/finance/payables/summary", { params: clean({ month }) });
  return data.body ?? data;
}

export async function fetchPayablesOptions(): Promise<PayablesOptions> {
  const { data } = await api.get("/finance/payables/options");
  return data.body ?? data;
}

export async function fetchExpenses(filters: ExpenseFilters): Promise<ExpensesPage> {
  const { data } = await api.get("/finance/payables/expenses", { params: clean(filters) });
  return data.body ?? data;
}

export async function fetchExpense(id: number): Promise<ExpenseDetail> {
  const { data } = await api.get(`/finance/payables/expenses/${id}`);
  return data.body ?? data;
}

export async function createExpense(input: ExpenseInput & { submit?: boolean }): Promise<Result> {
  return result((await api.post("/finance/payables/expenses", input)).data);
}

export async function updateExpense(id: number, input: ExpenseInput & { reason?: string }): Promise<Result> {
  return result((await api.put(`/finance/payables/expenses/${id}`, input)).data);
}

export const submitExpense = async (id: number) => result((await api.post(`/finance/payables/expenses/${id}/submit`)).data);
export const approveExpense = async (id: number) => result((await api.post(`/finance/payables/expenses/${id}/approve`)).data);

export const payExpense = async (id: number, input: { paid_at: string; payment_method: string; notes?: string }) =>
  result((await api.post(`/finance/payables/expenses/${id}/pay`, clean(input))).data);

export const reopenExpense = async (id: number, reason: string) =>
  result((await api.post(`/finance/payables/expenses/${id}/reopen`, { reason })).data);

export const cancelExpense = async (id: number, reason: string) =>
  result((await api.post(`/finance/payables/expenses/${id}/cancel`, { reason })).data);

export async function uploadExpenseAttachment(id: number, file: File): Promise<Result> {
  const form = new FormData();
  form.append("file", file);
  return result((await api.post(`/finance/payables/expenses/${id}/attachments`, form)).data);
}

export const removeExpenseAttachment = async (id: number, attachmentId: number, reason: string) =>
  result((await api.delete(`/finance/payables/expenses/${id}/attachments/${attachmentId}`, { data: { reason } })).data);

export async function downloadExpenseAttachment(id: number, attachmentId: number, filename: string): Promise<void> {
  const response = await api.get(`/finance/payables/expenses/${id}/attachments/${attachmentId}`, { responseType: "blob" });
  downloadBlob(response.data as Blob, filename);
}

export async function fetchSuppliers(search?: string): Promise<Supplier[]> {
  const { data } = await api.get("/finance/payables/suppliers", { params: clean({ search }) });
  return (data.body ?? data).items ?? [];
}

export type SupplierInput = { name: string; document?: string | null; email?: string | null; phone?: string | null; notes?: string | null; active?: boolean };

export async function saveSupplier(input: SupplierInput, id?: number): Promise<{ supplier: Supplier; message: string }> {
  const { data } = id ? await api.put(`/finance/payables/suppliers/${id}`, input) : await api.post("/finance/payables/suppliers", input);
  return { supplier: data.body, message: data.message };
}

export type CatalogItem = { id: number; name: string; active: boolean; system_managed: boolean; expenses_count: number };
export type CatalogKind = "categories" | "cost-centers";

export async function fetchCatalog(kind: CatalogKind): Promise<CatalogItem[]> {
  const { data } = await api.get(`/finance/payables/${kind}`);
  return (data.body ?? data).items ?? [];
}

export async function saveCatalogItem(kind: CatalogKind, input: { name: string; active?: boolean }, id?: number): Promise<string> {
  const { data } = id ? await api.put(`/finance/payables/${kind}/${id}`, input) : await api.post(`/finance/payables/${kind}`, input);
  return data.message;
}

export type BatchResult = { done: number[]; failed: { id: number; code: string | null; message: string }[]; message: string };

/** Aprova ou registra pagamento de várias despesas; cada uma é processada separadamente no servidor. */
export async function batchExpenses(
  action: "approve" | "pay",
  ids: number[],
  payment?: { paid_at: string; payment_method: string }
): Promise<BatchResult> {
  const { data } = await api.post("/finance/payables/expenses/batch", { action, ids, ...(payment ?? {}) });
  return { ...(data.body ?? data), message: data.message };
}

/** Todas as despesas do filtro (para exportar), página a página, até 2.000. */
export async function fetchAllExpenses(filters: ExpenseFilters): Promise<Expense[]> {
  const items: Expense[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await fetchExpenses({ ...filters, page, per_page: 100 });
    items.push(...result.items);
    if (page >= result.meta.last_page) break;
  }
  return items;
}
