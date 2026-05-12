import api from "./api";

type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
  data?: T;
};

export type PaymentProvider = {
  slug: string;
  name: string;
  status: "active" | "inactive" | string;
  capabilities: string[];
};

export type PaymentProviderSchemaField = {
  name: string;
  type: "text" | "select" | "file" | string;
  required: boolean;
  options?: string[];
  label?: string;
  placeholder?: string;
};

export type PaymentProviderSchema = {
  provider: string;
  fields: PaymentProviderSchemaField[];
  configured?: boolean;
  environments?: {
    stage?: boolean;
    prod?: boolean;
  };
};

export type PaymentConnectionTestResult = {
  ok: boolean;
  provider_status?: string;
  expires_in?: number;
  environment?: string;
};

export type CoraEnvironmentSettings = {
  environment: string | null;
  client_id: string | null;
  configured: boolean;
  configured_at: string | null;
  cert_uploaded: boolean;
  key_uploaded: boolean;
  test_account_main_cpf?: string | null;
  test_account_main_password?: string | null;
  test_account_secondary_cpf?: string | null;
  test_account_secondary_password?: string | null;
};

export type CoraSettingsResponse = {
  tenant_id: number;
  cora: {
    stage: CoraEnvironmentSettings;
    prod: CoraEnvironmentSettings;
  };
};

export type GenerateChargePayload = {
  provider: string;
  method: string;
  environment?: "stage" | "prod";
};

export type GeneratedCharge = {
  invoice_id: number;
  provider: string;
  environment?: string;
  charge_id: string;
  status: string;
  payment_url: string | null;
  pix_copy_paste: string | null;
  qr_code_image_url: string | null;
  expires_at: string | null;
  raw?: Record<string, unknown>;
};

export type ChargeStatusResponse = {
  provider: string;
  status: string;
  paid_at: string | null;
  raw?: Record<string, unknown>;
};

const unwrap = <T>(payload: ApiEnvelope<T> | T): T => {
  const casted = payload as ApiEnvelope<T>;
  return (casted?.body ?? casted?.data ?? payload) as T;
};

export const listPaymentProviders = async (): Promise<PaymentProvider[]> => {
  const { data } = await api.get<ApiEnvelope<PaymentProvider[]>>("/payment-providers");
  const providers = unwrap<PaymentProvider[]>(data);
  return Array.isArray(providers) ? providers : [];
};

export const getPaymentProviderSettingsSchema = async (
  tenantId: number,
  provider: string
): Promise<PaymentProviderSchema> => {
  const { data } = await api.get<ApiEnvelope<PaymentProviderSchema>>(
    `/tenants/${tenantId}/payment-providers/${provider}/settings-schema`
  );
  return unwrap<PaymentProviderSchema>(data);
};

export const savePaymentProviderSettings = async (
  tenantId: number,
  provider: string,
  payload: FormData | Record<string, unknown>
): Promise<void> => {
  try {
    await api.post(
      `/tenants/${tenantId}/payment-providers/${provider}/settings`,
      payload
    );
    return;
  } catch (error: any) {
    // Fallback para endpoint legado durante transicao.
    if (
      provider === "cora" &&
      error?.response?.status === 404 &&
      typeof FormData !== "undefined" &&
      payload instanceof FormData
    ) {
      await api.post(`/tenants/${tenantId}/cora-settings/upload`, payload);
      return;
    }
    throw error;
  }
};

export const getPaymentProviderCurrentSettings = async (
  tenantId: number,
  provider: string
): Promise<CoraSettingsResponse | null> => {
  try {
    if (provider === "cora") {
      const { data } = await api.get<ApiEnvelope<CoraSettingsResponse>>(
        `/tenants/${tenantId}/cora-settings`
      );
      return unwrap<CoraSettingsResponse>(data);
    }

    return null;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }

    throw error;
  }
};

export const testPaymentProviderConnection = async (
  tenantId: number,
  provider: string,
  environment: "stage" | "prod" = "stage"
): Promise<PaymentConnectionTestResult> => {
  try {
    const { data } = await api.post<ApiEnvelope<PaymentConnectionTestResult>>(
      `/tenants/${tenantId}/payment-providers/${provider}/test-connection`,
      { environment }
    );
    return unwrap<PaymentConnectionTestResult>(data);
  } catch (error: any) {
    if (provider === "cora" && error?.response?.status === 404) {
      const { data } = await api.post<ApiEnvelope<Record<string, unknown>>>(
        `/tenants/${tenantId}/cora-settings/token`,
        { environment }
      );
      const tokenData = unwrap<Record<string, unknown>>(data);
      return {
        ok: !!tokenData?.access_token,
        provider_status: tokenData?.access_token ? "connected" : "disconnected",
        expires_in: Number(tokenData?.expires_in ?? 0),
        environment,
      };
    }
    throw error;
  }
};

export const generateUnifiedCharge = async (
  invoiceId: number,
  payload: GenerateChargePayload
): Promise<GeneratedCharge> => {
  try {
    const { data } = await api.post<ApiEnvelope<GeneratedCharge>>(
      `/invoices/${invoiceId}/generate-charge`,
      payload
    );
    return unwrap<GeneratedCharge>(data);
  } catch (error: any) {
    if (payload.provider === "cora" && error?.response?.status === 404) {
      const { data } = await api.post<ApiEnvelope<Record<string, unknown>>>(
        `/invoices/${invoiceId}/generate-cora-charge`
      );
      const legacy = unwrap<Record<string, unknown>>(data);
      return {
        invoice_id: Number(legacy?.invoice_id ?? invoiceId),
        provider: "cora",
        charge_id: String(legacy?.charge_id ?? legacy?.id ?? ""),
        status: String(legacy?.status ?? "pending"),
        payment_url: (legacy?.payment_url as string) ?? null,
        pix_copy_paste:
          (legacy?.pix_copy_paste as string) ??
          (legacy?.pix_emv as string) ??
          (legacy?.pix_code as string) ??
          null,
        qr_code_image_url: (legacy?.qr_code_image_url as string) ?? null,
        expires_at: (legacy?.expires_at as string) ?? null,
        raw: legacy,
      };
    }
    throw error;
  }
};

export const getUnifiedChargeStatus = async (
  invoiceId: number
): Promise<ChargeStatusResponse> => {
  const { data } = await api.get<ApiEnvelope<ChargeStatusResponse>>(
    `/invoices/${invoiceId}/charge-status`
  );
  return unwrap<ChargeStatusResponse>(data);
};
