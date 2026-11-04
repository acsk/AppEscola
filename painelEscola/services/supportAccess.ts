import api from "./api";

export type SupportAccessReason = { id: number; name: string; requires_details: boolean };

export type SupportAccessHistoryItem = {
  id: number;
  tenant: { id: number; name: string | null };
  user: { id: number; name: string | null };
  reason: string | null;
  details: string | null;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  /** Fim real (encerrado ou expirado); null enquanto estiver em andamento. */
  ended_at: string | null;
  active: boolean;
  /** Ações que alteraram dados durante o acesso. */
  actions_count: number;
};

export async function fetchSupportAccessReasons(): Promise<{ reasons: SupportAccessReason[]; durations: number[] }> {
  const { data } = await api.get("/support-access/reasons");
  return data.body ?? data;
}

export async function fetchSupportAccessHistory(tenantId?: number): Promise<SupportAccessHistoryItem[]> {
  const { data } = await api.get("/support-access/history", { params: tenantId ? { tenant: tenantId } : undefined });
  return (data.body ?? data).items ?? [];
}

/** "30 min", "1 h", "2 h", "4 h". */
export const durationLabel = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} h`);
