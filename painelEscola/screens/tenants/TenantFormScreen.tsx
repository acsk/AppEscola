import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import { parseApiErrors } from "../../utils/apiErrors";
import {
  maskPhone,
  maskWhatsapp,
  maskCEP,
  maskCNPJ,
  isValidCEP,
  isValidCNPJ,
} from "../../utils/masks";
import { fetchAddressByCEP } from "../../utils/cep";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  tenantId: number | null;
};

type Form = {
  corporate_name: string;
  trade_name: string;
  name: string;
  slug: string;
  cnpj: string;
  email: string;
  phone: string;
  whatsapp: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  status: string;
  timezone: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  admin_password_confirmation: string;
};

const EMPTY: Form = {
  corporate_name: "",
  trade_name: "",
  name: "",
  slug: "",
  cnpj: "",
  email: "",
  phone: "",
  whatsapp: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  status: "active",
  timezone: "America/Sao_Paulo",
  admin_name: "",
  admin_email: "",
  admin_password: "",
  admin_password_confirmation: "",
};

export default function TenantFormScreen({ navigate, tenantId }: Props) {
  const isEdit = tenantId !== null;
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [isLookingUpCEP, setIsLookingUpCEP] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState("");

  useEffect(() => {
    if (!isEdit || !tenantId) return;

    const load = async () => {
      setLoading(true);
      setForbidden(false);
      try {
        const { data } = await api.get(`/tenants/${tenantId}`);
        const t = data.data ?? data;
        const addr = t.address ?? {};
        setForm((prev) => ({
          ...prev,
          corporate_name: t.corporate_name ?? "",
          trade_name: t.trade_name ?? "",
          name: t.name ?? "",
          slug: t.slug ?? "",
          cnpj: t.cnpj ?? "",
          email: t.email ?? "",
          phone: t.phone ?? "",
          whatsapp: t.whatsapp ?? "",
          zip_code: addr.zip_code ?? "",
          street: addr.street ?? "",
          number: addr.number ?? "",
          complement: addr.complement ?? "",
          neighborhood: addr.neighborhood ?? "",
          city: addr.city ?? "",
          state: addr.state ?? "",
          status: t.status ?? "active",
          timezone: t.settings?.timezone ?? "America/Sao_Paulo",
        }));
      } catch (e: any) {
        if (e.response?.status === 403) setForbidden(true);
      }
      setLoading(false);
    };

    load();
  }, [isEdit, tenantId]);

  const title = useMemo(() => (isEdit ? "Editar Tenant" : "Novo Tenant"), [isEdit]);

  const buildTenantPayload = () => {
    const payload: Record<string, any> = {
      corporate_name: form.corporate_name,
      name: form.name,
      slug: form.slug,
      status: form.status || "active",
    };

    const optionalFields: Array<keyof Form> = [
      "trade_name",
      "cnpj",
      "email",
      "phone",
      "whatsapp",
      "zip_code",
      "street",
      "number",
      "complement",
      "neighborhood",
      "city",
      "state",
    ];

    optionalFields.forEach((key) => {
      if (form[key]?.trim()) payload[key] = form[key].trim();
    });

    if (form.timezone.trim()) {
      payload.settings = { timezone: form.timezone.trim() };
    }

    return payload;
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    setForbidden(false);

    if (form.cnpj.trim() && !isValidCNPJ(form.cnpj)) {
      setErrors({ cnpj: "CNPJ inválido." });
      setSaving(false);
      return;
    }

    try {
      if (isEdit && tenantId) {
        const payload = buildTenantPayload();
        await api.put(`/tenants/${tenantId}`, payload);
        navigate("tenants");
      } else {
        const payload = {
          ...buildTenantPayload(),
          admin_name: form.admin_name,
          admin_email: form.admin_email,
          admin_password: form.admin_password,
          admin_password_confirmation: form.admin_password_confirmation,
        };

        await api.post("/tenants", payload);
        navigate("tenants", {
          success:
            "Tenant criado com sucesso. O admin inicial foi criado com obrigatoriedade de troca de senha no primeiro acesso.",
        });
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data?.errors ?? {}));
      } else if (e.response?.status === 403) {
        setForbidden(true);
      }
    }

    setSaving(false);
  };

  const handleCEPBlur = async () => {
    if (!form.zip_code) return;
    if (!isValidCEP(form.zip_code)) {
      setCepLookupMessage("CEP inválido. Digite um CEP com 8 números.");
      return;
    }

    setIsLookingUpCEP(true);
    setCepLookupMessage("");

    try {
      const address = await fetchAddressByCEP(form.zip_code);
      setForm((prev) => ({
        ...prev,
        zip_code: maskCEP(address.cep || prev.zip_code),
        street: address.street || prev.street,
        neighborhood: address.neighborhood || prev.neighborhood,
        city: address.city || prev.city,
        state: (address.state || prev.state).toUpperCase().slice(0, 2),
      }));
      setCepLookupMessage("Endereço localizado por CEP.");
    } catch {
      setCepLookupMessage("Não foi possível localizar o endereço para este CEP.");
    } finally {
      setIsLookingUpCEP(false);
    }
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <View className="flex-row items-center gap-2 mb-6">
        <TouchableOpacity
          onPress={() => navigate("tenants")}
          className="flex-row items-center gap-1.5"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Tenants</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">{title}</Text>
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">{title}</Text>
        <Text className="text-sm text-gray-500">
          {isEdit
            ? "Atualize os dados institucionais do tenant"
            : "Cadastre o tenant e o usuário administrador inicial"}
        </Text>
      </View>

      {forbidden && (
        <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex-row items-center gap-2">
          <Ionicons name="shield-outline" size={16} color="#B45309" />
          <Text className="text-sm text-amber-700">Acesso permitido apenas para super admin.</Text>
        </View>
      )}

      {loading ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-gray-500 text-sm mt-3">Carregando tenant...</Text>
        </View>
      ) : (
        <>
          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-4" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="business-outline" size={16} color="#7C3AED" />
              <Text className="text-sm font-bold text-gray-800">Dados do tenant</Text>
            </View>

            <FormInput
              label="Razão social"
              required
              value={form.corporate_name}
              onChangeText={(v) => setForm((p) => ({ ...p, corporate_name: v }))}
              error={errors.corporate_name}
            />

            <FormInput
              label="Nome fantasia"
              value={form.trade_name}
              onChangeText={(v) => setForm((p) => ({ ...p, trade_name: v }))}
              error={errors.trade_name}
            />

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Nome"
                  required
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  error={errors.name}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Slug"
                  required
                  value={form.slug}
                  onChangeText={(v) => setForm((p) => ({ ...p, slug: v.toLowerCase().replace(/\s+/g, "-") }))}
                  error={errors.slug}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="CNPJ"
                  value={form.cnpj}
                  onChangeText={(v) => setForm((p) => ({ ...p, cnpj: maskCNPJ(v) }))}
                  error={errors.cnpj}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormSelect
                  label="Status"
                  value={form.status}
                  onChange={(v) => setForm((p) => ({ ...p, status: v }))}
                  options={[
                    { value: "active", label: "Ativo" },
                    { value: "inactive", label: "Inativo" },
                  ]}
                  error={errors.status}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="E-mail"
                  value={form.email}
                  onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Telefone"
                  value={form.phone}
                  onChangeText={(v) => setForm((p) => ({ ...p, phone: maskPhone(v) }))}
                  error={errors.phone}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChangeText={(v) => setForm((p) => ({ ...p, whatsapp: maskWhatsapp(v) }))}
                  error={errors.whatsapp}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Timezone"
                  value={form.timezone}
                  onChangeText={(v) => setForm((p) => ({ ...p, timezone: v }))}
                  error={errors["settings.timezone"] ?? errors.settings}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="CEP"
                  value={form.zip_code}
                  onChangeText={(v) => {
                    setCepLookupMessage("");
                    setForm((p) => ({ ...p, zip_code: maskCEP(v) }));
                  }}
                  onBlur={handleCEPBlur}
                  error={errors.zip_code}
                />
                {!!cepLookupMessage && (
                  <Text
                    className={`text-xs mt-1 ${
                      cepLookupMessage.includes("localizado")
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {isLookingUpCEP ? "Buscando CEP..." : cepLookupMessage}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Rua"
                  value={form.street}
                  onChangeText={(v) => setForm((p) => ({ ...p, street: v }))}
                  error={errors.street}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Número"
                  value={form.number}
                  onChangeText={(v) => setForm((p) => ({ ...p, number: v }))}
                  error={errors.number}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Complemento"
                  value={form.complement}
                  onChangeText={(v) => setForm((p) => ({ ...p, complement: v }))}
                  error={errors.complement}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Bairro"
                  value={form.neighborhood}
                  onChangeText={(v) => setForm((p) => ({ ...p, neighborhood: v }))}
                  error={errors.neighborhood}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  label="Cidade"
                  value={form.city}
                  onChangeText={(v) => setForm((p) => ({ ...p, city: v }))}
                  error={errors.city}
                />
              </View>
            </View>

            <FormInput
              label="UF"
              value={form.state}
              onChangeText={(v) => setForm((p) => ({ ...p, state: v.toUpperCase().slice(0, 2) }))}
              error={errors.state}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>

          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-6" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="person-circle-outline" size={16} color="#7C3AED" />
              <Text className="text-sm font-bold text-gray-800">Usuário administrador inicial</Text>
            </View>

            {isEdit ? (
              <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-sm text-gray-600">
                  Campos de admin não são atualizados por esta rota. Para criar admin inicial, use a criação de tenant.
                </Text>
              </View>
            ) : (
              <>
                <FormInput
                  label="Nome do admin"
                  required
                  value={form.admin_name}
                  onChangeText={(v) => setForm((p) => ({ ...p, admin_name: v }))}
                  error={errors.admin_name}
                />

                <FormInput
                  label="E-mail do admin"
                  required
                  value={form.admin_email}
                  onChangeText={(v) => setForm((p) => ({ ...p, admin_email: v }))}
                  error={errors.admin_email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <View className="flex-row gap-3">
                  <View style={{ flex: 1 }}>
                    <FormInput
                      label="Senha inicial"
                      required
                      value={form.admin_password}
                      onChangeText={(v) => setForm((p) => ({ ...p, admin_password: v }))}
                      error={errors.admin_password}
                      secureTextEntry
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput
                      label="Confirmar senha"
                      required
                      value={form.admin_password_confirmation}
                      onChangeText={(v) => setForm((p) => ({ ...p, admin_password_confirmation: v }))}
                      error={errors.admin_password_confirmation}
                      secureTextEntry
                    />
                  </View>
                </View>
              </>
            )}
          </View>

          <View className="flex-row justify-end gap-3">
            <TouchableOpacity
              onPress={() => navigate("tenants")}
              className="px-5 py-3 rounded-xl border border-gray-200"
              activeOpacity={0.7}
              disabled={saving}
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={save}
              className="px-5 py-3 rounded-xl bg-violet-600"
              activeOpacity={0.85}
              disabled={saving}
              style={{ opacity: saving ? 0.75 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {isEdit ? "Salvar alterações" : "Criar tenant"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}