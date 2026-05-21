import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import PaymentProviderLogo from "../../components/payments/PaymentProviderLogo";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import ToastBanner from "../../components/ui/ToastBanner";
import { parseApiErrors } from "../../utils/apiErrors";
import {
  CoraEnvironmentSettings,
  listPaymentProviders,
  getPaymentProviderCurrentSettings,
  getPaymentProviderSettingsSchema,
  savePaymentProviderSettings,
  testPaymentProviderConnection,
  PaymentProvider,
  PaymentProviderSchemaField,
} from "../../services/payments";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

type TenantOption = {
  value: string;
  label: string;
};

type TenantApiItem = {
  id: number;
  name?: string;
  corporate_name?: string;
  slug?: string;
};

type EnvironmentKey = "stage" | "prod";

type ConnectionState = {
  ok: boolean;
  providerStatus: string;
  expiresIn: number;
};

type EnvironmentDraft = {
  values: Record<string, string>;
  files: Record<string, File | null>;
  uploadedFiles: Record<string, boolean>;
  errors: Record<string, string>;
  connectionStatus: ConnectionState | null;
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "", label: "Cartao de credito" },
  { value: "debit_card", label: "Cartao de debito" },
  { value: "bank_transfer", label: "Transferencia" },
];

const toPrettyLabel = (name: string) =>
  name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const environmentLabels: Record<EnvironmentKey, { title: string; subtitle: string }> = {
  stage: { title: "Ambiente de teste", subtitle: "Use as credenciais de homologação" },
  prod: { title: "Ambiente de produção", subtitle: "Use as credenciais finais" },
};

const createDraft = (environment: EnvironmentKey, fields: PaymentProviderSchemaField[]): EnvironmentDraft => {
  const values: Record<string, string> = { environment };
  const files: Record<string, File | null> = {};
  const uploadedFiles: Record<string, boolean> = {};

  fields.forEach((field) => {
    if (field.name === "environment") {
      values[field.name] = environment;
      return;
    }

    if (field.type === "select") {
      values[field.name] = field.options?.[0] ?? "";
      return;
    }

    if (field.type === "file") {
      files[field.name] = null;
      uploadedFiles[field.name] = false;
      return;
    }

    values[field.name] = "";
  });

  return {
    values,
    files,
    uploadedFiles,
    errors: {},
    connectionStatus: null,
  };
};

const validateDraftFields = (
  draft: EnvironmentDraft,
  fields: PaymentProviderSchemaField[]
): Record<string, string> => {
  const nextErrors: Record<string, string> = {};

  fields.forEach((field) => {
    if (!field.required) return;

    if (field.type === "file") {
      const hasUploadedFile = !!draft.uploadedFiles[field.name];
      const hasNewFile = !!draft.files[field.name];

      if (!hasUploadedFile && !hasNewFile) {
        nextErrors[field.name] = "Este campo e obrigatorio.";
      }
      return;
    }

    if (!String(draft.values[field.name] ?? "").trim()) {
      nextErrors[field.name] = "Este campo e obrigatorio.";
    }
  });

  return nextErrors;
};

const isCoraEnvironmentSaved = (settings: CoraEnvironmentSettings | null | undefined): boolean =>
  !!(
    settings?.client_id &&
    settings.cert_uploaded &&
    settings.key_uploaded
  );

const hasPendingCredentialFiles = (draft: EnvironmentDraft): boolean =>
  !!draft.files.certificate || !!draft.files.private_key;

const mergeEnvironmentSettings = (
  draft: EnvironmentDraft,
  settings: CoraEnvironmentSettings | null | undefined
): EnvironmentDraft => {
  if (!settings) {
    return draft;
  }

  return {
    ...draft,
    values: {
      ...draft.values,
      client_id: settings.client_id ?? draft.values.client_id ?? "",
      test_account_main_cpf: settings.test_account_main_cpf ?? draft.values.test_account_main_cpf ?? "",
      test_account_main_password: settings.test_account_main_password ?? draft.values.test_account_main_password ?? "",
      test_account_secondary_cpf: settings.test_account_secondary_cpf ?? draft.values.test_account_secondary_cpf ?? "",
      test_account_secondary_password: settings.test_account_secondary_password ?? draft.values.test_account_secondary_password ?? "",
    },
    uploadedFiles: {
      ...draft.uploadedFiles,
      certificate: !!settings.cert_uploaded,
      private_key: !!settings.key_uploaded,
    },
  };
};

export default function PaymentProvidersScreen() {
  const { user } = useAuth();
  const { isMobile, contentPadding } = useResponsiveLayout();

  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [provider, setProvider] = useState("");

  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loadingTenants, setLoadingTenants] = useState(false);

  const [selectedEnvironment, setSelectedEnvironment] = useState<EnvironmentKey>("stage");

  const [schemaFields, setSchemaFields] = useState<PaymentProviderSchemaField[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const [drafts, setDrafts] = useState<Record<EnvironmentKey, EnvironmentDraft>>({
    stage: createDraft("stage", []),
    prod: createDraft("prod", []),
  });
  const draftsRef = useRef(drafts);

  const [credentialsSaved, setCredentialsSaved] = useState<Record<EnvironmentKey, boolean>>({
    stage: false,
    prod: false,
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({
    visible: false,
    type: "success",
    message: "",
  });

  const selectedProviderInfo = useMemo(
    () => providers.find((p) => p.slug === provider) ?? null,
    [provider, providers]
  );

  const activeDraft = drafts[selectedEnvironment];
  const canTestConnection =
    credentialsSaved[selectedEnvironment] && !hasPendingCredentialFiles(activeDraft);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ visible: true, type, message });
  };

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const list = await listPaymentProviders();
      const activeOnly = list.filter((item) => item.status !== "inactive");
      setProviders(activeOnly);
      if (activeOnly.length > 0) {
        setProvider((prev) => prev || activeOnly[0].slug);
      }
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar provedores de pagamento.");
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const loadTenants = useCallback(async () => {
    if (user?.role !== "super_admin") {
      const id = user?.tenant_id ? String(user.tenant_id) : "";
      setTenantId(id);
      setTenantOptions(id ? [{ value: id, label: `Tenant #${id}` }] : []);
      return;
    }

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
  }, [user?.role, user?.tenant_id]);

  useEffect(() => {
    loadProviders();
    loadTenants();
  }, [loadProviders, loadTenants]);

  const loadSchema = useCallback(async () => {
    if (!provider || !tenantId) return;

    setLoadingSchema(true);

    try {
      const [schema, currentSettings] = await Promise.all([
        getPaymentProviderSettingsSchema(Number(tenantId), provider),
        getPaymentProviderCurrentSettings(Number(tenantId), provider),
      ]);
      const fields = Array.isArray(schema?.fields)
        ? schema.fields.filter((field) => field.name !== "environment")
        : [];
      setSchemaFields(fields);
      setDrafts({
        stage: mergeEnvironmentSettings(createDraft("stage", fields), currentSettings?.cora?.stage),
        prod: mergeEnvironmentSettings(createDraft("prod", fields), currentSettings?.cora?.prod),
      });

      if (provider === "cora") {
        setCredentialsSaved({
          stage: isCoraEnvironmentSaved(currentSettings?.cora?.stage),
          prod: isCoraEnvironmentSaved(currentSettings?.cora?.prod),
        });
      } else {
        setCredentialsSaved({
          stage: !!schema?.environments?.stage,
          prod: !!schema?.environments?.prod,
        });
      }
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar schema do provedor.");
    } finally {
      setLoadingSchema(false);
    }
  }, [provider, tenantId]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  useEffect(() => {
    setSelectedEnvironment("stage");
  }, [provider, tenantId]);

  const updateActiveDraft = (updater: (current: EnvironmentDraft) => EnvironmentDraft) => {
    setDrafts((current) => ({
      ...current,
      [selectedEnvironment]: updater(current[selectedEnvironment]),
    }));
  };

  const onChangeText = (fieldName: string, value: string) => {
    updateActiveDraft((current) => ({
      ...current,
      values: { ...current.values, [fieldName]: value },
      errors: { ...current.errors, [fieldName]: "" },
      connectionStatus: fieldName === "client_id" || fieldName === "api_key" ? null : current.connectionStatus,
    }));

    if (fieldName === "client_id" || fieldName === "api_key") {
      setCredentialsSaved((current) => ({ ...current, [selectedEnvironment]: false }));
    }
  };

  const onChangeFile = (fieldName: string, file: File | null) => {
    setDrafts((current) => {
      const environmentDraft = current[selectedEnvironment];
      const nextDraft: EnvironmentDraft = {
        ...environmentDraft,
        files: { ...environmentDraft.files, [fieldName]: file },
        errors: { ...environmentDraft.errors, [fieldName]: "" },
        connectionStatus: null,
      };
      const next = { ...current, [selectedEnvironment]: nextDraft };
      draftsRef.current = next;
      return next;
    });
  };

  const buildPayload = (draft: EnvironmentDraft) => {
    const hasFile = schemaFields.some((field) => field.type === "file");

    if (hasFile) {
      const formData = new FormData();
      formData.append("environment", selectedEnvironment);

      schemaFields.forEach((field) => {
        if (field.type === "file") {
          const file = draft.files[field.name];
          if (file) {
            formData.append(field.name, file, file.name);
          }
          return;
        }

        const value = draft.values[field.name];
        formData.append(field.name, value !== undefined && value !== null ? String(value) : "");
      });

      const testAccountFields = [
        "test_account_main_cpf",
        "test_account_main_password",
        "test_account_secondary_cpf",
        "test_account_secondary_password",
      ];
      testAccountFields.forEach((fieldName) => {
        if (!schemaFields.some((f) => f.name === fieldName) && draft.values[fieldName]) {
          formData.append(fieldName, String(draft.values[fieldName]));
        }
      });

      return formData;
    }

    const payload: Record<string, string> = {};
    schemaFields.forEach((field) => {
      payload[field.name] = draft.values[field.name] ?? "";
    });

    const testAccountFields = [
      "test_account_main_cpf",
      "test_account_main_password",
      "test_account_secondary_cpf",
      "test_account_secondary_password",
    ];
    testAccountFields.forEach((fieldName) => {
      if (!schemaFields.some((f) => f.name === fieldName) && draft.values[fieldName]) {
        payload[fieldName] = String(draft.values[fieldName]);
      }
    });

    payload.environment = selectedEnvironment;
    return payload;
  };

  const onSave = async () => {
    if (!tenantId || !provider) return;

    const draft = draftsRef.current[selectedEnvironment];
    const nextErrors = validateDraftFields(draft, schemaFields);

    if (Object.keys(nextErrors).length > 0) {
      setDrafts((current) => {
        const next = {
          ...current,
          [selectedEnvironment]: { ...current[selectedEnvironment], errors: nextErrors },
        };
        draftsRef.current = next;
        return next;
      });
      showToast("error", "Preencha os campos obrigatorios antes de salvar.");
      return;
    }

    setSaving(true);
    setDrafts((current) => {
      const next = {
        ...current,
        [selectedEnvironment]: { ...current[selectedEnvironment], errors: {} },
      };
      draftsRef.current = next;
      return next;
    });

    try {
      const payload = buildPayload(draft);
      await savePaymentProviderSettings(Number(tenantId), provider, payload);
      showToast("success", "Configuracao salva com sucesso.");
      await loadSchema();
    } catch (e: any) {
      if (e?.response?.status === 422) {
        setDrafts((current) => {
          const next = {
            ...current,
            [selectedEnvironment]: {
              ...current[selectedEnvironment],
              errors: parseApiErrors(e.response?.data?.errors ?? e.response?.data?.body?.errors ?? {}),
            },
          };
          draftsRef.current = next;
          return next;
        });
      }
      showToast("error", e?.response?.data?.message || "Falha ao salvar configuracao.");
    } finally {
      setSaving(false);
    }
  };

  const onTestConnection = async () => {
    if (!tenantId || !provider || !canTestConnection) return;

    setTesting(true);
    updateActiveDraft((current) => ({ ...current, connectionStatus: null }));
    try {
      const result = await testPaymentProviderConnection(Number(tenantId), provider, selectedEnvironment);
      updateActiveDraft((current) => ({
        ...current,
        connectionStatus: {
          ok: !!result.ok,
          providerStatus: String(result.provider_status ?? "unknown"),
          expiresIn: Number(result.expires_in ?? 0),
        },
      }));
      showToast("success", result.ok ? "Conexao validada com sucesso." : "Conexao sem sucesso.");
    } catch (e: any) {
      updateActiveDraft((current) => ({
        ...current,
        connectionStatus: { ok: false, providerStatus: "disconnected", expiresIn: 0 },
      }));
      showToast("error", e?.response?.data?.message || "Falha ao testar conexao.");
    } finally {
      setTesting(false);
    }
  };

  const renderProviderPicker = () => (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        Provedor <Text className="text-red-500">*</Text>
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {providers.map((item) => {
          const selected = provider === item.slug;
          return (
            <TouchableOpacity
              key={item.slug}
              onPress={() => setProvider(item.slug)}
              activeOpacity={0.85}
              className={`rounded-2xl border px-3 py-3 ${
                selected ? "border-violet-400 bg-violet-50" : "border-gray-200 bg-white"
              }`}
              style={{
                minWidth: isMobile ? "100%" : 200,
                flexGrow: 1,
                flexBasis: isMobile ? "100%" : "30%",
              }}
            >
              <View className="flex-row items-center gap-3">
                <PaymentProviderLogo uri={item.logo_url ?? null} size={52} rounded={14} />
                <View className="flex-1 min-w-0">
                  <Text
                    className={`text-sm font-bold ${selected ? "text-violet-700" : "text-gray-800"}`}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                    {item.slug}
                  </Text>
                  <View className="flex-row flex-wrap mt-1.5" style={{ gap: 4 }}>
                    {(item.capabilities ?? []).slice(0, 3).map((cap) => (
                      <View
                        key={`${item.slug}-${cap}`}
                        className="rounded-full bg-gray-100 px-2 py-0.5"
                      >
                        <Text className="text-[10px] font-semibold text-gray-600">{cap}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Configuração de Provedores</Text>
          <Text className="text-sm text-gray-500">
            Configure as credenciais de cada provedor por tenant e ambiente (teste/produção).
          </Text>
        </View>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 p-5" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}>
        {(loadingProviders || loadingTenants) ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-sm text-gray-500 mt-3">Carregando provedores...</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <FormSelect
                  label="Tenant"
                  required
                  value={tenantId}
                  onChange={setTenantId}
                  options={tenantOptions}
                  placeholder="Selecione o tenant"
                  disabled={user?.role !== "super_admin"}
                />
              </View>
            </View>

            {providers.length > 0 ? renderProviderPicker() : (
              <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Text className="text-sm text-amber-800">
                  Nenhum provedor ativo. Cadastre bancos em Cadastro de Bancos.
                </Text>
              </View>
            )}

            {!!selectedProviderInfo && (
              <View className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 mb-4">
                <View className="flex-row items-center gap-3">
                  <PaymentProviderLogo uri={selectedProviderInfo.logo_url ?? null} size={44} rounded={12} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-violet-700">
                      {selectedProviderInfo.name}
                    </Text>
                    <Text className="text-xs text-violet-600 mt-1">
                      Capacidades: {selectedProviderInfo.capabilities.join(", ") || "Nenhuma informada"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View className="flex-row gap-2 mb-4">
              {(["stage", "prod"] as EnvironmentKey[]).map((environment) => {
                const active = selectedEnvironment === environment;
                return (
                  <TouchableOpacity
                    key={environment}
                    onPress={() => setSelectedEnvironment(environment)}
                    className={`flex-1 rounded-2xl border px-4 py-3 ${active ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-white"}`}
                  >
                    <Text className={`text-sm font-semibold ${active ? "text-violet-700" : "text-gray-700"}`}>
                      {environmentLabels[environment].title}
                    </Text>
                    <Text className={`text-xs mt-1 ${active ? "text-violet-600" : "text-gray-500"}`}>
                      {environmentLabels[environment].subtitle}
                    </Text>
                    {!!schemaFields.length && (
                      <Text className="text-xs text-gray-500 mt-2">
                        {drafts[environment].values.client_id
                          ? (drafts[environment].connectionStatus?.ok ? "Conectado" : "Configurado")
                          : "Não configurado"}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4">
              <Text className="text-sm font-semibold text-gray-700">Ambiente ativo: {environmentLabels[selectedEnvironment].title}</Text>
              <Text className="text-xs text-gray-500 mt-1">Cada ambiente grava credenciais separadas no backend.</Text>
            </View>

            {loadingSchema ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text className="text-xs text-gray-500 mt-2">Carregando campos de configuracao...</Text>
              </View>
            ) : schemaFields.length === 0 ? (
              <View className="py-6 rounded-xl border border-amber-200 bg-amber-50 px-4">
                <Text className="text-sm text-amber-700">Schema nao disponivel para esse provedor/tenant.</Text>
              </View>
            ) : (
              <>
                {schemaFields.map((field) => {
                  const label = field.label || toPrettyLabel(field.name);
                  
                  // Renderizar campos de teste em uma seção separada
                  if (field.name.startsWith('test_account_')) {
                    if (field.name === 'test_account_main_cpf') {
                      return (
                        <View key="test-accounts-section" className="mt-6 mb-4">
                          <View className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-4">
                            <View className="flex-row items-center gap-2">
                              <Ionicons name="information-circle" size={16} color="#1E40AF" />
                              <Text className="text-sm font-semibold text-blue-900">Dados de Teste Cora</Text>
                            </View>
                            <Text className="text-xs text-blue-700 mt-1">
                              Use essas credenciais para testar transações no ambiente de homologação.
                            </Text>
                          </View>
                          
                          <Text className="text-xs font-semibold text-gray-600 mb-2 uppercase">Conta Principal (Empresa)</Text>
                          <FormInput
                            label="CPF - Conta Principal"
                            required={field.required}
                            value={activeDraft.values[field.name] ?? ""}
                            onChangeText={(value) => onChangeText(field.name, value)}
                            error={activeDraft.errors[field.name]}
                            placeholder={field.placeholder || "451.145.218-02"}
                          />
                          
                          <FormInput
                            label="Senha - Conta Principal"
                            required={false}
                            value={activeDraft.values['test_account_main_password'] ?? ""}
                            onChangeText={(value) => onChangeText('test_account_main_password', value)}
                            error={activeDraft.errors['test_account_main_password']}
                            placeholder="Informe a senha"
                            secureTextEntry
                          />
                          
                          <View className="h-px bg-gray-200 my-4" />
                          
                          <Text className="text-xs font-semibold text-gray-600 mb-2 uppercase">Conta Secundária (Cliente)</Text>
                          <FormInput
                            label="CPF - Conta Secundária"
                            required={false}
                            value={activeDraft.values['test_account_secondary_cpf'] ?? ""}
                            onChangeText={(value) => onChangeText('test_account_secondary_cpf', value)}
                            error={activeDraft.errors['test_account_secondary_cpf']}
                            placeholder="576.816.348-43"
                          />
                          
                          <FormInput
                            label="Senha - Conta Secundária"
                            required={false}
                            value={activeDraft.values['test_account_secondary_password'] ?? ""}
                            onChangeText={(value) => onChangeText('test_account_secondary_password', value)}
                            error={activeDraft.errors['test_account_secondary_password']}
                            placeholder="Informe a senha"
                            secureTextEntry
                          />
                        </View>
                      );
                    }
                    // Ignorar outros campos de teste já renderizados
                    return null;
                  }
                  
                  if (field.type === "select") {
                    const options = (field.options ?? []).map((option) => ({
                      value: option,
                      label: toPrettyLabel(option),
                    }));
                    return (
                      <FormSelect
                        key={field.name}
                        label={label}
                        required={field.required}
                        value={activeDraft.values[field.name] ?? ""}
                        onChange={(value) => onChangeText(field.name, value)}
                        options={options}
                        error={activeDraft.errors[field.name]}
                      />
                    );
                  }

                  if (field.type === "file") {
                    return (
                      <View key={field.name} className="mb-4">
                        <Text className="text-sm font-semibold text-gray-700 mb-1.5">
                          {label}
                          {field.required && <Text className="text-red-500"> *</Text>}
                        </Text>
                        <input
                          key={`${selectedEnvironment}-${field.name}`}
                          type="file"
                          accept={(field.accept ?? []).join(",") || undefined}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const file = event.currentTarget.files?.[0] ?? null;
                            onChangeFile(field.name, file);
                          }}
                          style={{
                            border: `1px solid ${activeDraft.errors[field.name] ? "#FCA5A5" : "#E5E7EB"}`,
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 14,
                            backgroundColor: "#F9FAFB",
                            width: "100%",
                            height: 42,
                            fontFamily: "system-ui, -apple-system",
                            cursor: "pointer",
                            boxSizing: "border-box",
                          } as any}
                        />
                        {!!activeDraft.files[field.name] && (
                          <Text className="text-xs text-gray-500 mt-1">
                            Arquivo selecionado: {activeDraft.files[field.name]?.name}
                          </Text>
                        )}
                        {!activeDraft.files[field.name] && activeDraft.uploadedFiles[field.name] && (
                          <Text className="text-xs text-emerald-600 mt-1">
                            Arquivo já enviado para este ambiente.
                          </Text>
                        )}
                        {!!activeDraft.errors[field.name] && (
                          <Text className="text-xs text-red-500 mt-1">{activeDraft.errors[field.name]}</Text>
                        )}
                      </View>
                    );
                  }

                  return (
                    <FormInput
                      key={field.name}
                      label={label}
                      required={field.required}
                      value={activeDraft.values[field.name] ?? ""}
                      onChangeText={(value) => onChangeText(field.name, value)}
                      error={activeDraft.errors[field.name]}
                      placeholder={field.placeholder || `Informe ${label.toLowerCase()}`}
                    />
                  );
                })}

                <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={onSave}
                    disabled={saving || testing}
                    className="px-5 py-2.5 rounded-xl bg-violet-600"
                    style={{ opacity: saving || testing ? 0.75 : 1 }}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-sm font-bold text-white">Salvar configuracao</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={onTestConnection}
                    disabled={saving || testing || !canTestConnection}
                    className="px-5 py-2.5 rounded-xl border border-violet-200"
                    style={{ opacity: saving || testing || !canTestConnection ? 0.45 : 1 }}
                  >
                    {testing ? (
                      <ActivityIndicator size="small" color="#7C3AED" />
                    ) : (
                      <Text
                        className={`text-sm font-semibold ${
                          canTestConnection ? "text-violet-700" : "text-gray-400"
                        }`}
                      >
                        Testar conexao
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {!canTestConnection && (
                  <Text className="text-xs text-gray-500 mt-2">
                    {hasPendingCredentialFiles(activeDraft)
                      ? "Salve os novos arquivos antes de testar a conexao."
                      : "Salve as credenciais deste ambiente para habilitar o teste de conexao."}
                  </Text>
                )}

                {!!activeDraft.connectionStatus && (
                  <View
                    className={`mt-4 rounded-xl border px-4 py-3 ${
                      activeDraft.connectionStatus.ok
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Ionicons
                        name={activeDraft.connectionStatus.ok ? "checkmark-circle" : "alert-circle"}
                        size={16}
                        color={activeDraft.connectionStatus.ok ? "#047857" : "#B91C1C"}
                      />
                      <Text
                        className={`text-sm font-semibold ${
                          activeDraft.connectionStatus.ok ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {activeDraft.connectionStatus.ok ? "Conectado" : "Nao conectado"}
                      </Text>
                    </View>
                    <Text className={`text-xs mt-1 ${activeDraft.connectionStatus.ok ? "text-emerald-700" : "text-red-700"}`}>
                      provider_status: {activeDraft.connectionStatus.providerStatus} | expires_in: {activeDraft.connectionStatus.expiresIn}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Uso na cobranca</Text>
              <Text className="text-xs text-gray-600 mb-2">
                A tela de cobrancas usa contrato unificado para gerar charge com provider + method.
              </Text>
              <Text className="text-xs text-gray-600">
                Metodos sugeridos: {PAYMENT_METHOD_OPTIONS.map((item) => item.value).join(", ")}.
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
