import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyRound, Trash2 } from "lucide-react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import FormInput from "../ui/FormInput";
import ConfirmModal from "../ui/ConfirmModal";
import SegmentedControl from "../banco-questoes/SegmentedControl";
import { deleteAiCredential, fetchAiSettings, saveAiCredential } from "../../services/aiSettings";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { AI_PROVIDER_LABELS, type AiCredentialSummary, type AiProvider, type AiSettingsResponse } from "../../types/questionAi";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { color } from "../../constants/theme";

type Draft = { api_key: string; model: string; active: boolean };

const PROVIDER_HELP: Record<AiProvider, string> = {
  openrouter: "Chave começando com sk-or-… (openrouter.ai → Keys). Modelo no formato provedor/modelo.",
  openai: "Chave começando com sk-… (platform.openai.com → API keys).",
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

type Props = {
  tenantId: number;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
  /** Avisa quem usa o editor dos dados carregados (ex.: chaves do .env para o super admin). */
  onLoaded?: (settings: AiSettingsResponse) => void;
};

/**
 * Chaves de IA (OpenRouter e OpenAI) de uma escola, gravadas criptografadas na API.
 * A chave nunca volta para o painel: só os 4 últimos caracteres. Usado em Configurações e no detalhe da instituição.
 */
export default function AiCredentialsEditor({ tenantId, setToast, onLoaded }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<AiProvider, Draft> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AiProvider, Record<string, string>>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<AiProvider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);
  const [deleting, setDeleting] = useState(false);

  const draftFrom = (p: AiCredentialSummary): Draft => ({ api_key: "", model: p.model ?? "", active: p.configured ? p.active : true });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAiSettings(tenantId);
      setSettings(data);
      setDrafts(Object.fromEntries(data.providers.map((p) => [p.provider, draftFrom(p)])) as Record<AiProvider, Draft>);
      setErrors({});
      onLoaded?.(data);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar as chaves de IA."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = (provider: AiProvider, patch: Partial<Draft>) => {
    setDrafts((prev) => (prev ? { ...prev, [provider]: { ...prev[provider], ...patch } } : prev));
    setErrors((prev) => ({ ...prev, [provider]: {} }));
  };

  const replaceProvider = (summary: AiCredentialSummary) => {
    setSettings((prev) => (prev ? { ...prev, providers: prev.providers.map((p) => (p.provider === summary.provider ? summary : p)) } : prev));
    setDrafts((prev) => (prev ? { ...prev, [summary.provider]: draftFrom(summary) } : prev));
  };

  const save = async (provider: AiProvider) => {
    const draft = drafts?.[provider];
    if (!draft) return;
    const current = settings?.providers.find((p) => p.provider === provider);
    if (!current?.configured && !draft.api_key.trim()) {
      setErrors((prev) => ({ ...prev, [provider]: { api_key: "Informe a chave de API." } }));
      setToast({ visible: true, type: "error", message: "Informe a chave de API." });
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
      setErrors((prev) => ({ ...prev, [provider]: getApiValidationErrors(error) }));
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
    !p.configured ? <Badge label="Não configurada" tone="neutral" /> : p.active ? <Badge label="Ativa" tone="success" /> : <Badge label="Inativa" tone="warning" />;

  if (loading) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }
  if (loadError || !settings || !drafts) {
    return (
      <View className="py-12 items-center" style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted text-center">{loadError ?? "Não foi possível carregar as chaves de IA."}</Text>
        <Button label="Tentar novamente" onPress={() => void load()} />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Text className="text-sm text-ink-muted">
        Com as duas chaves ativas, a IA usa o OpenRouter primeiro. Sem chave ativa, os botões de IA não aparecem para os usuários desta escola.
      </Text>
      <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
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
                    <Button variant="danger" icon={Trash2} label="Remover chave" onPress={() => setConfirmDelete(p.provider)} disabled={saving !== null} />
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

      <ConfirmModal
        visible={confirmDelete !== null}
        title="Remover chave de IA"
        message={`Remover a chave ${confirmDelete ? AI_PROVIDER_LABELS[confirmDelete] : ""} desta escola? Sem outra chave ativa, a IA do banco de questões deixa de funcionar para os usuários dela.`}
        confirmLabel="Remover chave"
        loading={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
}
