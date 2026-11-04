import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import StatTile from "../../components/ui/StatTile";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchMonitoring, fmtDateTime, fmtInt, type Monitoring } from "../../services/saas";

const STATUS_LABEL: Record<string, string> = {
  success: "ok",
  processed: "processados",
  done: "concluídos",
  failed: "falhas",
  pending: "pendentes",
  processing: "processando",
  running: "em andamento",
  ignored: "ignorados",
  needs_review: "para revisar",
};

/** Plataforma › Monitoramento › Saúde da plataforma: API, filas, integrações e incidentes (métricas agregadas, cache de 1 min). */
export default function SaasMonitoringScreen() {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchMonitoring());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o monitoramento."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Monitoramento" }, { label: "Saúde da plataforma" }]}
        title="Saúde da plataforma"
        description={data ? `Verificado em ${fmtDateTime(data.checked_at)} · atualiza a cada minuto.` : "API, filas, integrações e incidentes recentes."}
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
              <StatTile key="api" label="API" value={data.api.status === "ok" ? "No ar" : "Fora do ar"} hint={`v${data.api.version} · ${data.api.environment} · PHP ${data.api.php}`} />,
              <StatTile key="db" label="Resposta do banco" value={data.api.database_ms == null ? "—" : data.api.database_ms.toLocaleString("pt-BR")} unit={data.api.database_ms == null ? undefined : " ms"} hint="consulta de verificação" />,
              <StatTile
                key="q"
                label="Jobs pendentes"
                value={data.queue.pending == null ? "—" : fmtInt(data.queue.pending)}
                hint={data.queue.oldest_pending_minutes != null ? `mais antigo há ${data.queue.oldest_pending_minutes} min` : `fila: ${data.queue.driver}`}
              />,
              <StatTile key="f" label="Jobs com falha (24 h)" value={fmtInt(data.queue.failed_24h)} hint={`${fmtInt(data.queue.failed_total)} no total`} />,
            ].map((tile, i) => (
              <View key={i} style={{ flexBasis: isMobile ? "100%" : 200, flexGrow: 1 }}>
                {tile}
              </View>
            ))}
          </View>

          <Panel title="Integrações" description="Últimos 7 dias, somando todas as instituições." flush>
            {data.integrations.map((item, i) => {
              const total = Object.values(item.counts).reduce((s, v) => s + v, 0);
              return (
                <View key={item.key} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "flex-start" : "center" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text className="text-sm font-medium text-ink">{item.name}</Text>
                    <Text className="text-xs text-ink-muted">
                      {total === 0
                        ? "Sem movimento no período."
                        : Object.entries(item.counts).map(([status, n]) => `${fmtInt(n)} ${STATUS_LABEL[status] ?? status}`).join(" · ")}
                      {item.last_success_at ? ` · último sucesso ${fmtDateTime(item.last_success_at)}` : ""}
                    </Text>
                  </View>
                  <Badge label={total === 0 ? "Sem uso" : item.failed ? `${fmtInt(item.failed)} falhas` : "Normal"} tone={total === 0 ? "neutral" : item.failed ? "danger" : "success"} dot />
                </View>
              );
            })}
          </Panel>

          <Panel title="Erros e incidentes recentes" description="Jobs com falha e falhas de integração dos últimos 7 dias (só a primeira linha do erro)." flush>
            {data.incidents.length === 0 ? (
              <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhum incidente nos últimos 7 dias.</Text>
            ) : (
              data.incidents.map((incident, i) => (
                <View key={`${incident.at}-${i}`} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 4 : 16 }}>
                  <Text className="text-xs font-mono text-ink-muted" style={{ width: isMobile ? undefined : 130 }}>{fmtDateTime(incident.at)}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text className="text-sm text-ink">{incident.title}</Text>
                    {incident.detail ? <Text className="text-xs font-mono text-ink-muted" numberOfLines={2}>{incident.detail}</Text> : null}
                  </View>
                  <Text className="text-xs text-ink-muted" style={{ width: isMobile ? undefined : 200, textAlign: isMobile ? "left" : "right" }}>
                    {[incident.source, incident.tenant].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ))
            )}
          </Panel>
        </>
      )}
    </ScrollView>
  );
}
