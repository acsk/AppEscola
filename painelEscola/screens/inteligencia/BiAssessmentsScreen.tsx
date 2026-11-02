import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight, RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Icon from "../../components/ui/Icon";
import MetricCard from "../../components/bi/MetricCard";
import LineChart from "../../components/bi/LineChart";
import BiMetaBar from "../../components/bi/BiMetaBar";
import SegmentedControl from "../../components/bi/SegmentedControl";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiAssessments,
  fetchBiMeta,
  fetchBiMetrics,
  type BiAssessments,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
  type BiModality,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type ListFilter = "all" | BiModality;

/** Inteligência Educacional › Análise de simulados: indicadores, evolução e lista de avaliações do período. */
export default function BiAssessmentsScreen({ navigate }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiAssessments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modality, setModality] = useState<BiModality>("online");
  const [listFilter, setListFilter] = useState<ListFilter>("all");

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
    fetchBiMetrics()
      .then((list) => setDefinitions(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setDefinitions({}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiAssessments(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a análise de simulados."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const metric = (key: string) => data?.metrics.find((m) => m.key === key);
  const goal = data?.meta.goal_pct ?? meta?.defaults.goal_pct ?? 70;
  const columns = width >= 1400 ? 5 : width >= 768 ? 2 : 1;
  const tileWidth = `${100 / columns}%` as const;
  const points = useMemo(
    () => (data?.monthly ?? []).map((p) => ({ label: p.label, value: p[modality].value, n: p[modality].students })),
    [data, modality]
  );
  const items = (data?.items.items ?? []).filter((i) => listFilter === "all" || i.modality === listFilter);
  const below = metric("assessments.below_goal_share");

  const tiles = [
    { key: "assessments.count", label: "Avaliações aplicadas" },
    { key: "exams.participation", label: "Participação no online", unit: "%" },
    { key: "assessments.avg_online", label: "Média online", unit: "%" },
    { key: "assessments.avg_presencial", label: "Média presencial", unit: "%" },
    {
      key: "assessments.below_goal_share",
      label: "Resultados abaixo da meta",
      unit: "%",
      goodWhen: "down" as const,
      hint: below?.sample.below !== undefined ? `${below.sample.below} de ${below.sample.results} resultados` : undefined,
    },
  ];

  const open = (modalityValue: BiModality, id: number) =>
    navigate("bi-assessment", { modality: modalityValue, assessmentId: id, filters });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Análise de simulados" }]}
        title="Análise de simulados"
        description="Resultados por avaliação, com online e presencial sempre separados."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: simulados online (1ª tentativa) e avaliações presenciais publicadas" />

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
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {tiles.map((tile) => (
              <View key={tile.key} style={{ width: tileWidth, paddingHorizontal: 8 }}>
                <MetricCard
                  label={tile.label}
                  metric={metric(tile.key)}
                  definition={definitions[tile.key]}
                  unit={tile.unit}
                  hint={tile.hint}
                  goodWhen={tile.goodWhen}
                />
              </View>
            ))}
          </View>

          <Panel
            title="Evolução mensal"
            description="Média dos resultados em % da nota máxima · meses sem avaliação aparecem como lacuna."
            actions={
              <SegmentedControl
                accessibilityLabel="Modalidade"
                value={modality}
                options={[{ value: "online", label: "Online" }, { value: "presencial", label: "Presencial" }]}
                onChange={setModality}
              />
            }
          >
            {points.some((p) => p.value !== null) ? (
              <LineChart
                points={points}
                seriesName={modality === "online" ? "Online" : "Presencial"}
                reference={{ value: goal, label: `Meta: ${fmtNumber(goal, 0)}%` }}
                accessibilityLabel={`Média ${modality} por mês no período`}
              />
            ) : (
              <EmptyState text={`Nenhuma avaliação ${modality} no período e filtros escolhidos.`} />
            )}
          </Panel>

          <Panel
            title="Avaliações do período"
            description={`Da mais recente para a mais antiga. Média e mediana só com ao menos ${data.meta.min_sample} participantes.${data.items.total > data.items.items.length ? ` Mostrando ${data.items.items.length} de ${data.items.total}.` : ""}`}
            actions={
              <SegmentedControl
                accessibilityLabel="Filtrar lista por modalidade"
                value={listFilter}
                options={[
                  { value: "all", label: "Todas" },
                  { value: "online", label: "Online" },
                  { value: "presencial", label: "Presencial" },
                ]}
                onChange={setListFilter}
              />
            }
            flush
          >
            {items.length ? (
              <ScrollView horizontal={isMobile} contentContainerStyle={{ minWidth: isMobile ? 760 : "100%" }}>
                <View style={{ width: "100%" }} role="table" aria-label="Avaliações do período">
                  <View className="flex-row bg-surface-sunken border-b border-border" role="row" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                    <HeaderCell label="Data" width={88} />
                    <HeaderCell label="Avaliação" flex={3} />
                    <HeaderCell label="Modalidade" width={96} />
                    <HeaderCell label="Participantes" width={104} right />
                    <HeaderCell label="Média" width={64} right />
                    <HeaderCell label="Mediana" width={72} right />
                    <HeaderCell label="Abaixo da meta" width={112} right />
                    <View style={{ width: 20 }} />
                  </View>
                  {items.map((item, index) => (
                    <Pressable
                      key={`${item.modality}:${item.assessment_id}`}
                      role="row"
                      accessibilityRole="link"
                      aria-label={`Abrir ${item.title}`}
                      onPress={() => open(item.modality, item.assessment_id)}
                      className={`flex-row items-center ${index < items.length - 1 ? "border-b border-border" : ""}`}
                      style={({ hovered }: any) => [{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }, hovered ? { backgroundColor: color["surface-sunken"] } : null]}
                    >
                      <Text className="font-mono text-ink-muted" style={{ fontSize: 12, width: 88 }}>{fmtDate(item.date)}</Text>
                      <View style={{ flex: 3, minWidth: 0 }}>
                        <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>{item.title}</Text>
                        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                          {[item.school_class, item.exam_type].filter(Boolean).join(" · ") || "—"}
                        </Text>
                      </View>
                      <View style={{ width: 96 }}>
                        <Badge label={item.modality === "online" ? "Online" : "Presencial"} tone={item.modality === "online" ? "brand" : "neutral"} />
                      </View>
                      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 104, textAlign: "right" }}>
                        {item.participants.toLocaleString("pt-BR")}
                        {item.absent ? <Text className="text-ink-subtle">{` · ${item.absent} falta${item.absent > 1 ? "s" : ""}`}</Text> : null}
                      </Text>
                      <PctCell value={item.avg} goal={goal} width={64} />
                      <PctCell value={item.median} goal={goal} width={72} />
                      <Text className="font-mono text-ink" style={{ fontSize: 12, width: 112, textAlign: "right" }}>
                        {item.participants ? `${item.below_goal} (${fmtNumber((item.below_goal / item.participants) * 100, 0)}%)` : "—"}
                      </Text>
                      <Icon icon={ChevronRight} size={16} color={color["ink-subtle"]} />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={{ padding: 24 }}>
                <EmptyState text="Nenhuma avaliação com resultado no período e filtros escolhidos." />
              </View>
            )}
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}

function HeaderCell({ label, width, flex, right }: { label: string; width?: number; flex?: number; right?: boolean }) {
  return (
    <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width, flex, textAlign: right ? "right" : "left" }}>
      {label}
    </Text>
  );
}

function PctCell({ value, goal, width }: { value: number | null; goal: number; width: number }) {
  return (
    <Text
      className={`font-mono ${value === null ? "text-ink-subtle" : "text-ink"}`}
      style={{ fontSize: 12, width, textAlign: "right" }}
      aria-label={value === null ? "Amostra insuficiente" : `${fmtNumber(value, 1)}%${value < goal ? ", abaixo da meta" : ""}`}
    >
      {value === null ? "—" : `${fmtNumber(value, 0)}%${value < goal ? " ▾" : ""}`}
    </Text>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
