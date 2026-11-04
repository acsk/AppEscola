import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Check, Lock, Minus, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import CatalogEditor from "../../components/finance/settings/CatalogEditor";
import { PAYMENT_METHOD_LABELS, fmtMoney } from "../../components/financeiro/format";
import { fmtDateTime } from "../../components/finance/cora/coraEvents";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchFinanceSettings, type FinanceRole, type FinanceSettings } from "../../services/financeSettings";
import { fetchCoraIntegrationOverview, type CoraIntegrationOverview } from "../../services/coraIntegration";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type SectionId = "cora" | "billing" | "fees" | "reconciliation" | "catalog" | "routines" | "permissions";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "cora", label: "Integração Cora" },
  { id: "billing", label: "Cobrança e formas de pagamento" },
  { id: "fees", label: "Juros, multa e descontos" },
  { id: "reconciliation", label: "Conciliação automática" },
  { id: "catalog", label: "Categorias e centros de custo" },
  { id: "routines", label: "Rotinas automáticas" },
  { id: "permissions", label: "Permissões" },
];

/** Classes escritas por inteiro para o NativeWind gerá-las. */
const TONE_CLASS = { success: "text-success", danger: "text-danger", warning: "text-warning" } as const;

const ROLE_LABEL: Record<FinanceRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Gestor",
  financial: "Financeiro",
  secretaria: "Secretaria",
  coordenador: "Coordenação",
  professor: "Professor",
};

/**
 * Financeiro › Configurações financeiras: mostra o que está configurado e leva às telas onde cada coisa é
 * editada (credenciais, regras de cobrança). Edita aqui só categorias e centros de custo. Nenhum segredo aparece.
 */
export default function FinanceSettingsScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [cora, setCora] = useState<CoraIntegrationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const scroll = useRef<ScrollView | null>(null);
  const offsets = useRef<Partial<Record<SectionId, number>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, c] = await Promise.all([fetchFinanceSettings(), fetchCoraIntegrationOverview().catch(() => null)]);
      setSettings(s);
      setCora(c);
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as configurações financeiras."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goTo = (id: SectionId) => scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[id] ?? 0) - 8), animated: true });

  const section = (id: SectionId, title: string, subtitle: string, children: React.ReactNode, actions?: React.ReactNode) => (
    <View
      key={id}
      onLayout={(e) => {
        offsets.current[id] = e.nativeEvent.layout.y;
      }}
      className="bg-surface border border-border rounded-ds-md"
    >
      <View className="flex-row flex-wrap items-start border-b border-border" style={{ padding: 20, gap: 12 }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text className="text-base font-semibold text-ink">{title}</Text>
          <Text className="text-sm text-ink-muted">{subtitle}</Text>
        </View>
        {actions}
      </View>
      <View style={{ padding: 20, gap: 12 }}>{children}</View>
    </View>
  );

  const cell = (label: string, value: string, tone?: "success" | "danger" | "warning") => (
    <View key={label} className="border border-border" style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : 180, padding: 12, gap: 2 }}>
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className={`text-sm font-mono ${tone ? TONE_CLASS[tone] : "text-ink"}`}>{value}</Text>
    </View>
  );

  const env = settings?.environment ?? "prod";
  const coraEnv = cora?.environments?.[env];

  const content = settings ? (
    <View style={{ gap: 16, flex: 1, minWidth: 0 }}>
      {section(
        "cora",
        "Integração Cora",
        "Credenciais ficam só no servidor e nunca são exibidas.",
        <>
          <View className="flex-row flex-wrap">
            {cell("Ambiente", env === "prod" ? "Produção" : "Homologação")}
            {cell(
              "Credenciais",
              coraEnv ? (coraEnv.credentials.configured ? (coraEnv.credentials.active ? "Ativas" : "Inativas") : "Não configuradas") : "—",
              coraEnv?.credentials.active ? "success" : "warning"
            )}
            {cell("Webhook", coraEnv ? (coraEnv.webhook.registered ? "Assinado" : "Não assinado") : "—", coraEnv?.webhook.registered ? "success" : "warning")}
            {cell(
              "Último extrato",
              settings.statement.last_sync ? `${fmtDateTime(settings.statement.last_sync.finished_at)}${settings.statement.last_sync.status === "failed" ? " · falhou" : ""}` : "Nunca sincronizado",
              settings.statement.last_sync?.status === "failed" ? "danger" : undefined
            )}
            {cell("Saldo na Cora", settings.statement.bank_balance ? fmtMoney(settings.statement.bank_balance.amount) : "Não informado")}
          </View>
          {settings.statement.last_sync?.error ? <Text className="text-sm text-danger">{settings.statement.last_sync.error}</Text> : null}
          <Text className="text-xs text-ink-muted">
            {settings.operating_since
              ? `Conciliação a partir de ${settings.operating_since.split("-").reverse().join("/")}, data da primeira cobrança Cora gerada pelo sistema.`
              : "Nenhuma cobrança Cora gerada pelo sistema ainda; não há o que conciliar."}
          </Text>
        </>,
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Button label="Avisos e webhook" onPress={() => navigate("financeiro-cora")} />
          <Button label="Credenciais" onPress={() => navigate("pagamentos")} />
        </View>
      )}

      {section(
        "billing",
        "Cobrança e formas de pagamento",
        "Regras usadas ao gerar cobranças das matrículas.",
        <View className="flex-row flex-wrap">
          {cell("Vencimento padrão", settings.billing.default_payment_due_day ? `Dia ${settings.billing.default_payment_due_day}` : "—")}
          {cell("Provedor padrão", settings.billing.default_provider ? settings.billing.default_provider.toUpperCase() : "—")}
          {cell("Forma padrão", settings.billing.default_method ? PAYMENT_METHOD_LABELS[settings.billing.default_method] ?? settings.billing.default_method : "—")}
          {cell("Formas aceitas", settings.billing.enabled_methods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join(", ") || "—")}
          {cell("Sincronizar com o provedor", settings.billing.auto_sync_charges ? "Sim" : "Não")}
        </View>,
        <Button label="Editar regras de cobrança" onPress={() => navigate("configuracoes-cobranca")} />
      )}

      {section(
        "fees",
        "Juros, multa e descontos",
        "O que é enviado à Cora junto com o boleto.",
        <View className="border border-border bg-surface-sunken px-3 py-3" style={{ borderLeftWidth: 3, borderLeftColor: color.warning }}>
          <Text className="text-sm text-ink">
            <Text className="font-semibold">Não configurado. </Text>
            Hoje os boletos são emitidos sem multa por atraso, juros de mora ou desconto de pontualidade. Ativar muda o valor das cobranças reais e será
            feito numa etapa própria, com confirmação.
          </Text>
        </View>
      )}

      {section(
        "reconciliation",
        "Conciliação automática",
        "Regras de segurança fixas: não podem ser desligadas.",
        settings.reconciliation_rules.map((rule) => (
          <View key={rule.key} className="flex-row items-start" style={{ gap: 10 }}>
            <View className="items-center justify-center bg-surface-sunken border border-border-strong rounded-ds-sm" style={{ width: 18, height: 18, marginTop: 1 }}>
              <Check size={12} color={color["ink-muted"]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-sm text-ink">{rule.label}</Text>
              <Text className="text-xs text-ink-muted">{rule.description}</Text>
            </View>
            <Lock size={14} color={color["ink-subtle"]} aria-label="Obrigatório" />
          </View>
        ))
      )}

      {section(
        "catalog",
        "Categorias e centros de custo",
        settings.can_configure ? "Usados em Contas a pagar e nos filtros do Fluxo de caixa." : "Somente administradores podem alterar.",
        <View className="flex-row flex-wrap" style={{ gap: 24 }}>
          <CatalogEditor kind="categories" title="Categorias" canConfigure={settings.can_configure} />
          <CatalogEditor kind="cost-centers" title="Centros de custo" canConfigure={settings.can_configure} />
        </View>
      )}

      {section(
        "routines",
        "Rotinas automáticas",
        "Executadas pelo servidor, em horário de Brasília.",
        settings.routines.map((r) => (
          <View key={r.key} className="flex-row justify-between border-b border-border" style={{ paddingVertical: 6, gap: 12 }}>
            <Text className="text-sm text-ink" style={{ flex: 1 }}>{r.label}</Text>
            <Text className="text-sm font-mono text-ink-muted">{r.schedule}</Text>
          </View>
        ))
      )}

      {section(
        "permissions",
        "Permissões financeiras",
        "Definidas pelo sistema para cada perfil; toda ação sensível fica na auditoria.",
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
          <View className="border border-border" style={{ minWidth: 820, width: "100%" }}>
            <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text className="text-xs font-semibold text-ink-muted" style={{ flex: 2.4 }}>Permissão</Text>
              {(Object.keys(ROLE_LABEL) as FinanceRole[]).map((role) => (
                <Text key={role} className="text-xs font-semibold text-ink-muted" style={{ flex: 1, textAlign: "center" }}>
                  {ROLE_LABEL[role]}
                </Text>
              ))}
            </View>
            {settings.permissions.map((row, i) => (
              <View key={row.ability} className={`flex-row ${i > 0 ? "border-t border-border" : ""}`} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                <Text className="text-sm text-ink" style={{ flex: 2.4 }}>{row.label}</Text>
                {(Object.keys(ROLE_LABEL) as FinanceRole[]).map((role) => (
                  <View key={role} style={{ flex: 1, alignItems: "center" }} aria-label={`${ROLE_LABEL[role]}: ${row.roles[role] ? "sim" : "não"}`}>
                    {row.roles[role] ? <Check size={14} color={color.success} /> : <Minus size={14} color={color["ink-subtle"]} />}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  ) : null;

  return (
    <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Configurações financeiras" }]}
        title="Configurações financeiras"
        description="Integração bancária, regras de cobrança, conciliação e permissões."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      {loading && !settings ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : isMobile ? (
        content
      ) : (
        <View className="flex-row items-start" style={{ gap: 24 }}>
          <View className="bg-surface border border-border rounded-ds-md" style={{ width: 230 }}>
            {SECTIONS.map((s, i) => (
              <Pressable key={s.id} onPress={() => goTo(s.id)} accessibilityRole="link" className={i > 0 ? "border-t border-border" : ""} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text className="text-sm text-ink">{s.label}</Text>
              </Pressable>
            ))}
          </View>
          {content}
        </View>
      )}
    </ScrollView>
  );
}
