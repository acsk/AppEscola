import api from "./api";

export type SaasMonth = {
  month: string;
  label: string;
  new_tenants: number;
  total_tenants: number;
  new_students: number;
  total_students: number;
};

export type SaasDashboard = {
  period: { from: string; to: string; months: number };
  tenants: { total: number; active: number; inactive: number; suspended: number; new_this_month: number; new_last_month: number };
  by_status: { status: string; total: number }[];
  students_total: number;
  users_active: number;
  practice_answers: number;
  exam_attempts: number;
  months: SaasMonth[];
  top_tenants: { id: number; name: string; status: string; photo_url: string | null; students: number; users: number; practice_answers: number }[];
};

export type TenantIntegration = {
  key: string;
  name: string;
  configured: boolean;
  active: boolean;
  /** Ambiente (Cora/Asaas) ou modelo (IA). */
  environment: string | null;
  configured_at: string | null;
  last_sync: { status: string; at: string } | null;
  /** Falhas de webhook nos últimos 7 dias. */
  recent_failures: number;
  /** Final da chave, nunca a chave inteira. */
  hint: string | null;
};

export type TenantOverview = {
  owner: { id: number; name: string; email: string; status: string } | null;
  counts: { students: number; users: number; users_active: number; classes: number; courses: number };
  usage_30d: { from: string; practice_answers: number; exam_attempts: number; active_students: number };
  last_activity_at: string | null;
  integrations: TenantIntegration[];
};

export async function fetchSaasDashboard(months: number, status: string): Promise<SaasDashboard> {
  const { data } = await api.get("/saas/dashboard", { params: { months, status: status || undefined } });
  return data.body ?? data;
}

export async function fetchTenantOverview(tenantId: number): Promise<TenantOverview> {
  const { data } = await api.get(`/saas/tenants/${tenantId}/overview`);
  return data.body ?? data;
}

export const TENANT_STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", suspended: "Suspenso" };

export const tenantStatusTone = (status: string) => (status === "active" ? "success" : status === "suspended" ? "warning" : "neutral") as "success" | "warning" | "neutral";

export const fmtInt = (value: number) => value.toLocaleString("pt-BR");
