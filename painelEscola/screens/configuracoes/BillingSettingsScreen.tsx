import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import PaymentProviderSelectField from "../../components/payments/PaymentProviderSelectField";
import ToastBanner from "../../components/ui/ToastBanner";
import {
  BillingSettingsField,
  BillingSettingsScope,
  BillingSettingsScopeDescriptions,
  BillingSettingsSchema,
  BillingSettingsValues,
  enrichSchemaWithPersisted,
  getBillingSettingsSchema,
  applyProviderCapabilitiesToSchema,
  normalizePaymentDraftForProvider,
  PAYMENT_SETTINGS_FIELD_ORDER,
  ProviderCapabilities,
  resetBillingSettingsScope,
  updateBillingSettingsScope,
} from "../../services/settings";

type TenantOption = { value: string; label: string };

type TenantApiItem = {
  id: number;
  name?: string;
  corporate_name?: string;
  slug?: string;
};

const SCOPE_TABS: { key: BillingSettingsScope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "billing", label: "Cobrança", icon: "cash-outline" },
  { key: "payment", label: "Pagamento", icon: "card-outline" },
  { key: "enrollment", label: "Matrícula", icon: "clipboard-outline" },
];

// Texto exibido na aba de cada escopo quando o backend não enviar
// `scope_descriptions` no /schema. O backend continua sendo a fonte de verdade.
const SCOPE_FALLBACK_DESCRIPTIONS: Record<BillingSettingsScope, string> = {
  billing: "Regras de geração de cobranças e taxa de matrícula.",
  payment: "Provedores e métodos de pagamento aceitos.",
  enrollment: "Validações exigidas durante a matrícula.",
};

const toBool = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    if (["0", "false", "no", "off", ""].includes(v)) return false;
  }
  return fallback;
};

const sanitizeValueForType = (field: BillingSettingsField, value: any): any => {
  if (field.type === "bool") {
    return toBool(value, !!field.default);
  }
  if (field.type === "int") {
    const num = typeof value === "number" ? value : parseInt(String(value), 10);
    if (!Number.isFinite(num)) return field.default;
    let next = num;
    if (typeof field.min === "number" && next < field.min) next = field.min;
    if (typeof field.max === "number" && next > field.max) next = field.max;
    return next;
  }
  if (field.type === "array") {
    if (!Array.isArray(value)) return Array.isArray(field.default) ? field.default : [];
    const options = field.options ?? [];
    const filtered = value.filter((item) => (options.length === 0 ? true : options.includes(String(item))));
    return Array.from(new Set(filtered.map(String)));
  }
  // string
  if (value == null) return "";
  return String(value);
};

const buildScopeDefaults = (scopeSchema: Record<string, BillingSettingsField>): Record<string, any> => {
  const out: Record<string, any> = {};
  Object.entries(scopeSchema || {}).forEach(([key, field]) => {
    out[key] = field.default;
  });
  return out;
};

const mergeScopeValues = (
  scopeSchema: Record<string, BillingSettingsField>,
  values: Record<string, any> | undefined
): Record<string, any> => {
  const out: Record<string, any> = {};
  Object.entries(scopeSchema || {}).forEach(([key, field]) => {
    const v = values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : field.default;
    out[key] = sanitizeValueForType(field, v);
  });
  return out;
};

const formatKey = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const optionLabel = (value: string) => {
  const labels: Record<string, string> = {
    cora: "Cora (gateway PIX/boleto)",
    manual: "Manual (secretaria / caixa)",
    pix: "PIX",
    boleto: "Boleto",
    bank_slip: "Boleto",
    hybrid: "Boleto + PIX",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    cash: "Dinheiro",
    transfer: "Transferência",
  };

  return labels[value] ?? formatKey(value);
};

const sortPaymentFields = (
  entries: [string, BillingSettingsField][]
): [string, BillingSettingsField][] => {
  const order = PAYMENT_SETTINGS_FIELD_ORDER as readonly string[];
  return [...entries].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

const inferFieldFromValue = (value: any): BillingSettingsField => {
  if (typeof value === "boolean") {
    return { type: "bool", default: value };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "int", default: value };
  }
  if (Array.isArray(value)) {
    return { type: "array", default: value, options: Array.from(new Set(value.map(String))) };
  }
  const stringValue = value == null ? "" : String(value);
  return { type: "string", default: stringValue };
};

const buildScopeSchemaFromValues = (
  values: Record<string, any> | undefined
): Record<string, BillingSettingsField> => {
  const out: Record<string, BillingSettingsField> = {};
  Object.entries(values || {}).forEach(([key, value]) => {
    out[key] = inferFieldFromValue(value);
  });
  return out;
};

const mergeScopeSchema = (
  fromSchema: Record<string, BillingSettingsField> | undefined,
  fromValues: Record<string, any> | undefined
): Record<string, BillingSettingsField> => {
  const schemaPart = fromSchema && Object.keys(fromSchema).length > 0 ? fromSchema : {};
  const valuesPart = buildScopeSchemaFromValues(fromValues);
  // Schema explícito tem prioridade (mantém labels/descriptions/options reais do backend).
  // Os valores são usados apenas para inferir chaves ausentes no schema.
  return { ...valuesPart, ...schemaPart };
};

export default function BillingSettingsScreen() {
  const { user } = useAuth();
  const { isMobile, contentPadding } = useResponsiveLayout();

  const isSuperAdmin = user?.role === "super_admin";

  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loadingTenants, setLoadingTenants] = useState(false);

  const [schema, setSchema] = useState<BillingSettingsSchema | null>(null);
  const [providerCapabilities, setProviderCapabilities] =
    useState<ProviderCapabilities>({});
  const [scopeDescriptions, setScopeDescriptions] =
    useState<BillingSettingsScopeDescriptions>({});
  const [loadingSchema, setLoadingSchema] = useState(false);

  const [drafts, setDrafts] = useState<BillingSettingsValues | null>(null);
  const [original, setOriginal] = useState<BillingSettingsValues | null>(null);
  const [errors, setErrors] = useState<Record<BillingSettingsScope, Record<string, string>>>({
    billing: {},
    payment: {},
    enrollment: {},
  });

  const [activeScope, setActiveScope] = useState<BillingSettingsScope>("billing");
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<BillingSettingsScope | null>(null);
  const [resetting, setResetting] = useState(false);

  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const showToast = (type: "success" | "error", message: string) =>
    setToast({ visible: true, type, message });

  const effectiveTenantParam: number | null | undefined = useMemo(() => {
    if (!isSuperAdmin) return undefined;
    if (!tenantId) return undefined;
    return Number(tenantId);
  }, [isSuperAdmin, tenantId]);

  const loadTenants = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingTenants(true);
    try {
      const { data } = await api.get("/tenants", { params: { per_page: 200 } });
      const list: TenantApiItem[] = Array.isArray(data?.data) ? data.data : [];
      const options = list.map((item) => ({
        value: String(item.id),
        label: item.name || item.corporate_name || item.slug || `Tenant #${item.id}`,
      }));
      setTenantOptions(options);
      if (options.length > 0) {
        setTenantId((prev) => prev || options[0].value);
      }
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar tenants.");
    } finally {
      setLoadingTenants(false);
    }
  }, [isSuperAdmin]);

  const loadSchemaAndValues = useCallback(async () => {
    if (isSuperAdmin && !tenantId) return;
    setLoadingSchema(true);
    try {
      // V2: GET /schema retorna schema + defaults + scope_descriptions
      // + settings + persisted_settings em uma única resposta.
      const schemaResp = await getBillingSettingsSchema(effectiveTenantParam);

      const baseSchema: BillingSettingsSchema = schemaResp?.schema ?? {
        billing: {},
        payment: {},
        enrollment: {},
      };

      const values: BillingSettingsValues = schemaResp?.settings ?? {
        billing: {},
        payment: {},
        enrollment: {},
      };

      const persisted = schemaResp?.persisted_settings;

      const pickScope = (
        scope: BillingSettingsScope
      ): Record<string, BillingSettingsField> => {
        const fromSchema = baseSchema[scope] || {};
        if (Object.keys(fromSchema).length > 0) return fromSchema;
        // Fallback defensivo: se o backend não retornar o schema para um escopo,
        // inferimos a partir dos valores persistidos para não quebrar a tela.
        return mergeScopeSchema({}, values[scope]);
      };

      const effectiveSchema: BillingSettingsSchema = enrichSchemaWithPersisted(
        {
          billing: pickScope("billing"),
          payment: pickScope("payment"),
          enrollment: pickScope("enrollment"),
        },
        persisted
      );

      const merged: BillingSettingsValues = {
        billing: mergeScopeValues(effectiveSchema.billing, values.billing),
        payment: mergeScopeValues(effectiveSchema.payment, values.payment),
        enrollment: mergeScopeValues(effectiveSchema.enrollment, values.enrollment),
      };

      const capabilities = schemaResp?.provider_capabilities ?? {};
      const paymentProvider = String(merged.payment?.default_provider ?? "cora").toLowerCase();

      setProviderCapabilities(capabilities);
      setSchema(
        applyProviderCapabilitiesToSchema(effectiveSchema, paymentProvider, capabilities)
      );
      setScopeDescriptions(schemaResp?.scope_descriptions ?? {});

      setDrafts(merged);
      setOriginal(merged);
      setErrors({ billing: {}, payment: {}, enrollment: {} });
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar configurações.");
    } finally {
      setLoadingSchema(false);
    }
  }, [effectiveTenantParam, isSuperAdmin, tenantId]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadSchemaAndValues();
  }, [loadSchemaAndValues]);

  const updateField = (scope: BillingSettingsScope, key: string, value: any) => {
    setDrafts((current) => {
      if (!current) return current;

      if (scope === "payment" && key === "default_provider") {
        const provider = String(value).toLowerCase();
        const normalized = normalizePaymentDraftForProvider(
          provider,
          current.payment,
          providerCapabilities
        );

        setSchema((prev) =>
          prev ? applyProviderCapabilitiesToSchema(prev, provider, providerCapabilities) : prev
        );

        return {
          ...current,
          payment: normalized,
        };
      }

      return {
        ...current,
        [scope]: { ...current[scope], [key]: value },
      };
    });
    setErrors((current) => ({
      ...current,
      [scope]: { ...current[scope], [key]: "" },
    }));
  };

  const toggleArrayValue = (scope: BillingSettingsScope, key: string, option: string) => {
    setDrafts((current) => {
      if (!current) return current;
      const currentArr: string[] = Array.isArray(current[scope][key]) ? current[scope][key] : [];
      const exists = currentArr.includes(option);
      const next = exists ? currentArr.filter((v) => v !== option) : [...currentArr, option];
      return {
        ...current,
        [scope]: { ...current[scope], [key]: next },
      };
    });
    setErrors((current) => ({
      ...current,
      [scope]: { ...current[scope], [key]: "" },
    }));
  };

  const validateScope = (scope: BillingSettingsScope): boolean => {
    if (!schema || !drafts) return false;
    const scopeSchema = schema[scope] || {};
    const scopeValues = drafts[scope] || {};
    const nextErrors: Record<string, string> = {};

    Object.entries(scopeSchema).forEach(([key, field]) => {
      const value = scopeValues[key];
      if (field.type === "int") {
        const num = typeof value === "number" ? value : parseInt(String(value), 10);
        if (!Number.isFinite(num)) {
          nextErrors[key] = "Informe um número inteiro.";
          return;
        }
        if (typeof field.min === "number" && num < field.min) {
          nextErrors[key] = `Valor mínimo: ${field.min}.`;
          return;
        }
        if (typeof field.max === "number" && num > field.max) {
          nextErrors[key] = `Valor máximo: ${field.max}.`;
          return;
        }
      }
      if (field.type === "string" && field.options && field.options.length > 0) {
        if (!field.options.includes(String(value))) {
          nextErrors[key] = "Selecione uma opção válida.";
        }
      }
      if (field.type === "array") {
        if (!Array.isArray(value)) {
          nextErrors[key] = "Valor inválido.";
        }
      }
    });

    setErrors((current) => ({ ...current, [scope]: nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const buildChangedValues = (scope: BillingSettingsScope): Record<string, any> => {
    if (!drafts || !original) return {};
    const out: Record<string, any> = {};
    const currentScope = drafts[scope] || {};
    const originalScope = original[scope] || {};
    Object.keys(currentScope).forEach((key) => {
      const newVal = currentScope[key];
      const oldVal = originalScope[key];
      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        out[key] = newVal;
      }
    });
    return out;
  };

  const hasChanges = (scope: BillingSettingsScope): boolean => {
    return Object.keys(buildChangedValues(scope)).length > 0;
  };

  const handleSave = async (scope: BillingSettingsScope) => {
    if (!validateScope(scope)) return;
    const payload = buildChangedValues(scope);
    if (Object.keys(payload).length === 0) {
      showToast("success", "Nenhuma alteração para salvar.");
      return;
    }

    setSaving(true);
    try {
      await updateBillingSettingsScope(scope, payload, effectiveTenantParam);
      // V2: recarregar /schema após alterações para refletir defaults/options
      // recomputados pelo backend (ex.: troca de provider altera methods).
      await loadSchemaAndValues();
      showToast("success", `Configurações de ${scope === "billing" ? "cobrança" : scope === "payment" ? "pagamento" : "matrícula"} salvas com sucesso.`);
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetBillingSettingsScope(resetTarget, effectiveTenantParam);
      // V2: recarregar /schema após reset para garantir consistência
      // com defaults/options recomputados pelo backend.
      await loadSchemaAndValues();
      showToast("success", "Configurações restauradas para o padrão.");
      setResetTarget(null);
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao restaurar padrões.");
    } finally {
      setResetting(false);
    }
  };

  const renderField = (
    scope: BillingSettingsScope,
    key: string,
    field: BillingSettingsField
  ) => {
    if (!drafts) return null;
    const value = drafts[scope][key];
    const error = errors[scope]?.[key] || "";
    const label = field.label || formatKey(key);
    const description = field.description;

    if (field.type === "bool") {
      const checked = !!value;
      return (
        <View key={key} className="mb-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-gray-800">{label}</Text>
              {description ? (
                <Text className="text-xs text-gray-500 mt-1">{description}</Text>
              ) : null}
            </View>
            <Switch
              value={checked}
              onValueChange={(v) => updateField(scope, key, v)}
              trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }}
              thumbColor={checked ? "#7C3AED" : "#F9FAFB"}
            />
          </View>
          {error ? <Text className="text-xs text-red-500 mt-2">{error}</Text> : null}
        </View>
      );
    }

    if (field.type === "int") {
      const rangeHint = [
        typeof field.min === "number" ? `mín ${field.min}` : null,
        typeof field.max === "number" ? `máx ${field.max}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <View key={key}>
          <FormInput
            label={label + (rangeHint ? ` (${rangeHint})` : "")}
            value={value == null ? "" : String(value)}
            onChangeText={(t) => {
              const cleaned = t.replace(/[^0-9-]/g, "");
              const num = cleaned === "" || cleaned === "-" ? cleaned : parseInt(cleaned, 10);
              updateField(scope, key, num as any);
            }}
            keyboardType="numeric"
            error={error}
          />
          {description ? (
            <Text className="-mt-3 mb-4 text-xs text-gray-500">{description}</Text>
          ) : null}
        </View>
      );
    }

    if (field.type === "string") {
      if (field.options && field.options.length > 0) {
        if (scope === "payment" && key === "default_provider") {
          return (
            <View key={key}>
              <PaymentProviderSelectField
                label={label}
                description={description}
                required
                value={String(value ?? "")}
                options={field.options}
                onChange={(slug) => updateField(scope, key, slug)}
                error={error}
              />
            </View>
          );
        }

        const provider = String(drafts?.payment?.default_provider ?? "cora").toLowerCase();
        let selectOptions = field.options;

        if (scope === "payment" && key === "default_method") {
          const enabled: string[] = Array.isArray(drafts?.payment?.enabled_methods)
            ? drafts.payment.enabled_methods
            : [];
          const pool = providerCapabilities[provider] ?? field.options;
          selectOptions = pool.filter((opt) => enabled.includes(opt));
          if (selectOptions.length === 0) {
            selectOptions = pool;
          }
        }

        return (
          <View key={key}>
            <FormSelect
              label={label}
              value={String(value ?? "")}
              options={selectOptions.map((opt) => ({ value: opt, label: optionLabel(opt) }))}
              onChange={(v) => updateField(scope, key, v)}
              error={error}
            />
            {description ? (
              <Text className="-mt-3 mb-4 text-xs text-gray-500">{description}</Text>
            ) : null}
          </View>
        );
      }
      return (
        <View key={key}>
          <FormInput
            label={label}
            value={String(value ?? "")}
            onChangeText={(t) => updateField(scope, key, t)}
            error={error}
          />
          {description ? (
            <Text className="-mt-3 mb-4 text-xs text-gray-500">{description}</Text>
          ) : null}
        </View>
      );
    }

    if (field.type === "array") {
      const provider = String(drafts?.payment?.default_provider ?? "cora").toLowerCase();
      const options =
        scope === "payment" && key === "enabled_methods" && providerCapabilities[provider]
          ? providerCapabilities[provider]
          : field.options ?? [];
      const arr: string[] = Array.isArray(value) ? value : [];
      return (
        <View key={key} className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">{label}</Text>
          {description ? (
            <Text className="text-xs text-gray-500 mb-2">{description}</Text>
          ) : null}
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {options.length === 0 ? (
              <Text className="text-xs text-gray-400">Nenhuma opção disponível.</Text>
            ) : (
              options.map((opt) => {
                const selected = arr.includes(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => toggleArrayValue(scope, key, opt)}
                    activeOpacity={0.8}
                    className={`flex-row items-center px-3 py-2 rounded-xl border ${
                      selected
                        ? "bg-violet-50 border-violet-300"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={16}
                      color={selected ? "#7C3AED" : "#9CA3AF"}
                    />
                    <Text
                      className={`ml-2 text-xs font-semibold ${
                        selected ? "text-violet-700" : "text-gray-600"
                      }`}
                    >
                      {optionLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          {error ? <Text className="text-xs text-red-500 mt-2">{error}</Text> : null}
        </View>
      );
    }

    return null;
  };

  const renderActiveScope = () => {
    if (!schema || !drafts) return null;
    const scopeSchema = schema[activeScope] || {};
    let entries = Object.entries(scopeSchema);

    if (activeScope === "payment") {
      const provider = String(drafts.payment?.default_provider ?? "cora").toLowerCase();
      const dynamicSchema = applyProviderCapabilitiesToSchema(
        schema,
        provider,
        providerCapabilities
      ).payment;
      entries = sortPaymentFields(Object.entries(dynamicSchema));
    }

    return (
      <View>
        <Text className="text-xs text-gray-500 mb-4">
          {scopeDescriptions[activeScope] ?? SCOPE_FALLBACK_DESCRIPTIONS[activeScope]}
        </Text>

        {entries.length === 0 ? (
          <View className="py-12 items-center">
            <Ionicons name="folder-open-outline" size={28} color="#9CA3AF" />
            <Text className="mt-2 text-sm text-gray-500">
              Nenhuma configuração disponível para este escopo.
            </Text>
          </View>
        ) : (
          entries.map(([key, field]) => renderField(activeScope, key, field))
        )}

        <View
          className="mt-2 pt-4 border-t border-gray-100"
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            onPress={() => setResetTarget(activeScope)}
            disabled={saving || resetting}
            className="px-4 py-3 rounded-xl border border-gray-200 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-sm font-semibold text-gray-700">
              Restaurar padrões
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSave(activeScope)}
            disabled={saving || !hasChanges(activeScope)}
            className={`px-5 py-3 rounded-xl items-center ${
              !hasChanges(activeScope) || saving ? "bg-violet-300" : "bg-violet-600"
            }`}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-sm font-bold text-white">Salvar alterações</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const tenantNotChosen = isSuperAdmin && !tenantId;

  return (
    <ScrollView
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 64 }}
      className="flex-1"
    >
      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View className="mb-5">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="w-10 h-10 rounded-xl bg-violet-100 items-center justify-center">
            <Ionicons name="settings-outline" size={20} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-800">
              Configurações de cobrança
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Personalize matrículas, geração de invoices e métodos de pagamento aceitos pelo tenant.
            </Text>
          </View>
        </View>
      </View>

      {isSuperAdmin && (
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Tenant
          </Text>
          {loadingTenants ? (
            <View className="py-3 items-start">
              <ActivityIndicator size="small" color="#7C3AED" />
            </View>
          ) : (
            <FormSelect
              label=""
              value={tenantId}
              options={tenantOptions}
              onChange={(v) => setTenantId(v)}
              placeholder="Selecione o tenant"
            />
          )}
        </View>
      )}

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <View
          className="border-b border-gray-100"
          style={{
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {SCOPE_TABS.map((tab) => {
            const isActive = activeScope === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveScope(tab.key)}
                activeOpacity={0.8}
                className={`flex-row items-center px-4 py-3 ${
                  isActive ? "bg-violet-50" : "bg-white"
                } ${isMobile ? "" : "flex-1 justify-center"}`}
                style={{
                  borderBottomWidth: isActive && !isMobile ? 2 : 0,
                  borderBottomColor: "#7C3AED",
                }}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isActive ? "#7C3AED" : "#6B7280"}
                />
                <Text
                  className={`ml-2 text-sm font-semibold ${
                    isActive ? "text-violet-700" : "text-gray-600"
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="p-5">
          {tenantNotChosen ? (
            <View className="py-12 items-center">
              <Ionicons name="business-outline" size={28} color="#9CA3AF" />
              <Text className="mt-2 text-sm text-gray-500 text-center">
                Selecione um tenant para visualizar as configurações.
              </Text>
            </View>
          ) : loadingSchema || !schema || !drafts ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text className="mt-3 text-sm text-gray-500">
                Carregando configurações...
              </Text>
            </View>
          ) : (
            renderActiveScope()
          )}
        </View>
      </View>

      <ConfirmModal
        visible={!!resetTarget}
        title="Restaurar configurações padrão?"
        message="Os valores salvos para este escopo serão removidos e voltarão aos defaults do sistema."
        onCancel={() => setResetTarget(null)}
        onConfirm={handleConfirmReset}
        loading={resetting}
      />
    </ScrollView>
  );
}
