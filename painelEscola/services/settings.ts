import api from "./api";

export type BillingSettingsScope = "billing" | "payment" | "enrollment";

export type BillingSettingsFieldType = "bool" | "int" | "string" | "array";

export type BillingSettingsField = {
  type: BillingSettingsFieldType;
  default: any;
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  options?: string[];
};

export type BillingSettingsSchema = Record<
  BillingSettingsScope,
  Record<string, BillingSettingsField>
>;

export type BillingSettingsValues = Record<
  BillingSettingsScope,
  Record<string, any>
>;

export type BillingSettingsScopeDescriptions = Partial<
  Record<BillingSettingsScope, string>
>;

export type BillingSettingsSchemaResponse = {
  schema: BillingSettingsSchema;
  defaults: BillingSettingsValues;
  scope_descriptions?: BillingSettingsScopeDescriptions;
  // V2: o endpoint /schema agora também devolve os valores persistidos,
  // permitindo carregar tudo em uma única chamada.
  tenant_id?: number;
  mode?: string;
  settings?: BillingSettingsValues;
  persisted_settings?: BillingSettingsPersisted;
};

export type BillingSettingsPersistedField = {
  value: any;
  description?: string | null;
  updated_at?: string | null;
};

export type BillingSettingsPersisted = Record<
  BillingSettingsScope,
  Record<string, BillingSettingsPersistedField>
>;

export type BillingSettingsResponse = {
  tenant_id: number;
  mode?: string;
  settings: BillingSettingsValues;
  persisted_settings?: BillingSettingsPersisted;
};

export type BillingSettingsScopeResponse = {
  tenant_id: number;
  scope: BillingSettingsScope;
  values: Record<string, any>;
  values_meta?: Record<string, BillingSettingsPersistedField>;
};

const unwrap = <T>(data: any): T => {
  return (data?.body ?? data) as T;
};

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
  return unwrap<BillingSettingsSchemaResponse>(data);
}

export async function getBillingSettings(
  tenantId?: number | null
): Promise<BillingSettingsResponse> {
  const { data } = await api.get("/tenant-billing-settings", {
    params: tenantParams(tenantId),
  });
  return unwrap<BillingSettingsResponse>(data);
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
  return unwrap<BillingSettingsScopeResponse>(data);
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
  return unwrap<BillingSettingsScopeResponse>(data);
}
