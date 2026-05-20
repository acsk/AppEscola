import api from "./api";
import { unwrapApi } from "../types/api";

export type {
  BillingSettingsField,
  BillingSettingsFieldType,
  BillingSettingsPersisted,
  BillingSettingsPersistedField,
  BillingSettingsResponse,
  BillingSettingsSchema,
  BillingSettingsSchemaResponse,
  BillingSettingsScope,
  BillingSettingsScopeDescriptions,
  BillingSettingsScopeResponse,
  BillingSettingsValues,
  ProviderCapabilities,
} from "../types/settings";
import type {
  BillingSettingsPersisted,
  BillingSettingsPersistedField,
  BillingSettingsResponse,
  BillingSettingsSchema,
  BillingSettingsSchemaResponse,
  BillingSettingsScope,
  BillingSettingsScopeResponse,
  BillingSettingsValues,
  ProviderCapabilities,
} from "../types/settings";

const DEFAULT_ENABLED_BY_PROVIDER: Record<string, string[]> = {
  cora: ["pix", "boleto", "hybrid"],
  manual: ["pix", "boleto", "cash", "transfer"],
};

const DEFAULT_METHOD_BY_PROVIDER: Record<string, string> = {
  cora: "hybrid",
  manual: "cash",
};

/**
 * Ajusta formas de pagamento ao trocar o provedor (espelha o backend).
 */
export function normalizePaymentDraftForProvider(
  provider: string,
  current: Record<string, any>,
  capabilities: ProviderCapabilities
): Record<string, any> {
  const slug = provider.trim().toLowerCase();
  const allowed = capabilities[slug] ?? [];
  const next: Record<string, any> = { ...current, default_provider: slug };

  if (slug === "manual") {
    next.auto_sync_charges = false;
  }

  let enabled: string[] = Array.isArray(current.enabled_methods)
    ? current.enabled_methods.map(String)
    : DEFAULT_ENABLED_BY_PROVIDER[slug] ?? allowed.slice(0, 3);

  enabled = enabled.map((m) => (m === "bank_slip" ? "boleto" : m));
  enabled = Array.from(new Set(enabled.filter((m) => allowed.includes(m))));

  if (enabled.length === 0) {
    const fallback = DEFAULT_ENABLED_BY_PROVIDER[slug] ?? allowed;
    enabled = fallback.filter((m) => allowed.includes(m));
  }

  next.enabled_methods = enabled;

  let defaultMethod = String(current.default_method ?? "");
  defaultMethod = defaultMethod === "bank_slip" ? "boleto" : defaultMethod;

  if (!defaultMethod || !enabled.includes(defaultMethod)) {
    const preferred = DEFAULT_METHOD_BY_PROVIDER[slug] ?? enabled[0] ?? "pix";
    next.default_method = enabled.includes(preferred) ? preferred : enabled[0];
  } else {
    next.default_method = defaultMethod;
  }

  return next;
}

export const PAYMENT_SETTINGS_FIELD_ORDER = [
  "default_provider",
  "enabled_methods",
  "default_method",
  "auto_sync_charges",
] as const;

export function applyProviderCapabilitiesToSchema(
  baseSchema: BillingSettingsSchema,
  provider: string,
  capabilities: ProviderCapabilities
): BillingSettingsSchema {
  const methods = capabilities[provider] ?? [];
  const payment = { ...(baseSchema.payment || {}) };

  if (payment.enabled_methods) {
    payment.enabled_methods = {
      ...payment.enabled_methods,
      options: methods.length > 0 ? methods : payment.enabled_methods.options,
    };
  }

  if (payment.default_method) {
    payment.default_method = {
      ...payment.default_method,
      options: methods.length > 0 ? methods : payment.default_method.options,
    };
  }

  if (provider === "manual") {
    delete payment.auto_sync_charges;
  }

  return { ...baseSchema, payment };
}

const tenantParams = (tenantId?: number | null) =>
  tenantId != null ? { tenant_id: tenantId } : undefined;

const SCOPES: BillingSettingsScope[] = ["billing", "payment", "enrollment"];

/**
 * Enriquecimento opcional: aplica `description` e `updated_at` vindos de
 * `persisted_settings` sobre o schema definitivo (`GET /schema`).
 */
export const enrichSchemaWithPersisted = (
  schema: BillingSettingsSchema,
  persisted: BillingSettingsPersisted | undefined | null
): BillingSettingsSchema => {
  if (!persisted) return schema;
  const out: BillingSettingsSchema = { billing: {}, payment: {}, enrollment: {} };
  SCOPES.forEach((scope) => {
    const scopeSchema = schema[scope] || {};
    const scopePersisted = persisted[scope] || {};
    Object.entries(scopeSchema).forEach(([key, field]) => {
      const p = scopePersisted[key];
      out[scope][key] = p?.description
        ? { ...field, description: p.description }
        : field;
    });
  });
  return out;
};

export async function getBillingSettingsSchema(
  tenantId?: number | null
): Promise<BillingSettingsSchemaResponse> {
  const { data } = await api.get("/tenant-billing-settings/schema", {
    params: tenantParams(tenantId),
  });
  return unwrapApi<BillingSettingsSchemaResponse>(data);
}

export async function getBillingSettings(
  tenantId?: number | null
): Promise<BillingSettingsResponse> {
  const { data } = await api.get("/tenant-billing-settings", {
    params: tenantParams(tenantId),
  });
  return unwrapApi<BillingSettingsResponse>(data);
}

export async function updateBillingSettingsScope(
  scope: BillingSettingsScope,
  values: Record<string, any>,
  tenantId?: number | null
): Promise<BillingSettingsScopeResponse> {
  const { data } = await api.put(
    `/tenant-billing-settings/${scope}`,
    { values },
    { params: tenantParams(tenantId) }
  );
  return unwrapApi<BillingSettingsScopeResponse>(data);
}

export async function resetBillingSettingsScope(
  scope: BillingSettingsScope,
  tenantId?: number | null
): Promise<BillingSettingsScopeResponse> {
  const { data } = await api.post(
    `/tenant-billing-settings/${scope}/reset`,
    {},
    { params: tenantParams(tenantId) }
  );
  return unwrapApi<BillingSettingsScopeResponse>(data);
}
