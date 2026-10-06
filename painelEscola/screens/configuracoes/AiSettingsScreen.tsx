import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { KeyRound, Trash2 } from "lucide-react-native";
import api from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import SegmentedControl from "../../components/banco-questoes/SegmentedControl";
import { deleteAiCredential, fetchAiSettings, saveAiCredential } from "../../services/aiSettings";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import {
  AI_PROVIDER_LABELS,
  type AiCredentialSummary,
  type AiProvider,
  type AiSettingsResponse,
} from "../../types/questionAi";
import { getActiveTenantId } from "../../utils/tenantContext";
import { color } from "../../constants/theme";

type Draft = { api_key: string; model: string; active: boolean };

const PROVIDER_HELP: Record<AiProvider, string> = {
  openrouter: "Chave começando com sk-or-… (openrouter.ai → Keys). Modelo no formato provedor/modelo.",
  openai: "Chave começando com sk-… (platform.openai.com → API keys).",
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

/**
 * Configurações → Integração com IA: chaves de IA do tenant (gravadas criptografadas na API).
 * A chave nunca volta para o painel: só os 4 últimos caracteres. Super admin usa as chaves do servidor (.env).
 */
export default function AiSettingsScreen() {
  const { user } = useAuth();
  const { contentPadding, isMobile } = useResponsiveLayout();
  const isSuperAdmin = user?.role === "super_admin";

  const [tenantOptions, setTenantOptions] = useState<{ value: string; label: string }[]>([]);
  // Super admin: começa no tenant escolhido no login.
  const [selectedTenantId, setSelectedTenantId] = useState(() => String(getActiveTenantId(user) ?? ""));
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<AiProvider, Draft> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AiProvider, Record<string, string>>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<AiProvider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const tenantId = useMemo(
    () => (isSuperAdmin ? (selectedTenantId ? Number(selectedTenantId) : null) : user?.tenant_id ?? null),
    [isSuperAdmin, selectedTenantId, user?.tenant_id]
  );

  useEffect(() => {
    if (!isSuperAdmin) return;
    api
      .get("/tenants", { params: { per_page: 200 } })
      .then(({ data }) => {
        const body = (data as any)?.body ?? (data as any)?.data ?? data;
        const items: { id: number; name?: string; corporate_name?: string }[] = body?.data ?? body?.items ?? body ?? [];
        setTenantOptions(items.map((t) => ({ value: String(t.id), label: t.name || t.corporate_name || `Tenant #${t.id}` })));
      })
      .catch(() => setToast({ visible: true, type: "error", message: "Não foi possível listar os tenants." }));
  }, [isSuperAdmin]);

  const draftFrom = (p: AiCredentialSummary): Draft => ({ api_key: "", model: p.model ?? "", active: p.configured ? p.active : true });

  const load = useCallback(async () => {
    if (tenantId == null) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAiSettings(tenantId);
      setSettings(data);
      setDrafts(
        Object.fromEntries(data.providers.map((p) => [p.provider, draftFrom(p)])) as Record<AiProvider, Draft>
      );
      setErrors({});
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar as chaves de IA."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = (provider: AiProvider, patch: Partial<Draft>) => {
    setDrafts((prev) => (prev ? { ...prev, [provider]: { ...prev[provider], ...patch } } : prev));
    setErrors((prev) => ({ ...prev, [provider]: {} }));
  };

  const replaceProvider = (summary: AiCredentialSummary) => {
    setSettings((prev) =>
      prev ? { ...prev, providers: prev.providers.map((p) => (p.provider === summary.provider ? summary : p)) } : prev
    );
    setDrafts((prev) => (prev ? { ...prev, [summary.provider]: draftFrom(summary) } : prev));
  };

  const save = async (provider: AiProvider) => {
    const draft = drafts?.[provider];
    if (!draft) return;
    const current = settings?.providers.find((p) => p.provider === provider);
    if (!current?.configured && !draft.api_key.trim()) {
      setErrors((prev) => ({ ...prev, [provider]: { api_key: "Informe a chave de API." } }));
      return;
    }
    setSaving(provider);
    try {
      const response = await saveAiCredential(
        provider,
        { ...(draft.api_key.trim() ? { api_key: draft.api_key.trim() } : {}), model: draft.model.trim() || null, active: draft.active },
        tenantId
      );
      replaceProvider(response.body);
      showApiToast(setToast, response, "Chave de IA salva com sucesso.");
    } catch (error) {
      const fieldErrors = getApiValidationErrors(error);
      setErrors((prev) => ({ ...prev, [provider]: fieldErrors }));
      showApiErrorToast(setToast, error, "Não foi possível salvar a chave de IA.");
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const response = await deleteAiCredential(confirmDelete, tenantId);
      showApiToast(setToast, response, "Chave de IA removida com sucesso.");
      setConfirmDelete(null);
      await load();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível remover a chave de IA.");
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (p: AiCredentialSummary) =>
    !p.configured ? (
      <Badge label="Não configurada" tone="neutral" />
    ) : p.active ? (
      <Badge label="Ativa" tone="success" />
    ) : (
      <Badge label="Inativa" tone="warning" />
    );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}>
        <View className="mb-6">
          <PageHeader
            title="Integração com IA"
            description="Chaves usadas pela IA do banco de questões (preencher com IA e criar questões semelhantes). As chaves ficam criptografadas e nunca são exibidas depois de salvas."
          />
        </View>

        {isSuperAdmin && (
          <View style={{ gap: 16, marginBottom: 24 }}>
            <Panel
              title="Chaves do super admin"
              description="Definidas no servidor (.env). Valem só para usuários super admin; os tenants usam as próprias chaves abaixo."
            >
              <View style={{ gap: 10 }}>
                {(settings?.env ?? []).map((e) => (
                  <View key={e.provider} className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
                    <Text className="text-sm font-medium text-ink" style={{ minWidth: 100 }}>
                      {AI_PROVIDER_LABELS[e.provider]}
                    </Text>
                    <Badge label={e.configured ? "Configurada" : "Não configurada"} tone={e.configured ? "success" : "neutral"} />
                    <Text className="text-xs font-mono text-ink-muted">{e.model}</Text>
                  </View>
                ))}
                {!settings?.env && <Text className="text-sm text-ink-muted">Selecione um tenant para ver o status.</Text>}
              </View>
            </Panel>
            <View style={{ maxWidth: isMobile ? undefined : 480 }}>
              <SearchableSelect
                label="Tenant"
                value={selectedTenantId}
                options={tenantOptions}
                onChange={setSelectedTenantId}
                placeholder="Selecione o tenant"
                modalTitle="Selecionar tenant"
              />
            </View>
          </View>
        )}

        {tenantId == null ? (
          <Text className="text-sm text-ink-muted">Selecione um tenant para gerenciar as chaves de IA.</Text>
        ) : loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color={color.brand} />
          </View>
        ) : loadError || !settings || !drafts ? (
          <View className="py-16 items-center" style={{ gap: 12 }}>
            <Text className="text-sm text-ink-muted text-center">{loadError ?? "Não foi possível carregar as chaves de IA."}</Text>
            <Button label="Tentar novamente" onPress={() => void load()} />
          </View>
        ) : (
          <View style={{ gap: 24 }}>
            <Text className="text-sm text-ink-muted">
              Com as duas chaves ativas, a IA usa o OpenRouter primeiro. Sem chave ativa, os botões de IA não aparecem para
              os usuários desta escola.
            </Text>
            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 24, alignItems: "flex-start" }}>
              {settings.providers.map((p) => {
                const draft = drafts[p.provider];
                const fieldErrors = errors[p.provider] ?? {};
                return (
                  <Panel
                    key={p.provider}
                    title={AI_PROVIDER_LABELS[p.provider]}
                    description={PROVIDER_HELP[p.provider]}
                    actions={statusBadge(p)}
                    style={{ flex: 1, width: isMobile ? "100%" : undefined, minWidth: 0 }}
                    footer={
                      <>
                        {p.configured && (
                          <Button
                            variant="danger"
                            icon={Trash2}
                            label="Remover chave"
                            onPress={() => setConfirmDelete(p.provider)}
                            disabled={saving !== null}
                          />
                        )}
                        <Button
                          variant="primary"
                          icon={KeyRound}
                          label="Salvar"
                          onPress={() => void save(p.provider)}
                          loading={saving === p.provider}
                          disabled={saving !== null && saving !== p.provider}
                        />
                      </>
                    }
                  >
                    {p.configured && (
                      <View className="flex-row flex-wrap" style={{ gap: 16, marginBottom: 16 }}>
                        <View>
                          <Text className="text-xs text-ink-subtle">Chave atual</Text>
                          <Text className="text-sm font-mono text-ink">••••{p.key_hint}</Text>
                        </View>
                        <View>
                          <Text className="text-xs text-ink-subtle">Atualizada em</Text>
                          <Text className="text-sm font-mono text-ink">{formatDate(p.configured_at)}</Text>
                        </View>
                      </View>
                    )}
                    <FormInput
                      label={p.configured ? "Nova chave de API" : "Chave de API"}
                      value={draft.api_key}
                      onChangeText={(v) => setDraft(p.provider, { api_key: v })}
                      error={fieldErrors.api_key}
                      secureTextEntry
                      autoComplete="off"
                      autoCorrect={false}
                      placeholder={p.configured ? "Deixe em branco para manter a atual" : "Cole a chave aqui"}
                    />
                    <FormInput
                      label="Modelo (opcional)"
                      value={draft.model}
                      onChangeText={(v) => setDraft(p.provider, { model: v })}
                      error={fieldErrors.model}
                      autoCorrect={false}
                      placeholder={`Padrão: ${p.default_model}`}
                    />
                    <SegmentedControl<"on" | "off">
                      label="Situação"
                      allowClear={false}
                      options={[
                        { value: "on", label: "Ativa" },
                        { value: "off", label: "Inativa" },
                      ]}
                      value={draft.active ? "on" : "off"}
                      onChange={(v) => setDraft(p.provider, { active: v === "on" })}
                    />
                  </Panel>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={confirmDelete !== null}
        title="Remover chave de IA"
        message={`Remover a chave ${confirmDelete ? AI_PROVIDER_LABELS[confirmDelete] : ""} desta escola? Sem outra chave ativa, a IA do banco de questões deixa de funcionar para os usuários dela.`}
        confirmLabel="Remover chave"
        loading={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
