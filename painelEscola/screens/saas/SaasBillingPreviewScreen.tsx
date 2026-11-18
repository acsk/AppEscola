import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ChevronRight, Search } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import Icon from "../../components/ui/Icon";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchBillingPreview, fmtBrl, type BillingPreview, type BillingPreviewRow } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
};

const FILTERS = [
  { value: "", label: "Todas" },
  { value: "charged", label: "Com cobrança" },
  { value: "uncharged", label: "Sem cobrança" },
];

function lineAmount(row: BillingPreviewRow, label: string): string | null {
  return row.lines.find((line) => line.label === label)?.amount ?? null;
}

function gestaoCell(row: BillingPreviewRow): string {
  const line = row.lines.find((item) => item.label === "Módulo gestão");
  if (!line || line.detail === "não contratado") return "—";
  if (line.detail === "contratado grátis" || Number(line.amount) === 0) return "Grátis";
  return fmtBrl(line.amount);
}

function toneFor(row: BillingPreviewRow): "success" | "warning" | "danger" | "neutral" | "brand" {
  if (row.status === "past_due") return "warning";
  if (row.status === "trialing") return "brand";
  if (row.status === "canceled" || row.status === "expired") return "danger";
  if (row.charged) return "success";
  return "neutral";
}

/** Plataforma › Comercial › Cobrança mensal: prévia do que cada instituição paga neste mês. */
export default function SaasBillingPreviewScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [data, setData] = useState<BillingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBillingPreview());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar a prévia de cobrança."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (filter === "charged" && !row.charged) return false;
      if (filter === "uncharged" && row.charged) return false;
      if (!query) return true;
      return row.tenant.name.toLowerCase().includes(query) || (row.plan ?? "").toLowerCase().includes(query);
    });
  }, [data, search, filter]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 16 }}>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Cobrança mensal" }]}
        title="Cobrança mensal por cliente"
        description="Quanto cada instituição paga neste mês e como o valor foi calculado."
      />

      {data ? (
        <View className="rounded-ds-md border border-border bg-surface px-4 py-3" style={{ gap: 6 }}>
          <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
            <Text className="text-sm text-ink-muted">Competência</Text>
            <Text className="text-sm font-mono text-ink">{data.competence}</Text>
            <Badge label="Prévia" tone="warning" dot />
            <Text className="text-xs text-ink-subtle">{`Uso medido até ${data.measured_at}`}</Text>
          </View>
          <Text className="text-xs text-ink-muted">{data.note}</Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {[
          ["Faturamento previsto", data ? fmtBrl(data.forecast) : "—", data ? `${data.billable_count} instituições` : ""],
          ["Ticket médio", data ? fmtBrl(data.average) : "—", "por instituição cobrada"],
          ["Sem cobrança", data ? String(data.uncharged_count) : "—", "teste, cancelada ou sem assinatura"],
        ].map(([label, value, hint]) => (
          <View key={label} className="rounded-ds-md border border-border bg-surface" style={{ flex: 1, minWidth: isMobile ? "100%" : 180, padding: 14, gap: 2 }}>
            <Text className="text-xs font-medium text-ink-muted">{label}</Text>
            <Text className="text-xl font-mono text-ink">{value}</Text>
            <Text className="text-xs text-ink-subtle">{hint}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <View className="flex-row items-center border border-border-strong rounded-ds-md bg-surface px-3" style={{ flex: 1, minWidth: 220, height: 38, gap: 8 }}>
          <Icon icon={Search} size={16} color={color["ink-subtle"]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Instituição ou plano"
            placeholderTextColor={color["ink-subtle"]}
            aria-label="Buscar instituição"
            style={{ flex: 1, fontSize: 14, color: color.ink }}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 220 }}>
          <FormSelect label="Situação" dense value={filter} options={FILTERS} onChange={setFilter} />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile}>
        <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 920 : undefined }}>
          <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
            <View style={{ width: 28 }} />
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.8, minWidth: 160 }}>Instituição</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 120 }}>Plano</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7, minWidth: 70, textAlign: "right" }}>Alunos</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 110, textAlign: "right" }}>App</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 100, textAlign: "right" }}>Gestão</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 110, textAlign: "right" }}>Valor do mês</Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 110, paddingLeft: 12 }}>Situação</Text>
          </View>
          {loading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={color.brand} />
            </View>
          ) : rows.length === 0 ? (
            <Text className="text-sm text-ink-muted" style={{ padding: 32, textAlign: "center" }}>Nenhuma instituição para o filtro escolhido.</Text>
          ) : (
            rows.map((row) => {
              const open = openId === row.tenant.id;
              return (
                <View key={row.tenant.id} className={open ? "bg-brand-tint" : ""}>
                  <Pressable
                    onPress={() => navigate("tenants-detail", { tenantId: row.tenant.id, tab: "subscription" })}
                    className="flex-row items-center border-b border-border"
                    style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir assinatura de ${row.tenant.name}`}
                  >
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setOpenId(open ? null : row.tenant.id);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={open ? "Ocultar memória de cálculo" : "Ver memória de cálculo"}
                      hitSlop={8}
                    >
                      <Icon icon={ChevronRight} size={16} color={color["ink-subtle"]} />
                    </Pressable>
                    <Text className="text-sm font-medium text-ink" style={{ flex: 1.8, minWidth: 160 }} numberOfLines={1}>{row.tenant.name}</Text>
                    <Text className="text-sm text-ink-muted" style={{ flex: 1.2, minWidth: 120 }} numberOfLines={1}>{row.plan ?? "—"}</Text>
                    <Text className="text-sm font-mono text-ink" style={{ flex: 0.7, minWidth: 70, textAlign: "right" }}>{row.app_students == null ? "—" : row.app_students.toLocaleString("pt-BR")}</Text>
                    <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 110, textAlign: "right" }}>{fmtBrl(lineAmount(row, "Acesso ao app") ?? lineAmount(row, "Plano"))}</Text>
                    <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 100, textAlign: "right" }}>{gestaoCell(row)}</Text>
                    <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 110, textAlign: "right" }}>{fmtBrl(row.total)}</Text>
                    <View style={{ flex: 1, minWidth: 120, paddingLeft: 16 }}>
                      <Badge label={row.status_label} tone={toneFor(row)} />
                    </View>
                  </Pressable>
                  {open ? (
                    <View className="border-b border-border bg-surface" style={{ padding: 16, gap: 8, marginLeft: 28 }}>
                      {row.lines.map((line) => (
                        <View key={line.label} className="flex-row items-start justify-between" style={{ gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text className="text-sm text-ink">{line.label}</Text>
                            <Text className="text-xs font-mono text-ink-subtle">{line.detail}</Text>
                          </View>
                          <Text className="text-sm font-mono text-ink">{fmtBrl(line.amount)}</Text>
                        </View>
                      ))}
                      <Text className="text-xs font-semibold text-ink-muted">Memória de cálculo</Text>
                      <View className="flex-row justify-between border-t border-border" style={{ paddingTop: 8 }}>
                        <Text className="text-sm font-semibold text-ink">Valor da fatura</Text>
                        <Text className="text-sm font-mono font-semibold text-ink">{fmtBrl(row.total)}</Text>
                      </View>
                      <Button size="sm" variant="ghost" label="Abrir assinatura" onPress={() => navigate("tenants-detail", { tenantId: row.tenant.id, tab: "subscription" })} style={{ alignSelf: "flex-start" }} />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
