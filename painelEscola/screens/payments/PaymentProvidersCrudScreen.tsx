import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import { parseApiErrors } from "../../utils/apiErrors";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import PaymentProviderLogo from "../../components/payments/PaymentProviderLogo";

type PaymentProviderCrud = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  is_active: boolean;
  order: number;
};

type ProviderCredentialSummary = {
  configured: boolean;
  environments?: {
    stage?: boolean;
    prod?: boolean;
  };
};

type PaymentProviderCrudItem = PaymentProviderCrud & {
  id: number;
  cora_credentials?: ProviderCredentialSummary | null;
};

const INITIAL_FORM: PaymentProviderCrud = {
  name: "",
  slug: "",
  description: "",
  logo_url: "",
  is_active: true,
  order: 0,
};

export default function PaymentProvidersCrudScreen() {
  const { width, isMobile, contentPadding } = useResponsiveLayout();

  const [providers, setProviders] = useState<PaymentProviderCrudItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEditDetails, setLoadingEditDetails] = useState(false);

  const [form, setForm] = useState<PaymentProviderCrud>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDetails, setEditingDetails] = useState<PaymentProviderCrudItem | null>(null);

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({ visible: false, type: "success", message: "" });

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ visible: true, type, message });
  };

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/payment-providers");
      const list = data?.body?.data ?? data?.data ?? [];
      setProviders(Array.isArray(list) ? list : []);
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar provedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setFormErrors({});
    setEditingId(null);
    setEditingDetails(null);
  };

  const fillFormForEdit = async (item: PaymentProviderCrudItem) => {
    const applyProviderToForm = (provider: PaymentProviderCrudItem) => {
      setForm({
        name: String(provider.name ?? ""),
        slug: String(provider.slug ?? ""),
        description: String(provider.description ?? ""),
        logo_url: String(provider.logo_url ?? ""),
        is_active: !!provider.is_active,
        order: Number(provider.order ?? 0),
      });
      setEditingId(provider.id);
      setEditingDetails(provider);
    };

    applyProviderToForm(item);
    setLoadingEditDetails(true);

    try {
      const { data } = await api.get(`/payment-providers/${item.id}`);
      const details = (data?.body ?? data?.data ?? null) as PaymentProviderCrudItem | null;

      if (details?.id) {
        applyProviderToForm(details);
      }
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao carregar detalhes do provedor.");
    } finally {
      setLoadingEditDetails(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name?.trim()) errors.name = "Nome é obrigatório.";
    if (!form.slug?.trim()) errors.slug = "Slug é obrigatório.";
    if (form.slug && !/^[a-z0-9_]+$/.test(form.slug)) {
      errors.slug = "Slug deve conter apenas letras minúsculas, números e underscore.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setFormErrors({});

    try {
      const payload = {
        name: String(form.name ?? "").trim(),
        slug: String(form.slug ?? "").trim(),
        description: String(form.description ?? "").trim(),
        logo_url: String(form.logo_url ?? "").trim(),
        is_active: form.is_active,
        order: Number(form.order ?? 0),
      };

      if (editingId) {
        const updatePayload = Object.fromEntries(
          Object.entries(payload).filter(([key, value]) => {
            const currentValue = editingDetails?.[key as keyof PaymentProviderCrudItem];

            if (typeof value === "boolean") {
              return value !== Boolean(currentValue);
            }

            if (typeof value === "number") {
              return value !== Number(currentValue ?? 0);
            }

            return String(value ?? "") !== String(currentValue ?? "");
          })
        );

        await api.put(
          `/payment-providers/${editingId}`,
          Object.keys(updatePayload).length > 0 ? updatePayload : payload
        );
        showToast("success", "Provedor atualizado com sucesso.");
      } else {
        await api.post("/payment-providers", payload);
        showToast("success", "Provedor criado com sucesso.");
      }

      await loadProviders();
      resetForm();
    } catch (e: any) {
      if (e?.response?.status === 422) {
        setFormErrors(parseApiErrors(e.response?.data?.errors ?? {}));
      }
      showToast("error", e?.response?.data?.message || "Falha ao salvar provedor.");
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDeleteProvider = async () => {
    if (!deletingId) return;

    setDeleting(true);
    try {
      await api.delete(`/payment-providers/${deletingId}`);
      showToast("success", "Provedor removido com sucesso.");
      await loadProviders();
    } catch (e: any) {
      showToast("error", e?.response?.data?.message || "Falha ao remover provedor.");
    } finally {
      setDeleting(false);
      setConfirmDeleteVisible(false);
      setDeletingId(null);
    }
  };

  const onChangeText = (field: keyof PaymentProviderCrud, value: any) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((current) => ({ ...current, [field]: "" }));
    }
  };

  const providerCardBasis = isMobile ? "100%" : width < 1180 ? "48%" : "31.8%";

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 32 }}>
      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View className="mb-4">
        <Text className="text-xl font-bold text-gray-800">Cadastro de Bancos</Text>
        <Text className="text-xs text-gray-500 mt-1">
          Crie e gerencie os provedores de pagamento disponíveis para cobranças.
        </Text>
      </View>

      {/* Form Card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}>
        <View className="flex-row items-center gap-2 mb-3">
          <Ionicons name={editingId ? "pencil" : "add-circle"} size={18} color="#7C3AED" />
          <Text className="text-base font-bold text-gray-800">
            {editingId ? "Editar Provedor" : "Novo Provedor"}
          </Text>
        </View>

        {!!editingId && (
          <View className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
            <View className="flex-row items-center gap-2">
              <Ionicons name="create-outline" size={16} color="#7C3AED" />
              <Text className="text-xs font-bold text-violet-700">
                Modo de edição ativo
              </Text>
            </View>
            <Text className="text-xs text-violet-600 mt-1">
              Altere os dados abaixo e clique em salvar alterações para atualizar o banco.
            </Text>
            {loadingEditDetails && (
              <Text className="text-xs text-violet-600 mt-2">Carregando detalhes completos do provedor...</Text>
            )}
          </View>
        )}

        {!!editingId && !!editingDetails?.cora_credentials && (
          <View className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
            <View className="flex-row items-center gap-2">
              <Ionicons name="shield-checkmark-outline" size={16} color="#1D4ED8" />
              <Text className="text-xs font-bold text-blue-800">Credenciais Cora</Text>
            </View>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {[
                `Configurado: ${editingDetails.cora_credentials.configured ? "Sim" : "Não"}`,
                `Teste: ${editingDetails.cora_credentials.environments?.stage ? "Ativo" : "Inativo"}`,
                `Produção: ${editingDetails.cora_credentials.environments?.prod ? "Ativo" : "Inativo"}`,
              ].map((label) => (
                <View key={label} className="rounded-full bg-white border border-blue-100 px-2 py-0.5">
                  <Text className="text-[11px] font-semibold text-blue-700">{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
          <View style={{ flex: 1 }}>
            <FormInput
              label="Nome do Provedor"
              required
              value={String(form.name ?? "")}
              onChangeText={(v) => onChangeText("name", v)}
              error={formErrors.name}
              placeholder="Ex: Banco do Brasil"
            />
          </View>

          <View style={{ flex: 1 }}>
            <FormInput
              label="Slug (único)"
              required
              value={String(form.slug ?? "")}
              onChangeText={(v) => onChangeText("slug", v)}
              error={formErrors.slug}
              placeholder="Ex: banco_brasil"
            />
          </View>
        </View>

        <FormInput
          label="Descrição"
          value={String(form.description ?? "")}
          onChangeText={(v) => onChangeText("description", v)}
          error={formErrors.description}
          placeholder="Ex: Boletos via Banco do Brasil"
        />

        <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
          <View style={{ flex: 1.4 }}>
            <FormInput
              label="URL do Logo"
              value={String(form.logo_url ?? "")}
              onChangeText={(v) => onChangeText("logo_url", v)}
              error={formErrors.logo_url}
              placeholder="https://cdn.example.com/logo.png"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Ordem"
                  value={String(form.order ?? 0)}
                  onChangeText={(v) => onChangeText("order", parseInt(v, 10) || 0)}
                  error={formErrors.order}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flex: 1 }}>
                <FormSelect
                  label="Status"
                  value={form.is_active === false ? "inactive" : "active"}
                  onChange={(v) => onChangeText("is_active", v === "active")}
                  options={[
                    { value: "active", label: "Ativo" },
                    { value: "inactive", label: "Inativo" },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        <View className="mb-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
          <View className="flex-row items-center gap-3">
            <PaymentProviderLogo uri={form.logo_url || null} size={64} rounded={18} />
            <View style={{ flex: 1 }}>
              <Text className="text-sm font-bold text-gray-700">Pré-visualização do logo</Text>
              <Text className="text-xs text-gray-500 mt-1">
                {form.logo_url?.trim()
                  ? "A imagem será exibida na listagem usando a URL informada."
                  : "Informe uma URL válida para visualizar o logo do banco."}
              </Text>
              {!!form.logo_url?.trim() && (
                <Text className="text-[11px] text-gray-400 mt-2" numberOfLines={1}>
                  {form.logo_url}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, marginTop: 8 }}>
          <TouchableOpacity
            onPress={onSubmit}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center justify-center gap-2"
            style={{ opacity: saving ? 0.75 : 1 }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name={editingId ? "checkmark" : "add"} size={16} color="white" />
                <Text className="text-sm font-bold text-white">
                  {editingId ? "Salvar alterações" : "Criar banco"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {editingId && (
            <TouchableOpacity
              onPress={resetForm}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl border border-gray-300 flex-row items-center justify-center gap-2"
            >
              <Ionicons name="close" size={16} color="#6B7280" />
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Providers List */}
      <View className="bg-white rounded-2xl border border-gray-100 p-4" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="list" size={18} color="#7C3AED" />
            <Text className="text-base font-bold text-gray-800">Provedores ({providers.length})</Text>
          </View>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-sm text-gray-500 mt-3">Carregando...</Text>
          </View>
        ) : providers.length === 0 ? (
          <View className="py-8 items-center">
            <Ionicons name="archive-outline" size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-500 mt-2">Nenhum provedor cadastrado.</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {providers.map((item) => {
              const isEditingThisProvider = editingId === item.id;
              const isCardLocked = isEditingThisProvider;
              const cardStatusLabel = saving && isEditingThisProvider ? "Salvando" : "Em edição";

              return (
                <View
                  key={item.id}
                  className={`rounded-2xl border p-3 ${
                    isEditingThisProvider ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white"
                  }`}
                  style={{
                    flexBasis: providerCardBasis,
                    flexGrow: 1,
                    minWidth: isMobile ? "100%" : 260,
                    shadowColor: "#111827",
                    shadowOpacity: isEditingThisProvider ? 0.16 : 0.08,
                    shadowRadius: isEditingThisProvider ? 16 : 12,
                    shadowOffset: { width: 0, height: isEditingThisProvider ? 7 : 5 },
                    elevation: isEditingThisProvider ? 4 : 2,
                  }}
                >
                  {isEditingThisProvider && (
                    <View className="mb-2 flex-row items-center justify-between rounded-xl bg-violet-600 px-3 py-1.5">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="create-outline" size={13} color="white" />
                        <Text className="text-[11px] font-bold text-white">Selecionado para edição</Text>
                      </View>
                      {saving && <ActivityIndicator size="small" color="white" />}
                    </View>
                  )}
                  <View className="flex-row items-start gap-3">
                    <PaymentProviderLogo uri={item.logo_url || null} size={92} rounded={20} />
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                            {item.slug}
                          </Text>
                        </View>
                        <View className={`px-2 py-0.5 rounded-full ${item.is_active ? "bg-emerald-100" : "bg-gray-200"}`}>
                          <Text className={`text-[11px] font-bold ${item.is_active ? "text-emerald-700" : "text-gray-600"}`}>
                            {item.is_active ? "Ativo" : "Inativo"}
                          </Text>
                        </View>
                      </View>

                      <Text className="text-xs text-gray-600 mt-2" numberOfLines={2}>
                        {item.description || "Sem descrição cadastrada."}
                      </Text>

                      <View className="flex-row items-center justify-between mt-3">
                        <View className="flex-row items-center gap-1.5">
                          <View className="rounded-full bg-white border border-gray-200 px-2 py-0.5">
                            <Text className="text-[11px] font-semibold text-gray-500">Ordem {item.order}</Text>
                          </View>
                          {isEditingThisProvider && (
                            <View className="rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 flex-row items-center gap-1">
                              {saving && <ActivityIndicator size="small" color="#7C3AED" />}
                              <Text className="text-[11px] font-bold text-violet-700">{cardStatusLabel}</Text>
                            </View>
                          )}
                        </View>

                        <View className="flex-row items-center gap-1.5">
                          <TouchableOpacity
                            onPress={() => fillFormForEdit(item)}
                            disabled={isCardLocked}
                            className={`h-8 w-8 rounded-lg border items-center justify-center ${
                              isCardLocked ? "border-gray-200 bg-gray-100" : "border-violet-200 bg-white"
                            }`}
                            activeOpacity={0.85}
                            style={{ opacity: isCardLocked ? 0.55 : 1 }}
                          >
                            <Ionicons name={isEditingThisProvider ? "lock-closed-outline" : "pencil"} size={14} color={isCardLocked ? "#9CA3AF" : "#7C3AED"} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setDeletingId(item.id);
                              setConfirmDeleteVisible(true);
                            }}
                            disabled={isCardLocked}
                            className={`h-8 w-8 rounded-lg border items-center justify-center ${
                              isCardLocked ? "border-gray-200 bg-gray-100" : "border-red-200 bg-white"
                            }`}
                            activeOpacity={0.85}
                            style={{ opacity: isCardLocked ? 0.55 : 1 }}
                          >
                            <Ionicons name="trash" size={14} color={isCardLocked ? "#9CA3AF" : "#DC2626"} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <ConfirmModal
        visible={confirmDeleteVisible}
        title="Remover Provedor"
        message={`Tem certeza que deseja remover este provedor? Esta ação não pode ser desfeita.`}
        onConfirm={onConfirmDeleteProvider}
        onCancel={() => {
          setConfirmDeleteVisible(false);
          setDeletingId(null);
        }}
        loading={deleting}
      />
    </ScrollView>
  );
}
