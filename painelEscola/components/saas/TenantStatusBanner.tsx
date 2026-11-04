import React from "react";
import { Text, View } from "react-native";
import { CircleAlert, Lock } from "lucide-react-native";
import Icon from "../ui/Icon";
import { color } from "../../constants/theme";
import { fmtInt, type TenantEntitlements } from "../../services/saas";

/**
 * Aviso no topo do painel do tenant: instituição suspensa (somente leitura) e limites do plano
 * acima de 80%. Super admin fora de um tenant não vê.
 */
export default function TenantStatusBanner({ entitlements }: { entitlements: TenantEntitlements | null }) {
  if (!entitlements) return null;
  const suspended = entitlements.tenant_status === "suspended";
  const alerts = entitlements.quota_alerts ?? [];
  if (!suspended && alerts.length === 0) return null;

  const reached = alerts.some((a) => a.level === "reached");
  const quotaText = alerts
    .map((a) => (a.level === "reached" ? `${a.label}: limite atingido (${fmtInt(a.usage)} de ${fmtInt(a.limit ?? 0)})` : `${a.label}: ${a.percent?.toLocaleString("pt-BR")}% do limite`))
    .join(" · ");

  return (
    <View role="status" style={{ gap: 0 }}>
      {suspended ? (
        <View className="flex-row items-start bg-danger-tint border-b border-danger" style={{ paddingHorizontal: 24, paddingVertical: 10, gap: 10 }}>
          <Icon icon={Lock} color={color.danger} />
          <Text className="text-sm text-danger" style={{ flex: 1 }}>
            Instituição suspensa: o painel está em modo somente leitura (sem incluir, editar ou excluir) e alunos e responsáveis estão sem acesso ao app. Fale com o suporte para reativar.
          </Text>
        </View>
      ) : null}
      {alerts.length ? (
        <View className={`flex-row items-start border-b ${reached ? "bg-danger-tint border-danger" : "bg-warning-tint border-warning"}`} style={{ paddingHorizontal: 24, paddingVertical: 10, gap: 10 }}>
          <Icon icon={CircleAlert} color={reached ? color.danger : color.warning} />
          <Text className={`text-sm ${reached ? "text-danger" : "text-warning"}`} style={{ flex: 1 }}>
            {`Limites do plano — ${quotaText}. ${reached ? "Novos cadastros desse tipo estão bloqueados; os dados existentes continuam disponíveis." : "Fale com o suporte para ampliar antes de atingir o limite."}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
