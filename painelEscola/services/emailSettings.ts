import api from "./api";

/** E-mail da escola (provedor de envio: Resend). A chave nunca volta da API — só key_hint. */

export type EmailSettings = {
  providers: { key: string; label: string }[];
  configured: boolean;
  provider: string;
  key_hint: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  active: boolean;
  domain_status: "verified" | "pending" | "not_found" | "unknown" | null;
  verified_at: string | null;
  last_error: string | null;
  configured_at: string | null;
  month: { sent: number; failed: number };
};

export type EmailLogItem = {
  id: number;
  category: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  provider: string;
  provider_message_id: string | null;
  error: string | null;
  user: string | null;
  created_at: string;
};

const params = (tenantId?: number | null) => (tenantId != null ? { tenant_id: tenantId } : undefined);

export async function fetchEmailSettings(tenantId?: number | null): Promise<EmailSettings> {
  const { data } = await api.get("/email-settings", { params: params(tenantId) });
  return data.body;
}

export const saveEmailSettings = (
  payload: { provider: string; api_key?: string; from_email: string; from_name?: string | null; reply_to?: string | null; active: boolean },
  tenantId?: number | null
) => api.put("/email-settings", payload, { params: params(tenantId) });

export const deleteEmailSettings = (tenantId?: number | null) => api.delete("/email-settings", { params: params(tenantId) });
export const verifyEmailSettings = (tenantId?: number | null) => api.post("/email-settings/verify", {}, { params: params(tenantId) });
export const sendTestEmail = (to: string, tenantId?: number | null) => api.post("/email-settings/test", { to }, { params: params(tenantId) });

export async function fetchEmailLogs(page: number, tenantId?: number | null) {
  const { data } = await api.get("/email-settings/logs", { params: { page, ...(params(tenantId) ?? {}) } });
  return data.body as { items: EmailLogItem[]; meta: { current_page: number; last_page: number; per_page: number; total: number } };
}

export const DOMAIN_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  verified: { label: "Domínio verificado", tone: "success" },
  pending: { label: "Domínio pendente", tone: "warning" },
  not_found: { label: "Domínio não cadastrado", tone: "danger" },
  unknown: { label: "Domínio não conferido", tone: "neutral" },
};
