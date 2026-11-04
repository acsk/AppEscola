import api from "./api";

type Total = { count: number; amount: string };

export type ConsolidatedReport = {
  period: { from: string; to: string };
  today: string;
  /** Receitas recebidas e despesas pagas por mês (null = mês ainda não começou). */
  months: { month: string; label: string; state: "past" | "current" | "future"; revenue: string | null; expenses: string | null; result: string | null }[];
  totals: { revenue: string; expenses: string; result: string };
  expenses_by_category: { name: string; count: number; amount: string }[];
  position: { receivable_open: Total; receivable_overdue: Total; payable_open: Total; payable_overdue: Total };
  reconciliation: {
    summary: { direction: "credit" | "debit"; status: "pending" | "divergent"; count: number; amount: string }[];
    items: {
      occurred_at: string | null;
      direction: "credit" | "debit";
      transaction_type: string | null;
      description: string | null;
      counterparty_name: string | null;
      amount: string;
      status: "pending" | "divergent";
      divergence: string | null;
    }[];
    items_limited: boolean;
  };
};

export async function fetchConsolidatedReport(monthFrom: string, monthTo: string): Promise<ConsolidatedReport> {
  const { data } = await api.get("/finance/reports/consolidated", { params: { month_from: monthFrom, month_to: monthTo } });
  return data.body ?? data;
}
