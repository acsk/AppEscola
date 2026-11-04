import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { RefreshCw, Sparkles } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import StatTile from "../../components/ui/StatTile";
import DatePickerInput from "../../components/ui/DatePickerInput";
import CountColumns from "../../components/saas/CountColumns";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import { fetchAiUsage, fmtInt, fmtIsoDate, fmtUsd, type AiUsageReport, type AiUsageRow } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const firstOfMonth = () => {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return `${today.slice(0, 8)}01`;
};

const tokens = (r: AiUsageRow) => fmtInt(r.prompt_tokens + r.completion_tokens);

/** Tabela simples do relatório: primeira coluna em texto, demais à direita (números). */
function Table({ head, rows, isMobile }: { head: string[]; rows: React.ReactNode[][]; isMobile: boolean }) {
  return (
    <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
      <View style={{ width: "100%", minWidth: isMobile ? 620 : undefined }}>
        {[head, ...rows].map((row, i) => (
          <View key={i} className={`flex-row items-center ${i === 0 ? "bg-surface-sunken" : "border-t border-border"}`} style={{ paddingVertical: 8, paddingHorizontal: 24, gap: 12 }}>
            {row.map((cell, j) => (
              <View key={j} style={{ flex: j === 0 ? 2.2 : 1, alignItems: j === 0 ? "flex-start" : "flex-end" }}>
                {typeof cell === "string" || typeof cell === "number" ? (
                  <Text className={i === 0 ? "text-xs font-medium text-ink-muted" : `text-sm text-ink ${j > 0 ? "font-mono" : ""}`} numberOfLines={1}>{cell}</Text>
                ) : (
                  cell
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Plataforma › Monitoramento › Custos de IA: requisições, tokens, custo (real do provedor ou estimado), erros,
 * consumo por instituição frente ao limite do plano e alerta de custo elevado.
 */
export default function SaasAiUsageScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [from, setFrom] = useState(isoToDisplay(firstOfMonth()));
  const [to, setTo] = useState(isoToDisplay(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })));
  const [data, setData] = useState<AiUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const isoFrom = displayToISO(from);
    const isoTo = displayToISO(to);
    if (!isoFrom || !isoTo) return;
    if (isoFrom > isoTo) {
      setError("A data inicial deve ser anterior à final.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await fetchAiUsage(isoFrom, isoTo));
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o consumo de IA."));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const errorRate = data && data.totals.requests ? Math.round((data.totals.errors / data.totals.requests) * 1000) / 10 : 0;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Monitoramento" }, { label: "Custos de IA" }]}
        title="Custos de IA"
        description="Cada chamada aos provedores de IA, por instituição, recurso e modelo. Custo real quando o provedor informa; senão, estimado pela tabela de preços."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <View style={{ width: isMobile ? "100%" : 180 }}>
          <DatePickerInput label="De" value={from} onChangeText={setFrom} compact />
        </View>
        <View style={{ width: isMobile ? "100%" : 180 }}>
          <DatePickerInput label="Até" value={to} onChangeText={setTo} compact />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      {!data ? (
        loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={color.brand} />
          </View>
        ) : null
      ) : (
        <>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {[
              <StatTile key="r" label="Requisições" value={fmtInt(data.totals.requests)} hint={`${fmtInt(data.outputs.documents_processed)} documentos · ${fmtInt(data.outputs.questions_generated)} questões geradas`} />,
              <StatTile key="c" label="Custo no período" value={fmtUsd(data.totals.cost_usd + data.embeddings.cost_usd)} hint={`${fmtUsd(data.embeddings.cost_usd)} em embeddings`} />,
              <StatTile key="t" label="Tokens" value={tokens(data.totals)} hint={`${fmtInt(data.embeddings.tokens)} em embeddings`} />,
              <StatTile key="e" label="Taxa de erro" value={`${errorRate.toLocaleString("pt-BR")}%`} hint={`${fmtInt(data.totals.errors)} chamadas com erro`} />,
            ].map((tile, i) => (
              <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
                {tile}
              </View>
            ))}
          </View>

          {data.totals.unpriced > 0 ? (
            <Text className="text-xs text-ink-muted">
              {`${fmtInt(data.totals.unpriced)} chamadas sem custo: o provedor não informou e o modelo não está na tabela de preços (config/saas.php).`}
            </Text>
          ) : null}

          <Panel title="Custo por dia" description={`${fmtIsoDate(data.period.from)} a ${fmtIsoDate(data.period.to)}`}>
            {data.daily.length === 0 ? (
              <Text className="text-sm text-ink-muted">Nenhuma chamada de IA no período.</Text>
            ) : (
              <CountColumns unit="" format={fmtUsd} points={data.daily.map((d) => ({ key: d.day, label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: d.cost_usd }))} />
            )}
          </Panel>

          <Panel title="Por instituição" description={`Mês atual frente ao limite do plano. Alerta de custo a partir de ${fmtUsd(data.alert_threshold_usd)} no mês.`} flush>
            {data.by_tenant.length === 0 ? (
              <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhuma chamada no período.</Text>
            ) : (
              <Table
                isMobile={isMobile}
                head={["Instituição", "Requisições", "Tokens", "Custo", "Mês × limite"]}
                rows={data.by_tenant.map((r) => [
                  r.tenant ? (
                    <TouchableOpacity onPress={() => navigate("tenants-detail", { tenantId: r.tenant!.id, tab: "usage" })} role="link" className="flex-row items-center" style={{ gap: 8 }}>
                      <Text className="text-sm font-medium text-brand" numberOfLines={1}>{r.tenant.name}</Text>
                      {r.high_cost ? <Badge label="Custo elevado" tone="danger" /> : null}
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-sm text-ink-muted">Super admin (sem instituição)</Text>
                  ),
                  fmtInt(r.requests),
                  tokens(r),
                  fmtUsd(r.cost_usd),
                  r.tenant ? `${fmtInt(r.month_requests)} / ${r.month_limit == null ? "∞" : fmtInt(r.month_limit)}` : "—",
                ])}
              />
            )}
          </Panel>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 420 }}>
              <Panel title="Por recurso" description="Rota ou tarefa que chamou a IA." flush>
                <Table
                  isMobile={isMobile}
                  head={["Recurso", "Requisições", "Erros", "Custo"]}
                  rows={data.by_feature.map((r) => [r.feature, fmtInt(r.requests), fmtInt(r.errors), fmtUsd(r.cost_usd)])}
                />
              </Panel>
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 420 }}>
              <Panel title="Por modelo" description="Chave da plataforma (.env) ou da própria escola." flush>
                <Table
                  isMobile={isMobile}
                  head={["Modelo", "Chave", "Requisições", "Custo"]}
                  rows={data.by_model.map((r) => [
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                      <Sparkles size={14} color={color["ink-muted"]} />
                      <Text className="text-sm text-ink" numberOfLines={1}>{r.model ?? r.provider}</Text>
                    </View>,
                    r.source === "env" ? "Plataforma" : r.source === "tenant" ? "Escola" : "—",
                    fmtInt(r.requests),
                    fmtUsd(r.cost_usd),
                  ])}
                />
              </Panel>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
