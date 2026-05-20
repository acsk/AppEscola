import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import FormSelect from "../../components/ui/FormSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import {
  getMobileTheme,
  resetMobileTheme,
  updateMobileTheme,
} from "../../services/mobileTheme";
import type {
  MobileThemeColors,
  MobileThemeSchemaField,
  MobileThemeTemplate,
} from "../../types/mobileTheme";

type TenantOption = { value: string; label: string };

type TenantApiItem = {
  id: number;
  name?: string;
  corporate_name?: string;
  slug?: string;
};

const GROUP_ORDER = [
  "marca",
  "menu_lateral",
  "botoes_menu",
  "texto",
  "superficie",
  "status",
] as const;

const GROUP_LABELS: Record<string, string> = {
  marca: "Marca",
  menu_lateral: "Menu lateral (header e labels)",
  botoes_menu: "Botões do menu",
  texto: "Textos das telas",
  superficie: "Superfícies",
  status: "Status",
};

function normalizeHexInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

function isFullHex(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(normalizeHexInput(value));
}

function getPickerValue(value: string, fallback: string): string {
  const normalized = normalizeHexInput(value);
  if (isFullHex(normalized)) return normalized;
  const normalizedFallback = normalizeHexInput(fallback);
  if (isFullHex(normalizedFallback)) return normalizedFallback;
  if (isFullHex(normalizeHexInput(fallback))) return normalizeHexInput(fallback);
  return "#4F46E5";
}

type ColorFieldProps = {
  label: string;
  description?: string;
  value: string;
  defaultValue: string;
  editable: boolean;
  onChange: (value: string) => void;
};

function ColorField({
  label,
  description,
  value,
  defaultValue,
  editable,
  onChange,
}: ColorFieldProps) {
  const textInputRef = useRef<TextInput>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const previewColor = getPickerValue(value, defaultValue);

  const openColorPicker = () => {
    if (!editable) return;
    if (Platform.OS === "web" && colorInputRef.current) {
      try {
        colorInputRef.current.showPicker?.();
      } catch {
        colorInputRef.current.click();
      }
      return;
    }
    textInputRef.current?.focus();
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(normalizeHexInput(event.target.value));
  };

  const handleTextChange = (text: string) => {
    const hasHash = text.trim().startsWith("#");
    const hex = text.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
    onChange(hasHash ? `#${hex}` : hex);
  };

  return (
    <View
      className="flex-row items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2"
      style={{ minWidth: 300, flexBasis: 360, flexGrow: 1 }}
    >
      <TouchableOpacity
        onPress={openColorPicker}
        disabled={!editable}
        className="h-9 w-9 rounded-lg border border-gray-200"
        style={{ backgroundColor: previewColor }}
        activeOpacity={0.8}
      >
        {Platform.OS === "web" && (
          <input
            ref={colorInputRef}
            type="color"
            value={previewColor}
            onChange={handleColorChange}
            disabled={!editable}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              width: "100%",
              height: "100%",
              cursor: editable ? "pointer" : "default",
            }}
            aria-label={`Selecionar ${label}`}
          />
        )}
      </TouchableOpacity>

      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-gray-700" numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>

      <TextInput
        ref={textInputRef}
        value={value}
        onChangeText={handleTextChange}
        onBlur={() => {
          if (value.trim()) onChange(normalizeHexInput(value));
        }}
        placeholder={normalizeHexInput(defaultValue)}
        placeholderTextColor="#9CA3AF"
        editable={editable}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        className={`h-9 w-28 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800 ${
          editable ? "" : "text-gray-400"
        }`}
      />
    </View>
  );
}

export default function MobileThemeSettingsScreen() {
  const { user } = useAuth();
  const { contentPadding } = useResponsiveLayout();
  const isSuperAdmin = user?.role === "super_admin";
  const canEdit =
    isSuperAdmin ||
    ["admin", "manager", "financial"].includes(String(user?.role ?? ""));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const [templates, setTemplates] = useState<MobileThemeTemplate[]>([]);
  const [schema, setSchema] = useState<Record<string, MobileThemeSchemaField>>({});
  const [defaults, setDefaults] = useState<MobileThemeColors | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("default");
  const [originalTemplateId, setOriginalTemplateId] = useState<string>("default");
  const [draft, setDraft] = useState<MobileThemeColors | null>(null);
  const [original, setOriginal] = useState<MobileThemeColors | null>(null);
  const [templateBase, setTemplateBase] = useState<MobileThemeColors | null>(null);

  const effectiveTenantId = useMemo(() => {
    if (isSuperAdmin && selectedTenantId) {
      return Number.parseInt(selectedTenantId, 10);
    }
    return user?.tenant_id ?? null;
  }, [isSuperAdmin, selectedTenantId, user?.tenant_id]);

  const loadTheme = useCallback(async () => {
    if (effectiveTenantId == null || !Number.isFinite(effectiveTenantId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getMobileTheme(effectiveTenantId);
      setTemplates(data.templates ?? []);
      setSchema(data.schema ?? {});
      setDefaults(data.defaults);
      setLogoUrl(data.logo_url ?? null);
      setTemplateId(data.template_id ?? "default");
      setOriginalTemplateId(data.template_id ?? "default");
      setTemplateBase(data.template_colors ?? data.colors);
      setDraft({ ...data.colors });
      setOriginal({ ...data.colors });
    } catch (err: any) {
      setToast({
        type: "error",
        message:
          err?.response?.data?.message ??
          err?.message ??
          "Não foi possível carregar o tema do app mobile.",
      });
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const { data } = await api.get("/tenants", { params: { per_page: 200 } });
        const body = (data as any)?.body ?? (data as any)?.data ?? data;
        const items: TenantApiItem[] = body?.data ?? body?.items ?? body ?? [];
        const options = items.map((t) => ({
          value: String(t.id),
          label: t.name || t.corporate_name || `Tenant #${t.id}`,
        }));
        setTenantOptions(options);
        if (!selectedTenantId && options[0]) {
          setSelectedTenantId(options[0].value);
        }
      } catch {
        setToast({ type: "error", message: "Falha ao listar tenants." });
      }
    })();
  }, [isSuperAdmin, selectedTenantId]);

  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);

  const colorKeys = useMemo(() => Object.keys(schema), [schema]);

  const groupedFields = useMemo(() => {
    const groups: Record<string, string[]> = {};
    colorKeys.forEach((key) => {
      const group = schema[key]?.group ?? "outros";
      if (!groups[group]) groups[group] = [];
      groups[group].push(key);
    });
    return GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => ({
      id: g,
      label: GROUP_LABELS[g] ?? g,
      keys: groups[g] ?? [],
    }));
  }, [schema, colorKeys]);

  const isDirty = useMemo(() => {
    if (!draft || !original) return false;
    if (templateId !== originalTemplateId) return true;
    return colorKeys.some((k) => draft[k] !== original[k]);
  }, [draft, original, templateId, originalTemplateId, colorKeys]);

  const applyTemplateLocally = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setTemplateBase({ ...tpl.colors });
    setDraft({ ...tpl.colors });
  };

  const handleSave = async () => {
    if (!draft || effectiveTenantId == null || !canEdit) return;

    const templateChanged = templateId !== originalTemplateId;
    const payload: Partial<MobileThemeColors> = {};
    const base = templateBase ?? {};

    colorKeys.forEach((key) => {
      const draftVal = normalizeHexInput(draft[key] ?? "");
      const baseVal = normalizeHexInput(base[key] ?? "");
      if (draftVal && draftVal !== baseVal) {
        payload[key] = draftVal;
      }
    });

    if (!templateChanged && Object.keys(payload).length === 0) {
      setToast({ type: "error", message: "Nenhuma alteração para salvar." });
      return;
    }

    setSaving(true);
    try {
      const data = await updateMobileTheme(
        {
          ...(templateChanged ? { template_id: templateId, clear_overrides: true } : {}),
          ...(Object.keys(payload).length > 0 ? { colors: payload } : {}),
        },
        effectiveTenantId
      );
      setTemplates(data.templates ?? templates);
      setTemplateId(data.template_id ?? templateId);
      setOriginalTemplateId(data.template_id ?? templateId);
      setTemplateBase(data.template_colors ?? data.colors);
      setDraft({ ...data.colors });
      setOriginal({ ...data.colors });
      setLogoUrl(data.logo_url ?? null);
      setToast({ type: "success", message: "Tema salvo com sucesso." });
    } catch (err: any) {
      setToast({
        type: "error",
        message: err?.response?.data?.message ?? "Erro ao salvar cores.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (effectiveTenantId == null || !canEdit) return;
    setResetting(true);
    try {
      const data = await resetMobileTheme(effectiveTenantId);
      setTemplates(data.templates ?? templates);
      setTemplateId(data.template_id ?? "default");
      setOriginalTemplateId(data.template_id ?? "default");
      setTemplateBase(data.template_colors ?? data.colors);
      setDraft({ ...data.colors });
      setOriginal({ ...data.colors });
      setToast({ type: "success", message: "Tema restaurado para o padrão original." });
    } catch (err: any) {
      setToast({
        type: "error",
        message: err?.response?.data?.message ?? "Erro ao restaurar padrão.",
      });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 64 }}
      className="flex-1"
    >
      <ToastBanner
        visible={toast != null}
        type={toast?.type ?? "success"}
        message={toast?.message ?? ""}
        onClose={() => setToast(null)}
      />

      <View className="mb-4 flex-row items-start">
        <View className="w-10 h-10 rounded-xl bg-violet-100 items-center justify-center mr-3">
          <Ionicons name="color-palette-outline" size={20} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Tema do app mobile</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            Personalize as cores que os alunos veem no mobileEscola. A logo é configurada no
            cadastro do tenant.
          </Text>
        </View>
      </View>

      {isSuperAdmin && (
        <View className="mb-4">
          <FormSelect
            label="Tenant"
            value={selectedTenantId}
            options={tenantOptions}
            onChange={setSelectedTenantId}
            placeholder="Selecione o tenant"
          />
        </View>
      )}

      {logoUrl ? (
        <View className="mb-3 flex-row items-center gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <Image
            source={{ uri: logoUrl }}
            style={{ width: 44, height: 44, borderRadius: 10 }}
            resizeMode="contain"
          />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-800">Logo atual</Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Altere em Tenants → foto da escola.
            </Text>
          </View>
        </View>
      ) : null}

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <View className="p-10 items-center">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : !draft ? (
          <View className="p-6">
            <Text className="text-sm text-gray-600">Selecione um tenant para editar o tema.</Text>
          </View>
        ) : (
          <View className="p-4 gap-5">
            <View>
              <Text className="text-xs font-bold text-violet-700 uppercase mb-2">
                Templates prontos
              </Text>
              <Text className="text-xs text-gray-500 mb-3">
                Escolha um ponto de partida e ajuste as cores abaixo se precisar.
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {templates.map((tpl) => {
                  const selected = templateId === tpl.id;
                  const swatches = tpl.preview?.length
                    ? tpl.preview
                    : [tpl.colors.primary, tpl.colors.menu_button_background, tpl.colors.soft];
                  return (
                    <TouchableOpacity
                      key={tpl.id}
                      onPress={() => canEdit && applyTemplateLocally(tpl.id)}
                      disabled={!canEdit}
                      className={`min-w-[150px] flex-1 rounded-xl border px-3 py-2.5 ${
                        selected
                          ? "border-violet-500 bg-violet-50"
                          : "border-gray-200 bg-white"
                      }`}
                      activeOpacity={0.85}
                    >
                      <View className="flex-row gap-1 mb-2">
                        {swatches.slice(0, 3).map((hex, idx) => (
                          <View
                            key={`${tpl.id}-${idx}`}
                            className="h-5 flex-1 rounded-md border border-gray-200"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </View>
                      <Text
                        className={`text-sm font-bold ${
                          selected ? "text-violet-800" : "text-gray-800"
                        }`}
                      >
                        {tpl.name}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                        {tpl.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {groupedFields.map((group) => (
              <View key={group.id}>
                <Text className="text-xs font-bold text-violet-700 uppercase mb-2">
                  {group.label}
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {group.keys.map((key) => {
                    const meta = schema[key];
                    const value = draft[key] ?? "";
                    const def = templateBase?.[key] ?? defaults?.[key] ?? "";
                    return (
                      <ColorField
                        key={key}
                        label={meta?.label ?? key}
                        description={meta?.description}
                        value={value}
                        defaultValue={def}
                        editable={canEdit}
                        onChange={(text) =>
                          setDraft((prev) => (prev ? { ...prev, [key]: text } : prev))
                        }
                      />
                    );
                  })}
                </View>
              </View>
            ))}

            {canEdit ? (
              <View className="flex-row flex-wrap gap-3 pt-1">
                <TouchableOpacity
                  onPress={() => void handleSave()}
                  disabled={saving || !isDirty}
                  className={`px-5 py-2.5 rounded-xl ${
                    saving || !isDirty ? "bg-violet-300" : "bg-violet-600"
                  }`}
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold">
                    {saving ? "Salvando…" : "Salvar alterações"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setConfirmReset(true)}
                  disabled={resetting}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white"
                  activeOpacity={0.85}
                >
                  <Text className="text-gray-700 font-semibold">Restaurar padrão</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="text-sm text-amber-700">
                Seu perfil pode visualizar, mas não alterar estas cores.
              </Text>
            )}
          </View>
        )}
      </View>

      <ConfirmModal
        visible={confirmReset}
        title="Restaurar cores padrão?"
        message="O template Original (Índigo) será restaurado e todas as personalizações serão removidas."
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        iconName="refresh-outline"
        tone="primary"
        onConfirm={() => void handleReset()}
        onCancel={() => setConfirmReset(false)}
        loading={resetting}
      />
    </ScrollView>
  );
}
