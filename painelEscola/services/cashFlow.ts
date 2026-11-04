import api from "./api";

export type CashFlowGranularity = "daily" | "weekly" | "monthly";
type Total = { count: number; amount: string };

export type CashFlowBucket = {
  key: string;
  label: string;
  start: string;
  end: string;
  /** past = já aconteceu; current = contém hoje; future = só previsto. */
  state: "past" | "current" | "future";
  planned_in: string;
  realized_in: string | null;
  planned_out: string;
  realized_out: string | null;
  flow: string;
  cumulative: string;
};

export type CashFlow = {
  granularity: CashFlowGranularity;
  period: { from: string; to: string };
  today: string;
  realized: { from: string; to: string; inflow: string; outflow: string; net: string };
  projected_result: string;
  totals: { planned_in: string; realized_in: string; planned_out: string; realized_out: string };
  outside_projection: { overdue_receivables: Total; overdue_payables: Total };
  /** Só existe quando a própria Cora informou o saldo no extrato. */
  bank_balance: { amount: string; as_of: string | null; synced_at: string | null } | null;
  buckets: CashFlowBucket[];
};

export type CashFlowFilters = {
  granularity: CashFlowGranularity;
  date_from?: string;
  date_to?: string;
  category_id?: number | "";
  cost_center_id?: number | "";
};

export async function fetchCashFlow(filters: CashFlowFilters): Promise<CashFlow> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const { data } = await api.get("/finance/cash-flow", { params });
  return data.body ?? data;
}
