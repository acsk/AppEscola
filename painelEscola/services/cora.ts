import api from "./api";

type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
  data?: T;
};

export type SyncCoraChargesRequest = {
  environment: "stage" | "prod" | "production";
  charge_ids?: string[];
  create_missing?: boolean;
  async?: boolean;
};

export type SyncCoraChargesResult = {
  enrollment_id: number;
  tenant_id: number;
  environment: string;
  external_total: number;
  created: number;
  updated: number;
  ignored: number;
  processed_charge_ids: string[];
};

/**
 * Sincroniza boletos emitidos pela Cora com as cobranças locais de uma matrícula
 * @param enrollmentId ID da matrícula
 * @param payload Configurações de sincronização
 * @returns Resultado da sincronização
 */
export async function syncEnrollmentCoraCharges(
  enrollmentId: number,
  payload: SyncCoraChargesRequest = { environment: "prod", create_missing: true, async: false }
): Promise<SyncCoraChargesResult> {
  try {
    const { data } = await api.post<ApiEnvelope<SyncCoraChargesResult>>(
      `/enrollments/${enrollmentId}/sync-cora-charges`,
      payload
    );
    
    // Extrai a resposta de diferentes formatos possíveis
    const result = data?.data ?? data?.body ?? data;
    
    // Garante que temos um objeto com os campos necessários
    if (typeof result === "object" && result !== null && "enrollment_id" in result) {
      return {
        enrollment_id: (result as SyncCoraChargesResult).enrollment_id ?? 0,
        tenant_id: (result as SyncCoraChargesResult).tenant_id ?? 0,
        environment: (result as SyncCoraChargesResult).environment ?? "",
        external_total: (result as SyncCoraChargesResult).external_total ?? 0,
        created: (result as SyncCoraChargesResult).created ?? 0,
        updated: (result as SyncCoraChargesResult).updated ?? 0,
        ignored: (result as SyncCoraChargesResult).ignored ?? 0,
        processed_charge_ids: (result as SyncCoraChargesResult).processed_charge_ids ?? [],
      };
    }
    
    // Se chegou aqui e não é um objeto, retorna valores padrão
    return {
      enrollment_id: 0,
      tenant_id: 0,
      environment: "",
      external_total: 0,
      created: 0,
      updated: 0,
      ignored: 0,
      processed_charge_ids: [],
    };
  } catch (error: any) {
    const message = error?.response?.data?.message ?? "Erro ao sincronizar boletos da Cora";
    throw new Error(message);
  }
}

/**
 * Sincroniza boletos de múltiplas matrículas
 * @param enrollmentIds IDs das matrículas
 * @param payload Configurações de sincronização
 * @returns Resultados de cada sincronização
 */
export async function syncBulkEnrollmentCoraCharges(
  enrollmentIds: number[],
  payload: SyncCoraChargesRequest = { environment: "prod", create_missing: true, async: true }
): Promise<SyncCoraChargesResult[]> {
  const results: SyncCoraChargesResult[] = [];
  
  for (const enrollmentId of enrollmentIds) {
    try {
      const result = await syncEnrollmentCoraCharges(enrollmentId, payload);
      results.push(result);
    } catch (error) {
      console.error(`Erro ao sincronizar matrícula ${enrollmentId}:`, error);
    }
  }
  
  return results;
}
