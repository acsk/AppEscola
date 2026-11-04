import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RefreshCw, Search } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormSelect from "../../components/ui/FormSelect";
import DataTableRow from "../../components/ui/DataTableRow";
import Icon from "../../components/ui/Icon";
import { TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchTenantUsage, fmtDateTime, fmtInt, type TenantUsageRow, type UsageResource } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const COLUMNS: { key: string; label: string }[] = [
  { key: "students", label: "Alunos ativos" },
  { key: "users", label: "Equipe" },
  { key: "classes", label: "Turmas" },
  { key: "questions", label: "Questões" },
  { key: "exams", label: "Simulados" },
  { key: "ai_requests", label: "IA (mês)" },
  { key: "document_processing", label: "Docs (mês)" },
  { key: "storage_mb", label: "Arquivos (MB)" },
];

const FILTERS = [
  { value: "", label: "Todas as instituições" },
  { value: "80", label: "Acima de 80% de algum limite" },
  { value: "100", label: "Com limite atingido" },
];

function Cell({ value }: { value?: UsageResource }) {
  if (!value) {
    return (
      <View style={{ alignItems: "flex-end" }}>
        <Text className="text-sm text-ink-subtle">—</Text>
      </View>
    );
  }
  const tone = value.percent == null ? "text-ink" : value.percent >= 95 ? "text-danger" : value.percent >= 80 ? "text-warning" : "text-ink";
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text className={`text-sm font-mono ${tone}`}>{fmtInt(value.usage)}</Text>
      <Text className="text-xs font-mono text-ink-subtle">{value.limit == null ? "sem limite" : `de ${fmtInt(value.limit)}`}</Text>
    </View>
  );
}

/** Plataforma › Monitoramento › Consumo por instituição: uso × limite de cada recurso (cache de 5 min). */
export default function SaasUsageScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [rows, setRows] = useState<TenantUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchTenantUsage());
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o consumo."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.tenant.name.toLowerCase().includes(q))
      .filter((r) => !threshold || r.max_percent >= Number(threshold))
      .sort((a, b) => b.max_percent - a.max_percent || a.tenant.name.localeCompare(b.tenant.name));
  }, [rows, search, threshold]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 20 }}>
      <PageHeader
        breadcrumb={[{ label: "Monitoramento" }, { label: "Consumo por instituição" }]}
        title="Consumo por instituição"
        description="Uso de cada recurso em relação ao limite do plano. Em laranja acima de 80%, em vermelho acima de 95%."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <View className="flex-row flex-wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <View className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3 mb-2" style={{ height: 32, flex: 1, minWidth: isMobile ? "100%" : 240, maxWidth: isMobile ? undefined : 360, gap: 8 }}>
          <Icon icon={Search} color={color["ink-subtle"]} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar instituição" placeholderTextColor={color["ink-subtle"]} aria-label="Buscar instituição" style={{ flex: 1, fontSize: 14, color: color.ink, height: "100%" }} />
        </View>
        <View style={{ width: isMobile ? "100%" : 260 }}>
          <FormSelect label="Mostrar" dense value={threshold} options={FILTERS} onChange={setThreshold} />
        </View>
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
        <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 980 : undefined }}>
          <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2.2, minWidth: 200 }}>Instituição</Text>
            {COLUMNS.map((c) => (
              <Text key={c.key} className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 90, textAlign: "right" }}>{c.label}</Text>
            ))}
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.3, minWidth: 130, paddingLeft: 16 }}>Atividade</Text>
          </View>
          {loading && rows.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={color.brand} />
            </View>
          ) : visible.length === 0 ? (
            <Text className="text-sm text-ink-muted" style={{ padding: 32, textAlign: "center" }}>Nenhuma instituição para o filtro escolhido.</Text>
          ) : (
            visible.map((r, i) => (
              <DataTableRow key={r.tenant.id} index={i}>
                <TouchableOpacity style={{ flex: 2.2, minWidth: 200 }} onPress={() => navigate("tenants-detail", { tenantId: r.tenant.id, tab: "usage" })} role="link">
                  <Text className="text-sm font-medium text-brand" numberOfLines={1}>{r.tenant.name}</Text>
                  <View className="flex-row items-center" style={{ gap: 6, marginTop: 2 }}>
                    <Text className="text-xs text-ink-subtle">{r.plan ?? "Sem assinatura"}</Text>
                    {r.max_percent >= 100 ? <Badge label="Limite atingido" tone="danger" /> : null}
                  </View>
                </TouchableOpacity>
                {COLUMNS.map((c) => (
                  <View key={c.key} style={{ flex: 1, minWidth: 90 }}>
                    <Cell value={r.resources[c.key]} />
                  </View>
                ))}
                <View style={{ flex: 1.3, minWidth: 130, paddingLeft: 16 }}>
                  <Text className="text-xs font-mono text-ink">{`${fmtInt(r.practice_answers_30d)} questões/30d`}</Text>
                  <Text className="text-xs text-ink-subtle">{r.last_student_activity_at ? `aluno ${fmtDateTime(r.last_student_activity_at)}` : "sem atividade de aluno"}</Text>
                </View>
              </DataTableRow>
            ))
          )}
        </View>
      </ScrollView>
      <Text className="text-xs text-ink-subtle">IA (mês): requisições aos provedores no mês. Armazenamento: medido uma vez por dia; uploads de hoje entram na próxima medição.</Text>
    </ScrollView>
  );
}
