import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import StatTile from "../ui/StatTile";
import CountColumns from "../saas/CountColumns";
import { fetchAiSpend, type AiSpend } from "../../services/aiSettings";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { color } from "../../constants/theme";

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.01 ? 4 : 2 })}`;
const int = (v: number) => v.toLocaleString("pt-BR");
const PROVIDER_LABEL: Record<string, string> = { openrouter: "OpenRouter", openai: "OpenAI" };

/** Uso e gasto de IA de uma escola: mês, últimos 6 meses, total, por provedor e por recurso. */
export default function AiSpendPanel({ tenantId }: { tenantId: number }) {
  const { isMobile } = useResponsiveLayout();
  const [data, setData] = useState<AiSpend | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAiSpend(tenantId));
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os gastos de IA."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <Panel title="Uso e gastos de IA">
        {loading ? (
          <ActivityIndicator color={color.brand} />
        ) : (
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={() => void load()} />
          </View>
        )}
      </Panel>
    );
  }

  const m = data.month;

  return (
    <Panel
      title="Uso e gastos de IA"
      description="Custo informado pelo provedor; quando ele não informa, estimado pela tabela de preços. Inclui a busca semântica (embeddings)."
      actions={<Button size="sm" label="Atualizar" onPress={() => void load()} loading={loading} />}
    >
      <View style={{ gap: 20 }}>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {[
            <StatTile key="m" label="Gasto no mês" value={usd(m.cost_usd)} hint={`${usd(m.embeddings_cost_usd)} em busca semântica`} />,
            <StatTile key="r" label="Requisições no mês" value={int(m.requests)} hint={m.limit == null ? "sem limite no plano" : `limite do plano: ${int(m.limit)}`} />,
            <StatTile key="t" label="Gasto total" value={usd(data.total.cost_usd)} hint={data.total.since ? `desde ${new Date(data.total.since).toLocaleDateString("pt-BR")}` : "sem uso registrado"} />,
          ].map((tile, i) => (
            <View key={i} style={{ flexBasis: isMobile ? "100%" : 180, flexGrow: 1 }}>
              {tile}
            </View>
          ))}
        </View>

        <Text className="text-xs text-ink-muted">
          {`No mês: ${usd(m.tenant_key_cost_usd)} com as chaves da escola` +
            (m.platform_key_requests ? ` · ${usd(m.platform_key_cost_usd)} com a chave da plataforma (${int(m.platform_key_requests)} chamadas do suporte)` : "") +
            (m.errors ? ` · ${int(m.errors)} chamadas com erro` : "")}
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: 24 }}>
          <View style={{ flex: 1.3, minWidth: isMobile ? "100%" : 320, gap: 8 }}>
            <Text className="text-sm font-medium text-ink">Gasto por mês</Text>
            <CountColumns unit="" height={120} format={usd} points={data.months.map((p) => ({ key: p.month, label: p.label, value: p.cost_usd }))} />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 260, gap: 6 }}>
            <Text className="text-sm font-medium text-ink">Por provedor (mês)</Text>
            {data.by_provider.length === 0 ? (
              <Text className="text-sm text-ink-muted">Nenhum uso no mês.</Text>
            ) : (
              data.by_provider.map((p) => (
                <View key={p.provider} className="flex-row justify-between border-b border-border" style={{ paddingVertical: 6, gap: 8 }}>
                  <Text className="text-sm text-ink" style={{ flex: 1 }}>{`${PROVIDER_LABEL[p.provider] ?? p.provider} · ${int(p.requests)} req.`}</Text>
                  <Text className="text-sm font-mono text-ink">{usd(p.cost_usd)}</Text>
                </View>
              ))
            )}
            <Text className="text-sm font-medium text-ink" style={{ marginTop: 10 }}>Recursos que mais gastaram (mês)</Text>
            {data.by_feature.length === 0 ? (
              <Text className="text-sm text-ink-muted">—</Text>
            ) : (
              data.by_feature.slice(0, 5).map((f) => (
                <View key={f.feature} className="flex-row justify-between" style={{ paddingVertical: 4, gap: 8 }}>
                  <Text className="text-xs font-mono text-ink-muted" style={{ flex: 1 }} numberOfLines={1}>{f.feature}</Text>
                  <Text className="text-xs font-mono text-ink">{usd(f.cost_usd)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </Panel>
  );
}
