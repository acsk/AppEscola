import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import BiMetaBar from "../../components/bi/BiMetaBar";
import MetricCell from "../../components/bi/MetricCell";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiClasses, fetchBiMeta, type BiClassComparison, type BiFilters, type BiMeta } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const COLUMNS = [
  { key: "students", label: "Alunos", width: 72 },
  { key: "avg_online", label: "Média online", width: 96, unit: "%" },
  { key: "avg_presencial", label: "Média presencial", width: 112, unit: "%" },
  { key: "practice", label: "Acerto no banco", width: 104, unit: "%" },
  { key: "attendance", label: "Frequência", width: 88, unit: "%" },
  { key: "participation", label: "Participação online", width: 120, unit: "%" },
  { key: "needs_support", label: "Em atenção", width: 88, goodWhen: "down" as const },
] as const;

/** Inteligência Educacional › Análise de turmas: comparação lado a lado, com amostra e variação em cada célula. */
export default function BiClassesScreen({ navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiClassComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiClasses(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as turmas."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items ?? [];
  const tableWidth = 220 + COLUMNS.reduce((sum, c) => sum + c.width + 12, 0) + 32;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Análise de turmas" }]}
        title="Análise de turmas"
        description="Compare as turmas pelos mesmos indicadores da visão geral. Abra uma turma para ver os alunos."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: simulados, avaliações presenciais, banco de questões e frequência" />

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
      />

      {error ? (
        <Panel>
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            <Text className="text-danger" style={{ fontSize: 14 }}>{error}</Text>
            <Button label="Tentar novamente" onPress={load} />
          </View>
        </Panel>
      ) : null}

      {loading && !data ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : null}

      {data ? (
        <Panel
          title="Comparação entre turmas"
          description="Variação contra o período anterior de mesma duração · “—” = amostra insuficiente, nunca zero · aluno em duas turmas conta nas duas."
          flush
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {items.length ? (
            <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
              <View style={{ minWidth: tableWidth, width: "100%" }} role="table" aria-label="Comparação entre turmas">
                <View className="flex-row bg-surface-sunken border-b border-border" role="row" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                  <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1, minWidth: 180 }}>Turma</Text>
                  {COLUMNS.map((c) => (
                    <Text key={c.key} role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width: c.width, textAlign: "right" }}>
                      {c.label}
                    </Text>
                  ))}
                  <View style={{ width: 16 }} />
                </View>
                {items.map((item, index) => (
                  <Pressable
                    key={item.school_class_id}
                    role="row"
                    accessibilityRole="link"
                    aria-label={`Abrir turma ${item.name}`}
                    onPress={() => navigate("bi-class", { schoolClassId: item.school_class_id, filters })}
                    className={`flex-row items-center ${index < items.length - 1 ? "border-b border-border" : ""}`}
                    style={({ hovered }: any) => [{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }, hovered ? { backgroundColor: color["surface-sunken"] } : null]}
                  >
                    <View style={{ flex: 1, minWidth: 180 }}>
                      <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>{item.name}</Text>
                      <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                        {[item.course, item.year].filter(Boolean).join(" · ") || "—"}
                      </Text>
                    </View>
                    {COLUMNS.map((c) => (
                      <MetricCell key={c.key} metric={item.metrics[c.key]} unit={"unit" in c ? c.unit : ""} goodWhen={"goodWhen" in c ? c.goodWhen : "up"} width={c.width} />
                    ))}
                    <Icon icon={ChevronRight} size={16} color={color["ink-subtle"]} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>
                Nenhuma turma com aluno ativo no período e filtros escolhidos.
              </Text>
            </View>
          )}
        </Panel>
      ) : null}
    </ScrollView>
  );
}
