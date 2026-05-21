import api from "./api";

type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
};

export type ContractChargePreviewRow = {
  key: string;
  type?: string;
  due_date?: string | null;
  amount?: string | null;
  description?: string;
  already_exists?: boolean;
  disabled?: boolean;
  selected_by_default?: boolean;
  /** Há boleto na Cora na mesma data — geração local não vem marcada por padrão. */
  provider_has_boleto?: boolean;
  skip_default_reason?: string;
  action: string;
};

export type ContractExternalChargeRow = {
  key: string;
  charge_id: string;
  status: string;
  amount: string | null;
  due_date: string | null;
  description: string;
  linked_invoice_id: number | null;
  link_status: "new" | "linked" | "updatable" | "other";
  for_this_enrollment?: boolean;
  matches_payer?: boolean;
  syncable?: boolean;
  selected_by_default?: boolean;
  action: string;
  group_count?: number;
  charge_ids?: string[];
};

export type ProviderBoletoSchoolGroup = {
  due_date: string | null;
  amount: string | null;
  status: string;
  count: number;
};

export type ContractChargesPreview = {
  enrollment_id: number;
  title: string;
  environment: string;
  charges_generated_at: string | null;
  charges_batch_generated: boolean;
  summary: {
    local_count: number;
    local_with_gateway: number;
    to_generate_count: number;
    to_sync_count: number;
    external_total: number;
    external_boleto_total: number;
    external_for_enrollment: number;
    external_matches_payer: number;
    external_boleto_school_groups?: number;
    provider_fetch_error: string | null;
  };
  warnings: string[];
  blocked: {
    contract_batch_generated: boolean;
    monthlies_blocked_by_fee: boolean;
  };
  local_invoices: Array<{
    invoice_id: number;
    type: string;
    description: string;
    due_date: string;
    amount: string;
    status: string;
    payment_method: string | null;
    cora_charge_id: string | null;
    cora_status: string | null;
    has_active_gateway_charge: boolean;
    source: string;
  }>;
  to_generate: ContractChargePreviewRow[];
  external_charges: ContractExternalChargeRow[];
  /** Boletos vinculados à matrícula ou ao mesmo CPF (sincronizáveis). */
  provider_boleto_list: ContractExternalChargeRow[];
  /** Resumo agrupado dos demais boletos da escola (outros alunos). */
  provider_boleto_school_groups?: ProviderBoletoSchoolGroup[];
  /** Presente quando preview é chamado com debug=1 (super_admin ou CORA_CONTRACT_CHARGES_DEBUG). */
  debug?: Record<string, unknown>;
};

export type ContractChargesApplyResult = {
  enrollment_id: number;
  environment: string;
  generated: {
    created: number;
    existing: number;
    items: Array<Record<string, unknown>>;
  };
  sync: {
    created: number;
    updated: number;
    ignored: number;
    external_total: number;
    processed_charge_ids: string[];
  } | null;
  charges_generated_at: string | null;
};

function unwrapBody<T>(data: ApiEnvelope<T> | T): T {
  if (data && typeof data === "object" && "body" in (data as ApiEnvelope<T>)) {
    return (data as ApiEnvelope<T>).body as T;
  }

  return data as T;
}

export async function fetchContractChargesPreview(
  enrollmentId: number,
  params?: {
    environment?: "stage" | "prod";
    invoice_types?: string[];
    /** Use 1 na query (evita rejeição da validação com boolean do axios). */
    debug?: boolean | 0 | 1;
  }
): Promise<ContractChargesPreview> {
  const queryParams = params ? { ...params } : undefined;
  if (queryParams) {
    if (queryParams.debug) {
      queryParams.debug = 1;
    } else {
      delete queryParams.debug;
    }
  }

  const { data } = await api.get<ApiEnvelope<ContractChargesPreview>>(
    `/enrollments/${enrollmentId}/contract-charges/preview`,
    { params: queryParams }
  );

  return unwrapBody(data);
}

export async function applyContractCharges(
  enrollmentId: number,
  payload: {
    environment?: "stage" | "prod";
    generate_keys?: string[];
    sync_charge_ids?: string[];
    create_missing?: boolean;
  }
): Promise<{ result: ContractChargesApplyResult; message: string }> {
  const { data } = await api.post<ApiEnvelope<ContractChargesApplyResult>>(
    `/enrollments/${enrollmentId}/contract-charges/apply`,
    payload
  );

  const envelope = data as ApiEnvelope<ContractChargesApplyResult>;

  return {
    result: unwrapBody(data),
    message: envelope?.message ?? "Operação concluída.",
  };
}
