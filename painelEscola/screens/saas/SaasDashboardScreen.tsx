import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Plus, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import FormSelect from "../../components/ui/FormSelect";
import StatTile from "../../components/ui/StatTile";
import Badge from "../../components/ui/Badge";
import DataTableRow from "../../components/ui/DataTableRow";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import CountColumns from "../../components/saas/CountColumns";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchSaasDashboard, fmtBrl, fmtInt, TENANT_STATUS_LABEL, tenantStatusTone, type SaasDashboard } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const PERIOD_OPTIONS = [
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
  { value: "24", label: "Últimos 24 meses" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "inactive", label: "Inativo" },
];

/**
 * Plataforma › Visão geral: indicadores operacionais de todos os tenants. Receita SaaS (MRR, ARR, churn)
 * entra quando houver assinaturas da plataforma; a receita das mensalidades escolares nunca entra aqui.
 */
export default function SaasDashboardScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [months, setMonths] = useState("12");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<SaasDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchSaasDashboard(Number(months), status));
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os indicadores da plataforma."));
    } finally {
      setLoading(false);
    }
  }, [months, status]);

  useEffect(() => {
    load();
  }, [load]);

  const delta = data ? data.tenants.new_this_month - data.tenants.new_last_month : 0;
  const statusTotal = Math.max(1, data?.tenants.total ?? 0);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        title="Visão geral da plataforma"
        description="Crescimento, uso e saúde de todas as instituições."
        actions={
          <>
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
            <Button variant="primary" icon={Plus} label="Nova instituição" onPress={() => navigate("tenants-form", { tenantId: null })} />
          </>
        }
      />

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220, maxWidth: isMobile ? undefined : 280 }}>
          <FormSelect label="Período" value={months} options={PERIOD_OPTIONS} onChange={setMonths} dense />
        </View>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220, maxWidth: isMobile ? undefined : 280 }}>
          <FormSelect label="Status do tenant" value={status} options={STATUS_OPTIONS} onChange={setStatus} dense />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      {loading && !data ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : data ? (
        <>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {[
              <StatTile key="t" label="Tenants" value={fmtInt(data.tenants.total)} hint={`${fmtInt(data.tenants.active)} ativos · ${fmtInt(data.tenants.suspended)} suspensos`} />,
              <StatTile
                key="n"
                label="Novos no mês"
                value={fmtInt(data.tenants.new_this_month)}
                delta={delta ? String(Math.abs(delta)) : null}
                trend={delta > 0 ? "up" : delta < 0 ? "down" : null}
                hint="vs. mês anterior"
              />,
              <StatTile key="s" label="Alunos cadastrados" value={fmtInt(data.students_total)} hint={`${fmtInt(data.users_active)} usuários ativos`} />,
              <StatTile key="q" label="Questões respondidas" value={fmtInt(data.practice_answers)} hint={`${fmtInt(data.exam_attempts)} simulados no período`} />,
            ].map((tile, i) => (
              <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
                {tile}
              </View>
            ))}
          </View>

          <Panel
            title="Receita SaaS"
            description={`Assinaturas da plataforma (não inclui mensalidades das escolas). ${fmtInt(data.revenue.legacy_tenants)} instituições sem assinatura.`}
            actions={<Button size="sm" label="Assinaturas" onPress={() => navigate("saas-subscriptions")} />}
          >
            <View style={{ gap: 20 }}>
              <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                {[
                  <StatTile key="mrr" label="MRR" value={fmtBrl(data.revenue.mrr)} hint={`${fmtInt(data.revenue.active_subscriptions)} assinaturas pagantes`} />,
                  <StatTile key="arr" label="ARR estimado" value={fmtBrl(data.revenue.arr)} hint="MRR × 12" />,
                  <StatTile key="arpa" label="Receita média por tenant" value={fmtBrl(data.revenue.arpa)} hint={`${fmtInt(data.revenue.trialing)} em teste · ${fmtInt(data.revenue.past_due)} em atraso`} />,
                  <StatTile key="churn" label="Cancelamento no mês" value={`${data.revenue.churn_rate.toLocaleString("pt-BR")}%`} hint={`${fmtInt(data.revenue.canceled_this_month)} cancelamentos`} />,
                ].map((tile, i) => (
                  <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
                    {tile}
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap" style={{ gap: 24 }}>
                <View style={{ flex: 2, minWidth: isMobile ? "100%" : 380, gap: 8 }}>
                  <Text className="text-sm font-medium text-ink">Evolução do MRR</Text>
                  <CountColumns unit="" format={fmtBrl} points={data.revenue.mrr_months.map((m) => ({ key: m.month, label: m.label, value: m.mrr }))} />
                  <Text className="text-xs text-ink-subtle">Estimativa com o valor atual de cada assinatura.</Text>
                </View>
                <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240, gap: 8 }}>
                  <Text className="text-sm font-medium text-ink">Por plano</Text>
                  {data.revenue.by_plan.length === 0 ? (
                    <Text className="text-sm text-ink-muted">Nenhuma assinatura contratada.</Text>
                  ) : (
                    data.revenue.by_plan.map((p) => (
                      <View key={p.plan} className="flex-row justify-between border-b border-border" style={{ paddingVertical: 8, gap: 8 }}>
                        <Text className="text-sm text-ink" style={{ flex: 1 }} numberOfLines={1}>{`${p.plan} (${p.tenants})`}</Text>
                        <Text className="text-sm font-mono text-ink">{fmtBrl(p.mrr)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          </Panel>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 380 }}>
              <Panel title="Novos tenants por mês" description={`${fmtInt(data.months.reduce((s, m) => s + m.new_tenants, 0))} no período`}>
                <CountColumns unit="tenants" points={data.months.map((m) => ({ key: m.month, label: m.label, value: m.new_tenants }))} />
              </Panel>
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 380 }}>
              <Panel title="Novos alunos por mês" description={`${fmtInt(data.months.at(-1)?.total_students ?? 0)} alunos ao fim do período`}>
                <CountColumns unit="alunos" points={data.months.map((m) => ({ key: m.month, label: m.label, value: m.new_students }))} />
              </Panel>
            </View>
          </View>

          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 280, maxWidth: isMobile ? undefined : 380 }}>
              <Panel title="Tenants por status">
                <View style={{ gap: 12 }}>
                  {data.by_status.length === 0 ? (
                    <Text className="text-sm text-ink-muted">Nenhum tenant cadastrado.</Text>
                  ) : (
                    data.by_status.map((s) => (
                      <View key={s.status} style={{ gap: 4 }}>
                        <View className="flex-row justify-between">
                          <Text className="text-sm text-ink">{TENANT_STATUS_LABEL[s.status] ?? s.status}</Text>
                          <Text className="text-sm font-mono text-ink">{`${fmtInt(s.total)} · ${Math.round((s.total / statusTotal) * 100)}%`}</Text>
                        </View>
                        <View className="bg-surface-sunken" style={{ height: 8 }}>
                          <View style={{ height: 8, width: `${(s.total / statusTotal) * 100}%`, backgroundColor: color.brand }} />
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </Panel>
            </View>

            <View style={{ flex: 2, minWidth: isMobile ? "100%" : 420 }}>
              <Panel title="Maiores tenants" description="Por alunos cadastrados; questões respondidas no período." flush>
                <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
                  <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 560 : undefined, borderWidth: 0 }}>
                    <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                      <Text className={TABLE_HEADER_CELL} style={{ flex: 2.4, minWidth: 160 }}>Instituição</Text>
                      <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 80 }}>Status</Text>
                      <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 70, textAlign: "right" }}>Alunos</Text>
                      <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 70, textAlign: "right" }}>Usuários</Text>
                      <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 90, textAlign: "right" }}>Questões</Text>
                    </View>
                    {data.top_tenants.length === 0 ? (
                      <Text className="text-sm text-ink-muted" style={{ padding: 24 }}>Nenhum tenant para o filtro escolhido.</Text>
                    ) : (
                      data.top_tenants.map((t, i) => (
                        <DataTableRow key={t.id} index={i}>
                          <TouchableOpacity style={{ flex: 2.4, minWidth: 160 }} onPress={() => navigate("tenants-detail", { tenantId: t.id })} role="link">
                            <Text className="text-sm font-medium text-brand" numberOfLines={1}>{t.name}</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1, minWidth: 80 }}>
                            <Badge label={TENANT_STATUS_LABEL[t.status] ?? t.status} tone={tenantStatusTone(t.status)} />
                          </View>
                          <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 70, textAlign: "right" }}>{fmtInt(t.students)}</Text>
                          <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 70, textAlign: "right" }}>{fmtInt(t.users)}</Text>
                          <Text className="text-sm font-mono text-ink" style={{ flex: 1.2, minWidth: 90, textAlign: "right" }}>{fmtInt(t.practice_answers)}</Text>
                        </DataTableRow>
                      ))
                    )}
                  </View>
                </ScrollView>
              </Panel>
            </View>
          </View>

          <Text className="text-xs text-ink-subtle">
            Indicadores atualizados a cada 5 minutos.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}
