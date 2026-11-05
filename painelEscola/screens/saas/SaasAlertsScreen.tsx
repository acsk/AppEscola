import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import ToastBanner from "../../components/ui/ToastBanner";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { acknowledgeAlert, ALERT_SEVERITY, fetchAlerts, fmtDateTime, runAlerts, type SaasAlertItem } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type StatusTab = "active" | "resolved";

/**
 * Plataforma › Monitoramento › Alertas: problemas operacionais e comerciais avaliados de hora em hora.
 * Reconhecer só indica que alguém está cuidando; o alerta some sozinho quando o problema para de acontecer.
 */
export default function SaasAlertsScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [tab, setTab] = useState<StatusTab>("active");
  const [items, setItems] = useState<SaasAlertItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [emailsEnabled, setEmailsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAlerts(tab);
      setItems(data.items);
      setCounts(data.counts ?? {});
      setEmailsEnabled(data.emails_enabled);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os alertas."));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const reevaluate = async () => {
    setRunning(true);
    try {
      const { data } = await runAlerts();
      showApiToast(setToast, data, "Alertas reavaliados.");
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível reavaliar os alertas.");
    } finally {
      setRunning(false);
    }
  };

  const acknowledge = async (alert: SaasAlertItem) => {
    try {
      const { data } = await acknowledgeAlert(alert.id);
      showApiToast(setToast, data, "Alerta reconhecido.");
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível reconhecer o alerta.");
    }
  };

  const activeTotal = (counts.critical ?? 0) + (counts.warning ?? 0) + (counts.info ?? 0);

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
        <PageHeader
          breadcrumb={[{ label: "Monitoramento" }, { label: "Alertas" }]}
          title="Alertas"
          description={`Filas, integrações, IA, assinaturas e limites, avaliados de hora em hora. ${emailsEnabled ? "Críticos e de atenção vão por e-mail aos administradores globais." : "Envio por e-mail desligado (SAAS_ALERT_EMAILS)."}`}
          actions={<Button icon={RefreshCw} label="Reavaliar agora" onPress={reevaluate} loading={running} />}
        />

        <Tabs<StatusTab>
          accessibilityLabel="Situação dos alertas"
          value={tab}
          onChange={setTab}
          items={[
            { id: "active", label: "Ativos", count: activeTotal, alert: counts.critical ? `${counts.critical} críticos` : null },
            { id: "resolved", label: "Resolvidos" },
          ]}
        />

        {error ? (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
            <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
            <Button size="sm" label="Tentar novamente" onPress={load} />
          </View>
        ) : null}

        <View className="bg-surface border border-border rounded-ds-md">
          {loading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={color.brand} />
            </View>
          ) : items.length === 0 ? (
            <Text className="text-sm text-ink-subtle" style={{ padding: 32, textAlign: "center" }}>
              {tab === "active" ? "Nenhum alerta ativo. Tudo funcionando." : "Nenhum alerta resolvido ainda."}
            </Text>
          ) : (
            items.map((a, i) => {
              const sev = ALERT_SEVERITY[a.severity];
              return (
                <View key={a.id} className={i > 0 ? "border-t border-border" : ""} style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "stretch" : "center" }}>
                  <View style={{ width: isMobile ? undefined : 110 }}>
                    <Badge label={sev.label} tone={sev.tone} dot />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text className="text-sm font-medium text-ink">{a.title}</Text>
                    {a.detail ? <Text className="text-xs text-ink-muted" numberOfLines={2}>{a.detail}</Text> : null}
                    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                      {a.tenant ? (
                        <TouchableOpacity onPress={() => navigate("tenants-detail", { tenantId: a.tenant!.id })} role="link">
                          <Text className="text-xs font-medium text-brand">{a.tenant.name}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <Text className="text-xs font-mono text-ink-subtle">
                        {a.status === "resolved"
                          ? `Resolvido em ${fmtDateTime(a.resolved_at)}`
                          : `Desde ${fmtDateTime(a.first_seen_at)} · ${a.occurrences} verificação(ões)`}
                      </Text>
                      {a.acknowledged_by ? <Text className="text-xs text-ink-subtle">{`Reconhecido por ${a.acknowledged_by}`}</Text> : null}
                    </View>
                  </View>
                  {a.status === "open" ? <Button size="sm" label="Reconhecer" onPress={() => acknowledge(a)} /> : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />
    </>
  );
}
