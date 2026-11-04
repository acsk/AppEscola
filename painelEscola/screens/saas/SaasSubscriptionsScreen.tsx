import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import Icon from "../../components/ui/Icon";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { cycleLabel, fetchPlans, fetchSubscriptions, fmtBrl, fmtIsoDate, SUBSCRIPTION_STATUS, type Subscription } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Row = { tenant: { id: number; name: string; status: string }; subscription: Subscription | null };

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "trialing", label: "Em teste" },
  { value: "active", label: "Ativa" },
  { value: "past_due", label: "Em atraso" },
  { value: "canceled", label: "Cancelada" },
  { value: "expired", label: "Expirada" },
  { value: "legacy", label: "Sem assinatura" },
];

/** Plataforma › Comercial › Assinaturas: situação comercial de todas as instituições. */
export default function SaasSubscriptionsScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [planOptions, setPlanOptions] = useState([{ value: "", label: "Todos os planos" }]);
  const [status, setStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPlans()
      .then((data) => setPlanOptions([{ value: "", label: "Todos os planos" }, ...data.plans.map((p) => ({ value: String(p.id), label: p.name }))]))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSubscriptions({ status: status || undefined, plan_id: planId || undefined, search: search.trim() || undefined, page });
      setRows(data.items);
      setMeta(data.meta);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar as assinaturas."));
    } finally {
      setLoading(false);
    }
  }, [status, planId, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const nextDate = (s: Subscription) => (s.status === "trialing" ? `Teste até ${fmtIsoDate(s.trial_ends_at)}` : fmtIsoDate(s.current_period_end));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader breadcrumb={[{ label: "Comercial" }, { label: "Assinaturas" }]} title="Assinaturas" description="Plano, ciclo, valor e vencimento de cada instituição. Abra a instituição para contratar ou alterar." />

      <View className="flex-row flex-wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <View className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3 mb-2" style={{ height: 32, flex: 1, minWidth: isMobile ? "100%" : 240, maxWidth: isMobile ? undefined : 360, gap: 8 }}>
          <Icon icon={Search} color={color["ink-subtle"]} />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar instituição"
            placeholderTextColor={color["ink-subtle"]}
            aria-label="Buscar instituição"
            style={{ flex: 1, fontSize: 14, color: color.ink, height: "100%" }}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 200 }}>
          <FormSelect label="Situação" dense value={status} options={STATUS_OPTIONS} onChange={(v) => { setStatus(v); setPage(1); }} />
        </View>
        <View style={{ width: isMobile ? "100%" : 200 }}>
          <FormSelect label="Plano" dense value={planId} options={planOptions} onChange={(v) => { setPlanId(v); setPage(1); }} />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      <View>
        <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
          <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 760 : undefined }}>
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 2.2, minWidth: 180 }}>Instituição</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4, minWidth: 120 }}>Plano</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.2, minWidth: 110, textAlign: "right" }}>Valor</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.1, minWidth: 110, paddingLeft: 16 }}>Situação</Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4, minWidth: 130 }}>Vencimento</Text>
            </View>
            {loading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color={color.brand} />
              </View>
            ) : rows.length === 0 ? (
              <Text className="text-sm text-ink-muted" style={{ padding: 32, textAlign: "center" }}>Nenhuma instituição para os filtros escolhidos.</Text>
            ) : (
              rows.map(({ tenant, subscription: s }, i) => {
                const st = SUBSCRIPTION_STATUS[s?.status ?? "legacy"];
                return (
                  <DataTableRow key={tenant.id} index={i}>
                    <TouchableOpacity style={{ flex: 2.2, minWidth: 180 }} onPress={() => navigate("tenants-detail", { tenantId: tenant.id, tab: "subscription" })} role="link">
                      <Text className="text-sm font-medium text-brand" numberOfLines={1}>{tenant.name}</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1.4, minWidth: 120 }}>
                      <Text className="text-sm text-ink" numberOfLines={1}>{s?.plan?.name ?? "—"}</Text>
                      {s ? <Text className="text-xs text-ink-subtle">{cycleLabel(s.billing_cycle)}</Text> : null}
                    </View>
                    <View style={{ flex: 1.2, minWidth: 110, alignItems: "flex-end" }}>
                      <Text className="text-sm font-mono text-ink">{s ? fmtBrl(s.net_price) : "—"}</Text>
                      {s && Number(s.discount_percent) > 0 ? <Text className="text-xs font-mono text-ink-subtle">{`−${Number(s.discount_percent)}%`}</Text> : null}
                    </View>
                    <View style={{ flex: 1.1, minWidth: 110, paddingLeft: 16 }}>
                      <Badge label={st.label} tone={st.tone} />
                    </View>
                    <Text className="text-sm font-mono text-ink-muted" style={{ flex: 1.4, minWidth: 130 }}>{s ? nextDate(s) : "Tudo liberado"}</Text>
                  </DataTableRow>
                );
              })
            )}
          </View>
        </ScrollView>
        <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
      </View>
    </ScrollView>
  );
}
