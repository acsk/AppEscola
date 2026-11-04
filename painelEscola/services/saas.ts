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
  /** Receita das assinaturas SaaS (nunca das mensalidades escolares). */
  revenue: {
    mrr: string;
    arr: string;
    arpa: string;
    active_subscriptions: number;
    trialing: number;
    past_due: number;
    legacy_tenants: number;
    canceled_this_month: number;
    churn_rate: number;
    mrr_months: { month: string; label: string; mrr: number }[];
    by_plan: { plan: string; tenants: number; mrr: string }[];
  };
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

// ── Fase 2: planos, assinaturas, funcionalidades e quotas ─────────────────────

export type QuotaResource = { key: string; label: string; unit: string; monthly: boolean };

export type SaasFeature = { key: string; name: string; description: string | null; global_status: "enabled" | "beta" | "disabled" };

export type SaasPlan = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: string;
  price_yearly: string | null;
  trial_days: number;
  status: "active" | "inactive";
  limits: Record<string, number | null> | null;
  features: string[] | null;
  order: number;
  subscriptions_count: number;
};

export type SaasPlanPayload = Omit<SaasPlan, "id" | "slug" | "subscriptions_count" | "price_monthly" | "price_yearly" | "limits"> & {
  price_monthly: number;
  price_yearly: number | null;
  limits: Record<string, number | null>;
};

export type Subscription = {
  id: number;
  plan: { id: number; name: string } | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  billing_cycle: "monthly" | "yearly";
  price: string;
  discount_percent: string;
  net_price: string;
  monthly_revenue: string;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
};

export type SubscriptionEvent = {
  id: number;
  type: string;
  from_plan: string | null;
  to_plan: string | null;
  data: Record<string, any> | null;
  user: string | null;
  created_at: string;
};

export type TenantFeatureRow = SaasFeature & {
  enabled: boolean;
  source: "plan" | "legacy" | "override" | "beta" | "global_disabled";
  override: { enabled: boolean; reason: string | null } | null;
};

export type QuotaRow = {
  resource: string;
  label: string;
  unit: string;
  monthly: boolean;
  usage: number;
  limit: number | null;
  percent: number | null;
  level: "ok" | "warning" | "critical" | "reached";
  override?: { limit: number | null; reason: string | null } | null;
};

export type AuditItem = { id: number; action: string; description: string; user: string | null; ip: string | null; created_at: string };

export type TenantEntitlements = {
  tenant_status: string | null;
  plan?: { id: number; name: string } | null;
  /** null = sem tenant (super admin fora de um acesso). */
  features: Record<string, boolean> | null;
  quota_alerts: QuotaRow[];
};

const body = (data: any) => data?.body ?? data;

export async function fetchPlans(): Promise<{ plans: SaasPlan[]; features: SaasFeature[]; resources: QuotaResource[] }> {
  return body((await api.get("/saas/plans")).data);
}

export const savePlan = (id: number | null, payload: SaasPlanPayload) => (id ? api.put(`/saas/plans/${id}`, payload) : api.post("/saas/plans", payload));
export const deletePlan = (id: number) => api.delete(`/saas/plans/${id}`);

export async function fetchFeatureCatalog(): Promise<(SaasFeature & { plans: { id: number; name: string }[]; overrides: { enabled: number; disabled: number } })[]> {
  return body((await api.get("/saas/features")).data).features ?? [];
}

export const setFeatureGlobalStatus = (key: string, status: SaasFeature["global_status"]) => api.put(`/saas/features/${key}`, { global_status: status });

export async function fetchSubscriptions(params: { status?: string; plan_id?: string; search?: string; page?: number }) {
  const data = body((await api.get("/saas/subscriptions", { params })).data);
  return data as {
    items: { tenant: { id: number; name: string; status: string }; subscription: Subscription | null }[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
  };
}

export async function fetchTenantSubscription(tenantId: number): Promise<{ subscription: Subscription | null; events: SubscriptionEvent[] }> {
  return body((await api.get(`/saas/tenants/${tenantId}/subscription`)).data);
}

export const subscriptionAction = (tenantId: number, action: "" | "change-plan" | "renew" | "cancel" | "reactivate" | "extend-trial", payload: Record<string, unknown> = {}) =>
  api.post(`/saas/tenants/${tenantId}/subscription${action ? `/${action}` : ""}`, payload);

export const setSubscriptionDiscount = (tenantId: number, discount_percent: number) => api.put(`/saas/tenants/${tenantId}/subscription/discount`, { discount_percent });

export async function fetchTenantFeatures(tenantId: number): Promise<{ legacy: boolean; plan: { id: number; name: string } | null; features: TenantFeatureRow[] }> {
  return body((await api.get(`/saas/tenants/${tenantId}/features`)).data);
}

export const setTenantFeature = (tenantId: number, key: string, enabled: boolean, reason: string) => api.put(`/saas/tenants/${tenantId}/features/${key}`, { enabled, reason });
export const clearTenantFeature = (tenantId: number, key: string) => api.delete(`/saas/tenants/${tenantId}/features/${key}`);

export async function fetchTenantQuotas(tenantId: number): Promise<{ legacy: boolean; items: QuotaRow[] }> {
  return body((await api.get(`/saas/tenants/${tenantId}/quotas`)).data);
}

export const setTenantQuota = (tenantId: number, resource: string, limit: number | null, reason: string) => api.put(`/saas/tenants/${tenantId}/quotas/${resource}`, { limit, reason });
export const clearTenantQuota = (tenantId: number, resource: string) => api.delete(`/saas/tenants/${tenantId}/quotas/${resource}`);

export async function fetchTenantAudit(tenantId: number): Promise<AuditItem[]> {
  return body((await api.get(`/saas/tenants/${tenantId}/audit`)).data).items ?? [];
}

export async function fetchTenantEntitlements(): Promise<TenantEntitlements> {
  return body((await api.get("/tenant/entitlements")).data);
}

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "brand" }> = {
  trialing: { label: "Em teste", tone: "brand" },
  active: { label: "Ativa", tone: "success" },
  past_due: { label: "Em atraso", tone: "warning" },
  canceled: { label: "Cancelada", tone: "danger" },
  expired: { label: "Expirada", tone: "neutral" },
  legacy: { label: "Sem assinatura", tone: "neutral" },
};

export const FEATURE_STATUS: Record<SaasFeature["global_status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  enabled: { label: "Habilitada", tone: "success" },
  beta: { label: "Beta", tone: "warning" },
  disabled: { label: "Desabilitada", tone: "neutral" },
};

export const cycleLabel = (cycle: string) => (cycle === "yearly" ? "Anual" : "Mensal");

export const fmtBrl = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtIsoDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
