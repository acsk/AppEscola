import api from "./api";

/** Valores monetários chegam como string decimal ("1234.50"); percentuais com 1 casa ("33.3"). */
export type FinanceAmount = { amount: string; count: number };

export type FinanceDashboard = {
  period: { from: string; to: string; previous_from: string; previous_to: string; today: string };
  kpis: {
    receivable: FinanceAmount;
    received: FinanceAmount & { previous_amount: string; delta_pct: string | null };
    overdue: FinanceAmount;
    forecast_30d: FinanceAmount;
    average_ticket: { amount: string | null; payers: number; previous_amount: string | null };
    delinquency: { rate: string | null; overdue_amount: string; due_amount: string; grace_days: number; previous_rate: string | null };
    pending: { count: number; due_next_7_days: number };
    /** Indisponível até a conciliação bancária existir (Fase 2). */
    reconciled: { available: boolean; count: number | null; total: number | null };
  };
  charts: {
    monthly: { period: string; label: string; expected_amount: string; received_amount: string }[];
    by_payment_method: { key: string; count: number; amount: string }[];
    aging: { key: "1_15" | "16_30" | "31_60" | "60_plus"; label: string; count: number; amount: string }[];
    by_course: { course_id: number | null; name: string; count: number; amount: string }[];
  };
  definitions: { delinquency_grace_days: number; scope: string };
  permissions: string[];
};

export async function fetchFinanceDashboard(params: { date_from: string; date_to: string }): Promise<FinanceDashboard> {
  const { data } = await api.get("/finance/dashboard", { params });
  return data.body ?? data;
}
