import api from "./api";
import { unwrapApi, type ApiEnvelope } from "../types/api";

export type {
  ChargeStatusResponse,
  CoraEnvironmentSettings,
  CoraSettingsResponse,
  GeneratedCharge,
  GenerateChargePayload,
  InvoicePaymentAssets,
  InvoicePaymentOptionsResponse,
  InvoiceReceiptEnrollment,
  InvoiceReceiptInvoice,
  InvoiceReceiptPayer,
  InvoiceReceiptResponse,
  InvoiceReceiptSchool,
  InvoiceReceiptStudent,
  PaidChargeResponse,
  PayChargePayload,
  PaymentConnectionTestResult,
  PaymentProvider,
  PaymentProviderSchema,
  PaymentProviderSchemaField,
} from "../types/payments";
import type {
  ChargeStatusResponse,
  CoraSettingsResponse,
  GeneratedCharge,
  GenerateChargePayload,
  InvoicePaymentOptionsResponse,
  InvoiceReceiptResponse,
  PaidChargeResponse,
  PayChargePayload,
  PaymentConnectionTestResult,
  PaymentProvider,
  PaymentProviderSchema,
} from "../types/payments";

export const listPaymentProviders = async (): Promise<PaymentProvider[]> => {
  const defaultProviders: PaymentProvider[] = [
    {
      slug: "cora",
      name: "Cora",
      logo_url: null,
      status: "active",
      capabilities: ["pix", "boleto", "hybrid", "webhook", "mtls_cert_upload"],
    },
  ];

  const mapProviderItem = (item: any): PaymentProvider => ({
    slug: String(item?.slug ?? ""),
    name: String(item?.name ?? ""),
    logo_url: item?.logo_url ? String(item.logo_url) : null,
    status: item?.status ?? (item?.is_active === false ? "inactive" : "active"),
    capabilities: Array.isArray(item?.capabilities) ? item.capabilities : [],
  });

  try {
    const { data } = await api.get<ApiEnvelope<PaymentProvider[]>>("/payment-gateway-providers");
    const providers = unwrapApi<PaymentProvider[]>(data);
    const mapped = Array.isArray(providers)
      ? providers.map((item) => mapProviderItem(item)).filter((item) => item.slug !== "")
      : [];
    return mapped.length > 0 ? mapped : defaultProviders;
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
        .map((item: any) => mapProviderItem(item))
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
  return unwrapApi<PaymentProviderSchema>(data);
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
      return unwrapApi<CoraSettingsResponse>(data);
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
    return unwrapApi<PaymentConnectionTestResult>(data);
  } catch (error: any) {
    if (provider === "cora" && error?.response?.status === 404) {
      const { data } = await api.post<ApiEnvelope<Record<string, unknown>>>(
        `/tenants/${tenantId}/cora-settings/token`,
        { environment }
      );
      const tokenData = unwrapApi<Record<string, unknown>>(data);
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
    return unwrapApi<GeneratedCharge>(data);
  } catch (error: any) {
    if (payload.provider === "cora" && error?.response?.status === 404) {
      const { data } = await api.post<ApiEnvelope<Record<string, unknown>>>(
        `/invoices/${invoiceId}/generate-cora-charge`
      );
      const legacy = unwrapApi<Record<string, unknown>>(data);
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
  return unwrapApi<ChargeStatusResponse>(data);
};

export const getInvoiceReceipt = async (
  invoiceId: number
): Promise<InvoiceReceiptResponse> => {
  const { data } = await api.get<ApiEnvelope<InvoiceReceiptResponse>>(
    `/invoices/${invoiceId}/receipt`
  );
  return unwrapApi<InvoiceReceiptResponse>(data);
};

export const getInvoicePaymentOptions = async (
  invoiceId: number
): Promise<InvoicePaymentOptionsResponse> => {
  const { data } = await api.get<ApiEnvelope<InvoicePaymentOptionsResponse>>(
    `/invoices/${invoiceId}/payment-options`
  );
  return unwrapApi<InvoicePaymentOptionsResponse>(data);
};

export const payUnifiedCharge = async (
  invoiceId: number,
  payload: PayChargePayload = { environment: "stage" }
): Promise<PaidChargeResponse> => {
  const { data } = await api.post<ApiEnvelope<PaidChargeResponse>>(
    `/invoices/${invoiceId}/pay-charge`,
    payload
  );
  return unwrapApi<PaidChargeResponse>(data);
};
