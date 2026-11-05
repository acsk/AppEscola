import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import api from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Badge from "../../components/ui/Badge";
import SearchableSelect from "../../components/ui/SearchableSelect";
import ToastBanner from "../../components/ui/ToastBanner";
import AiCredentialsEditor from "../../components/integrations/AiCredentialsEditor";
import AiSpendPanel from "../../components/integrations/AiSpendPanel";
import { fetchEmbeddingMetrics } from "../../services/questionSimilarity";
import type { ApiToastState } from "../../utils/apiErrors";
import { AI_PROVIDER_LABELS, type AiSettingsResponse } from "../../types/questionAi";
import { getActiveTenantId } from "../../utils/tenantContext";

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
  const [envKeys, setEnvKeys] = useState<AiSettingsResponse["env"]>(null);
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });

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

  const onLoaded = useCallback((settings: AiSettingsResponse) => setEnvKeys(settings.env ?? null), []);

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}>
        <View className="mb-6">
          <PageHeader
            title="Integração com IA"
            description="Chaves usadas pela IA do banco de questões (preencher com IA e criar questões semelhantes). As chaves ficam criptografadas e nunca são exibidas depois de salvas."
          />
        </View>

        <EmbeddingMetrics />

        {isSuperAdmin && (
          <View style={{ gap: 16, marginBottom: 24 }}>
            <Panel
              title="Chaves do super admin"
              description="Definidas no servidor (.env). Valem só para usuários super admin; os tenants usam as próprias chaves abaixo."
            >
              <View style={{ gap: 10 }}>
                {(envKeys ?? []).map((e) => (
                  <View key={e.provider} className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
                    <Text className="text-sm font-medium text-ink" style={{ minWidth: 100 }}>
                      {AI_PROVIDER_LABELS[e.provider]}
                    </Text>
                    <Badge label={e.configured ? "Configurada" : "Não configurada"} tone={e.configured ? "success" : "neutral"} />
                    <Text className="text-xs font-mono text-ink-muted">{e.model}</Text>
                  </View>
                ))}
                {!envKeys && <Text className="text-sm text-ink-muted">Selecione um tenant para ver o status.</Text>}
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
        ) : (
          <View style={{ gap: 24 }}>
            <AiCredentialsEditor key={tenantId} tenantId={tenantId} setToast={setToast} onLoaded={onLoaded} />
            <AiSpendPanel key={`spend-${tenantId}`} tenantId={tenantId} />
          </View>
        )}
      </ScrollView>

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

function EmbeddingMetrics() {
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchEmbeddingMetrics>> | null>(null);

  useEffect(() => {
    void fetchEmbeddingMetrics().then(setMetrics).catch(() => setMetrics(null));
  }, []);

  if (!metrics) return null;

  const itens = [
    ["Embeddings gerados", metrics.embeddings_gerados],
    ["Reutilizados", metrics.embeddings_reutilizados],
    ["Armazenados", metrics.armazenados],
    ["Buscas", metrics.buscas],
    ["Tempo médio da busca", `${metrics.tempo_medio_busca_ms} ms`],
    ["Duplicatas detectadas", metrics.duplicatas_detectadas],
    ["Regeneradas", metrics.regeneradas],
    ["Encaminhadas por semelhança", metrics.rejeitadas_semelhanca],
    ["Falhas", metrics.falhas],
    ["Custo de embeddings", `US$ ${metrics.custo_embeddings_usd.toFixed(4)}`],
  ];

  return (
    <View style={{ marginBottom: 24 }}>
      <Panel title="Busca semântica" description="Consumo dos embeddings desta escola. O cron questions:index-embeddings continua a indexação.">
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {itens.map(([label, value]) => (
            <View key={String(label)} style={{ minWidth: 140 }}>
              <Text className="text-xs text-ink-muted">{label}</Text>
              <Text className="text-sm font-semibold text-ink">{value}</Text>
            </View>
          ))}
        </View>
      </Panel>
    </View>
  );
}
