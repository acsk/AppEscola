import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchHealth, fmtDateTime, fmtInt, HEALTH_LEVEL, type HealthReport, type TenantHealth } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Filter = "all" | TenantHealth["level"];

/**
 * Plataforma › Relatórios › Saúde e retenção: nota de 0 a 100 por instituição ativa, com os motivos de risco,
 * e retenção por mês de cadastro. Ajuda a agir antes do cancelamento.
 */
export default function SaasHealthScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [data, setData] = useState<HealthReport | null>(null);
  const [filter, setFilter] = useState<Filter>("risk");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchHealth());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a saúde das instituições."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => (data?.items ?? []).filter((i) => filter === "all" || i.level === filter), [data, filter]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Relatórios" }, { label: "Saúde e retenção" }]}
        title="Saúde e retenção"
        description="Nota de 0 a 100 por instituição ativa: atividade dos alunos, queda de uso, acesso da equipe, assinatura e integrações."
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
          <Tabs<Filter>
            accessibilityLabel="Filtrar por saúde"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "risk", label: "Risco", count: data.summary.risk },
              { id: "attention", label: "Atenção", count: data.summary.attention },
              { id: "healthy", label: "Saudáveis", count: data.summary.healthy },
              { id: "all", label: "Todas" },
            ]}
          />

          <View className="bg-surface border border-border rounded-ds-md">
            {items.length === 0 ? (
              <Text className="text-sm text-ink-subtle" style={{ padding: 32, textAlign: "center" }}>Nenhuma instituição neste grupo.</Text>
            ) : (
              items.map((item, i) => {
                const level = HEALTH_LEVEL[item.level];
                return (
                  <View key={item.tenant.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: isMobile ? "column" : "row", gap: 16 }}>
                    <View style={{ width: isMobile ? undefined : 92, flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "flex-start", gap: 6 }}>
                      <Text className="font-semibold text-ink font-mono" style={{ fontSize: 24, lineHeight: 28 }}>{item.score}</Text>
                      <Badge label={level.label} tone={level.tone} dot />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <TouchableOpacity onPress={() => navigate("tenants-detail", { tenantId: item.tenant.id })} role="link">
                        <Text className="text-sm font-medium text-brand">{item.tenant.name}</Text>
                      </TouchableOpacity>
                      <Text className="text-xs text-ink-subtle">{item.plan ? `Plano ${item.plan}` : "Sem assinatura"}</Text>
                      {item.reasons.length ? (
                        item.reasons.map((r) => (
                          <Text key={r} className="text-sm text-ink">{`• ${r}`}</Text>
                        ))
                      ) : (
                        <Text className="text-sm text-ink-muted">Nenhum sinal de risco.</Text>
                      )}
                    </View>
                    <View style={{ width: isMobile ? undefined : 240, gap: 2 }}>
                      <Text className="text-xs text-ink-muted">{`${fmtInt(item.active_students_14d)} alunos ativos em 14 dias`}</Text>
                      <Text className="text-xs text-ink-muted">{`${fmtInt(item.practice_answers_30d)} questões em 30 dias (antes ${fmtInt(item.practice_answers_prev_30d)})`}</Text>
                      <Text className="text-xs text-ink-muted">{`Equipe: ${item.last_staff_login_at ? fmtDateTime(item.last_staff_login_at) : "sem acesso registrado"}`}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <Panel title="Retenção por mês de cadastro" description="Instituições cadastradas em cada mês que continuam ativas e sem assinatura encerrada." flush>
            {data.cohorts.length === 0 ? (
              <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhuma instituição cadastrada nos últimos 12 meses.</Text>
            ) : (
              data.cohorts.map((c, i) => (
                <View key={c.month} className={`flex-row items-center ${i > 0 ? "border-t border-border" : ""}`} style={{ paddingHorizontal: 24, paddingVertical: 10, gap: 12 }}>
                  <Text className="text-sm text-ink" style={{ width: 70 }}>{c.label}</Text>
                  <View className="bg-surface-sunken" style={{ flex: 1, height: 8 }}>
                    <View style={{ height: 8, width: `${c.percent}%`, backgroundColor: color.brand }} />
                  </View>
                  <Text className="text-sm font-mono text-ink" style={{ width: 150, textAlign: "right" }}>{`${fmtInt(c.retained)} de ${fmtInt(c.created)} · ${c.percent.toLocaleString("pt-BR")}%`}</Text>
                </View>
              ))
            )}
          </Panel>
        </>
      )}
    </ScrollView>
  );
}
