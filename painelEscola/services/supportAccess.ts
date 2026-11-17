import api from "./api";

export type SupportAccessReason = { id: number; name: string; requires_details: boolean };

export type SupportAccessHistoryItem = {
  id: number;
  tenant: { id: number; name: string | null };
  user: { id: number; name: string | null };
  /** Preenchido quando o acesso foi ao app, na conta do aluno. */
  student?: { id: number | null; name: string | null; enrollment_number: string | null } | null;
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

/** Abre o app web na conta do aluno. A resposta traz o link de uso único, sem a senha. */
export async function startStudentMobileAccess(
  studentId: number,
  request: { reason_id: number; details?: string; duration_minutes: number }
): Promise<{ launch_url: string | null; expires_at: string }> {
  const { data } = await api.post(`/students/${studentId}/mobile-access`, request);
  return data.body ?? data;
}
