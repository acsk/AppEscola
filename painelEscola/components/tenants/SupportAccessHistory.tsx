import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Panel from "../ui/Panel";
import Badge from "../ui/Badge";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { durationLabel, fetchSupportAccessHistory, type SupportAccessHistoryItem } from "../../services/supportAccess";

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Últimos acessos de suporte: quem, onde, por quê, quanto tempo e quantas alterações fez. `tenantId` limita a uma instituição. */
export default function SupportAccessHistory({ tenantId }: { tenantId?: number } = {}) {
  const { isMobile } = useResponsiveLayout();
  const [items, setItems] = useState<SupportAccessHistoryItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchSupportAccessHistory(tenantId)
      .then(setItems)
      .catch(() => setError(true));
  }, [tenantId]);

  return (
    <View style={{ marginTop: tenantId ? 0 : 24 }}>
      <Panel title="Acessos de suporte" description="Registro dos acessos de super admin às instituições, com motivo, duração e alterações feitas." flush>
        {items === null && !error ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <ActivityIndicator color={color.brand} />
          </View>
        ) : error ? (
          <Text className="text-sm text-danger" style={{ padding: 16 }}>Não foi possível carregar o histórico de acessos.</Text>
        ) : !items?.length ? (
          <Text className="text-sm text-ink-subtle" style={{ padding: 24, textAlign: "center" }}>Nenhum acesso registrado.</Text>
        ) : (
          items.map((item, index) => (
            <View
              key={item.id}
              className={index < items.length - 1 ? "border-b border-border" : ""}
              style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 16 }}
            >
              <View style={{ flex: 1.4, minWidth: 0, gap: 2 }}>
                <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{item.tenant.name ?? `Tenant #${item.tenant.id}`}</Text>
                <Text className="text-xs text-ink-muted" numberOfLines={1}>{item.user.name ?? "—"}</Text>
              </View>
              <View style={{ flex: 2, minWidth: 0, gap: 2 }}>
                <Text className="text-sm text-ink" numberOfLines={1}>{item.reason ?? "—"}</Text>
                {item.details ? <Text className="text-xs text-ink-muted" numberOfLines={2}>{item.details}</Text> : null}
              </View>
              <View style={{ flex: 1.3, minWidth: 0, gap: 2 }}>
                <Text className="text-xs font-mono text-ink">{fmtDateTime(item.started_at)}</Text>
                <Text className="text-xs text-ink-muted">
                  {item.active ? `${durationLabel(item.duration_minutes)} · até ${fmtDateTime(item.expires_at)}` : `${durationLabel(item.duration_minutes)} · fim ${fmtDateTime(item.ended_at)}`}
                </Text>
              </View>
              <View style={{ width: isMobile ? undefined : 150, alignItems: isMobile ? "flex-start" : "flex-end", gap: 4 }}>
                <Badge label={item.active ? "Em andamento" : "Encerrado"} tone={item.active ? "warning" : "neutral"} dot />
                <Text className="text-xs text-ink-muted">
                  {item.actions_count === 1 ? "1 alteração" : `${item.actions_count} alterações`}
                </Text>
              </View>
            </View>
          ))
        )}
      </Panel>
    </View>
  );
}
