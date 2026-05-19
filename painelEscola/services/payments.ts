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
  method?: string;
  charge_id: string;
  status: string;
  payment_url: string | null;
  pix_copy_paste: string | null;
  boleto_number?: string | null;
  boleto_digitable?: string | null;
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

export type PayChargePayload = {
  environment?: "stage" | "prod";
};

export type PaidChargeResponse = {
  invoice_id: number;
  provider: string;
  environment?: string;
  status: string;
  paid_at: string | null;
  raw?: Record<string, unknown>;
};

export type InvoicePaymentAssets = {
  charge_id?: string | null;
  charge_status?: string | null;
  boleto_number?: string | null;
  boleto_digitable?: string | null;
  boleto_url?: string | null;
  pix_copy_paste?: string | null;
  pix_qr_image_url?: string | null;
  last_synced_at?: string | null;
};

export type InvoicePaymentOptionsResponse = {
  invoice: {
    id: number;
    description: string;
    amount: string;
    due_date: string | null;
    status: string;
    payment_method: string | null;
  };
  allowed_methods: string[];
  current_method: string | null;
  actions: {
    can_generate_charge: boolean;
    can_change_method: boolean;
    can_open_boleto_url?: boolean;
    can_copy_boleto_line?: boolean;
    can_copy_pix_code?: boolean;
  };
  method_lock: {
    locked: boolean;
    method: string | null;
    reason: string | null;
  };
  payment_assets: InvoicePaymentAssets;
};

const unwrap = <T>(payload: ApiEnvelope<T> | T): T => {
  const casted = payload as ApiEnvelope<T>;
  return (casted?.body ?? casted?.data ?? payload) as T;
};

export const listPaymentProviders = async (): Promise<PaymentProvider[]> => {
  const defaultProviders: PaymentProvider[] = [
    {
      slug: "cora",
      name: "Cora",
      status: "active",
      capabilities: ["pix", "boleto", "hybrid", "webhook", "mtls_cert_upload"],
    },
  ];

  try {
    const { data } = await api.get<ApiEnvelope<PaymentProvider[]>>("/payment-gateway-providers");
    const providers = unwrap<PaymentProvider[]>(data);
    return Array.isArray(providers) && providers.length > 0 ? providers : defaultProviders;
  } catch (error: any) {
    // Fallback para versões antigas/ambientes sem o endpoint dedicado.
    if (error?.response?.status !== 404) {
      throw error;
    }

    try {
      const { data } = await api.get<any>("/payment-providers");
      const maybeCollection = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.body?.data)
        ? data.body.data
        : Array.isArray(data?.body)
        ? data.body
        : [];

      const mapped = maybeCollection
        .map((item: any) => ({
          slug: String(item?.slug ?? ""),
          name: String(item?.name ?? ""),
          status: item?.is_active === false ? "inactive" : "active",
          capabilities: Array.isArray(item?.capabilities) ? item.capabilities : [],
        }))
        .filter((item: PaymentProvider) => item.slug !== "");

      return mapped.length > 0 ? mapped : defaultProviders;
    } catch {
      return defaultProviders;
    }
  }
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
        boleto_number: (legacy?.boleto_number as string) ?? null,
        boleto_digitable: (legacy?.boleto_digitable as string) ?? null,
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

export type InvoiceReceiptSchool = {
  name: string;
  corporate_name: string | null;
  cnpj: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  address: string | null;
};

export type InvoiceReceiptStudent = {
  name: string;
  document: string;
  email: string | null;
  phone: string | null;
};

export type InvoiceReceiptPayer = {
  name: string;
  document: string;
  is_guardian: boolean;
  guardian_name: string | null;
};

export type InvoiceReceiptEnrollment = {
  id: number;
  enrollment_number: string;
  school_class: string;
  start_date: string;
  end_date: string | null;
} | null;

export type InvoiceReceiptInvoice = {
  id: number;
  description: string;
  type: string;
  amount: string;
  amount_raw: number;
  due_date: string;
  paid_at: string;
  paid_at_date: string;
  paid_at_time: string;
  payment_method: string;
  payment_method_slug: string;
  cora_charge_id: string | null;
  notes: string | null;
};

export type InvoiceReceiptResponse = {
  receipt_number: string;
  receipt_hash: string;
  issued_at: string;
  school: InvoiceReceiptSchool;
  student: InvoiceReceiptStudent;
  payer: InvoiceReceiptPayer;
  enrollment: InvoiceReceiptEnrollment;
  invoice: InvoiceReceiptInvoice;
  verification: {
    message: string;
    verify_hash: string;
  };
};

export const getInvoiceReceipt = async (
  invoiceId: number
): Promise<InvoiceReceiptResponse> => {
  const { data } = await api.get<ApiEnvelope<InvoiceReceiptResponse>>(
    `/invoices/${invoiceId}/receipt`
  );
  return unwrap<InvoiceReceiptResponse>(data);
};

export const getInvoicePaymentOptions = async (
  invoiceId: number
): Promise<InvoicePaymentOptionsResponse> => {
  const { data } = await api.get<ApiEnvelope<InvoicePaymentOptionsResponse>>(
    `/invoices/${invoiceId}/payment-options`
  );
  return unwrap<InvoicePaymentOptionsResponse>(data);
};

export const payUnifiedCharge = async (
  invoiceId: number,
  payload: PayChargePayload = { environment: "stage" }
): Promise<PaidChargeResponse> => {
  const { data } = await api.post<ApiEnvelope<PaidChargeResponse>>(
    `/invoices/${invoiceId}/pay-charge`,
    payload
  );
  return unwrap<PaidChargeResponse>(data);
};
