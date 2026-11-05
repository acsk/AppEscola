import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import StatTile from "../../components/ui/StatTile";
import CountColumns from "../../components/saas/CountColumns";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchInsights, fmtBrl, fmtInt, type SaasInsights } from "../../services/saas";

const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);

const MOVEMENT_COLUMNS: { key: "new" | "expansion" | "reactivation" | "contraction" | "churn" | "net"; label: string }[] = [
  { key: "new", label: "Novo" },
  { key: "expansion", label: "Expansão" },
  { key: "reactivation", label: "Reativação" },
  { key: "contraction", label: "Contração" },
  { key: "churn", label: "Cancelamento" },
  { key: "net", label: "Líquido" },
];

/**
 * Plataforma › Relatórios › Indicadores e projeções: movimentações do MRR, churn, LTV, conversão de teste
 * e projeção de 6 meses (só receita das assinaturas SaaS).
 */
export default function SaasInsightsScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [data, setData] = useState<SaasInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchInsights());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os indicadores."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Relatórios" }, { label: "Indicadores e projeções" }]}
        title="Indicadores e projeções"
        description="Como o MRR se move mês a mês e para onde vai nos próximos 6 meses. Receita só das assinaturas SaaS."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

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
              <StatTile
                key="net"
                label="MRR líquido novo no mês"
                value={fmtBrl(data.net_new_mrr)}
                delta={data.mrr_growth_percent == null ? null : pct(Math.abs(data.mrr_growth_percent))}
                trend={data.mrr_growth_percent == null || data.mrr_growth_percent === 0 ? null : data.mrr_growth_percent > 0 ? "up" : "down"}
                hint={`MRR atual ${fmtBrl(data.mrr)}`}
              />,
              <StatTile key="churn" label="Churn mensal" value={pct(data.customer_churn_percent)} hint={`${pct(data.revenue_churn_percent)} da receita · média de 3 meses`} />,
              <StatTile key="ltv" label="LTV estimado" value={data.ltv == null ? "—" : fmtBrl(data.ltv)} hint={`ARPA ${fmtBrl(data.arpa)} ÷ churn mensal`} />,
              <StatTile
                key="trial"
                label="Conversão de teste"
                value={pct(data.trial_conversion.percent)}
                hint={`${fmtInt(data.trial_conversion.converted)} de ${fmtInt(data.trial_conversion.ended)} testes encerrados (180 dias)`}
              />,
            ].map((tile, i) => (
              <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
                {tile}
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View style={{ flex: 1.4, minWidth: isMobile ? "100%" : 440 }}>
              <Panel
                title="Projeção do MRR (6 meses)"
                description={`Cenário base: MRR × (1 − churn de receita) + entrada média de ${fmtBrl(data.avg_monthly_inflow)}/mês dos últimos 3 meses.`}
              >
                <CountColumns unit="" format={fmtBrl} points={data.projection.map((p) => ({ key: p.month, label: p.label, value: p.mrr }))} />
                <View style={{ marginTop: 12 }}>
                  {data.projection.map((p, i) => (
                    <View key={p.month} className={`flex-row justify-between ${i > 0 ? "border-t border-border" : ""}`} style={{ paddingVertical: 6, gap: 12 }}>
                      <Text className="text-sm text-ink" style={{ flex: 1 }}>{p.label}</Text>
                      <Text className="text-sm font-mono text-ink" style={{ width: 120, textAlign: "right" }}>{fmtBrl(p.mrr)}</Text>
                      <Text className="text-xs font-mono text-ink-subtle" style={{ width: isMobile ? 120 : 200, textAlign: "right" }} numberOfLines={1}>{isMobile ? fmtBrl(p.mrr_without_churn) : `sem churn ${fmtBrl(p.mrr_without_churn)}`}</Text>
                    </View>
                  ))}
                </View>
              </Panel>
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 280 }}>
              <Panel title="Próximos 30 dias">
                <View style={{ gap: 12 }}>
                  <View>
                    <Text className="text-xs text-ink-muted">Renovações previstas</Text>
                    <Text className="text-lg font-semibold text-ink">{fmtBrl(data.renewals_30d.amount)}</Text>
                    <Text className="text-xs text-ink-subtle">{`${fmtInt(data.renewals_30d.count)} assinaturas vencem no período`}</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-ink-muted">Assinaturas pagantes</Text>
                    <Text className="text-lg font-semibold text-ink">{fmtInt(data.paying)}</Text>
                  </View>
                  <Text className="text-xs text-ink-subtle">
                    Projeções são estimativas lineares: com poucos meses de histórico, use como referência, não como meta.
                  </Text>
                </View>
              </Panel>
            </View>
          </View>

          <Panel title="Movimentações do MRR" description="Quanto cada tipo de movimento somou ou tirou do MRR por mês." flush>
            <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
              <View style={{ width: "100%", minWidth: isMobile ? 680 : undefined }}>
                <View className="flex-row bg-surface-sunken" style={{ paddingVertical: 8, paddingHorizontal: 24, gap: 12 }}>
                  <Text className="text-xs font-medium text-ink-muted" style={{ flex: 1 }}>Mês</Text>
                  {MOVEMENT_COLUMNS.map((c) => (
                    <Text key={c.key} className="text-xs font-medium text-ink-muted" style={{ flex: 1, textAlign: "right" }}>{c.label}</Text>
                  ))}
                </View>
                {data.movements.map((m) => (
                  <View key={m.month} className="flex-row border-t border-border" style={{ paddingVertical: 8, paddingHorizontal: 24, gap: 12 }}>
                    <Text className="text-sm text-ink" style={{ flex: 1 }}>{m.label}</Text>
                    {MOVEMENT_COLUMNS.map((c) => (
                      <Text
                        key={c.key}
                        className={`text-sm font-mono ${m[c.key] < 0 ? "text-danger" : "text-ink"} ${c.key === "net" ? "font-semibold" : ""}`}
                        style={{ flex: 1, textAlign: "right" }}
                      >
                        {m[c.key] === 0 ? "—" : fmtBrl(m[c.key])}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </Panel>
        </>
      )}
    </ScrollView>
  );
}
