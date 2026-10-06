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
