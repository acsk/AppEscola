import api from "./api";
import type { AiCredentialSummary, AiProvider, AiSettingsResponse } from "../types/questionAi";

/** Chaves de IA do tenant (a chave nunca volta da API — só key_hint). */

const tenantParams = (tenantId?: number | null) => (tenantId != null ? { tenant_id: tenantId } : undefined);

export async function fetchAiSettings(tenantId?: number | null): Promise<AiSettingsResponse> {
  const { data } = await api.get("/ai-settings", { params: tenantParams(tenantId) });
  return data.body;
}

export async function saveAiCredential(
  provider: AiProvider,
  payload: { api_key?: string; model?: string | null; active?: boolean },
  tenantId?: number | null
) {
  const { data } = await api.put(`/ai-settings/${provider}`, payload, { params: tenantParams(tenantId) });
  return data as { type: string; message: string; body: AiCredentialSummary };
}

export async function deleteAiCredential(provider: AiProvider, tenantId?: number | null) {
  const { data } = await api.delete(`/ai-settings/${provider}`, { params: tenantParams(tenantId) });
  return data as { type: string; message: string };
}

export type AiSpend = {
  month: {
    requests: number;
    errors: number;
    tokens: number;
    cost_usd: number;
    embeddings_cost_usd: number;
    tenant_key_cost_usd: number;
    platform_key_cost_usd: number;
    platform_key_requests: number;
    limit: number | null;
  };
  total: { requests: number; tokens: number; cost_usd: number; since: string | null };
  by_provider: { provider: string; requests: number; errors: number; tokens: number; cost_usd: number; last_used_at: string | null }[];
  by_feature: { feature: string; requests: number; cost_usd: number }[];
  months: { month: string; label: string; requests: number; cost_usd: number }[];
};

/** Uso e gasto de IA da escola (mês, 6 meses, total, por provedor e por recurso). */
export async function fetchAiSpend(tenantId?: number | null): Promise<AiSpend> {
  const { data } = await api.get("/ai-settings/usage", { params: tenantParams(tenantId) });
  return data.body;
}
