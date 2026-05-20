export type BillingSettingsScope = "billing" | "payment" | "enrollment";

export type BillingSettingsFieldType = "bool" | "int" | "string" | "array";

export type BillingSettingsField = {
  type: BillingSettingsFieldType;
  default: unknown;
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
  Record<string, unknown>
>;

export type BillingSettingsScopeDescriptions = Partial<
  Record<BillingSettingsScope, string>
>;

export type ProviderCapabilities = Record<string, string[]>;

export type BillingSettingsPersistedField = {
  value: unknown;
  description?: string | null;
  updated_at?: string | null;
};

export type BillingSettingsPersisted = Record<
  BillingSettingsScope,
  Record<string, BillingSettingsPersistedField>
>;

export type BillingSettingsSchemaResponse = {
  schema: BillingSettingsSchema;
  defaults: BillingSettingsValues;
  scope_descriptions?: BillingSettingsScopeDescriptions;
  provider_capabilities?: ProviderCapabilities;
  tenant_id?: number;
  mode?: string;
  settings?: BillingSettingsValues;
  persisted_settings?: BillingSettingsPersisted;
};

export type BillingSettingsResponse = {
  tenant_id: number;
  mode?: string;
  settings: BillingSettingsValues;
  persisted_settings?: BillingSettingsPersisted;
};

export type BillingSettingsScopeResponse = {
  tenant_id: number;
  scope: BillingSettingsScope;
  values: Record<string, unknown>;
  values_meta?: Record<string, BillingSettingsPersistedField>;
};
