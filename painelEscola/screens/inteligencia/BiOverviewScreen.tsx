import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import MetricCard from "../../components/bi/MetricCard";
import LineChart from "../../components/bi/LineChart";
import DifficultyBars from "../../components/bi/DifficultyBars";
import { overviewTiles } from "../../components/bi/overviewTiles";
import BiMetaBar from "../../components/bi/BiMetaBar";
import SegmentedControl from "../../components/bi/SegmentedControl";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiMeta,
  fetchBiMetrics,
  fetchBiOverview,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
  type BiOverview,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Modality = "online" | "presencial";

const REASON_TONE = { below_goal: "danger", declining: "danger", low_attendance: "warning" } as const;

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

/** Inteligência Educacional › Visão geral: dashboard executivo do período. */
export default function BiOverviewScreen({ navigate }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [data, setData] = useState<BiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modality, setModality] = useState<Modality>("online");

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
      setData(await fetchBiOverview(filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os indicadores."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const metric = (key: string) => data?.metrics.find((m) => m.key === key);
  const goal = data?.meta.goal_pct ?? meta?.defaults.goal_pct ?? 70;
  const columns = width >= 1200 ? 4 : width >= 768 ? 2 : 1;
  const tileWidth = `${100 / columns}%` as const;

  const points = useMemo(
    () => (data?.monthly ?? []).map((p) => ({ label: p.label, value: p[modality].value, n: p[modality].students })),
    [data, modality]
  );
  const hasMonthly = points.some((p) => p.value !== null);
  const support = data?.needs_support;

  const tiles = overviewTiles(metric);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional" }, { label: "Visão geral" }]}
        title="Visão geral"
        description="Indicadores consolidados do período, comparados ao período anterior de mesma duração."
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} extra="Fontes: simulados, banco de questões e frequência" />

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
            <Text className="text-danger" style={{ fontSize: 14 }}>
              {error}
            </Text>
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

          <View style={{ flexDirection: width >= 1100 ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: width >= 1100 ? 2 : undefined, width: width >= 1100 ? undefined : "100%", minWidth: 0 }}>
              <Panel
                title="Evolução do aproveitamento nas avaliações"
                description="Média mensal em % da nota máxima · online usa a 1ª tentativa concluída."
                actions={
                  <SegmentedControl
                    accessibilityLabel="Modalidade"
                    value={modality}
                    options={[{ value: "online", label: "Online" }, { value: "presencial", label: "Presencial" }]}
                    onChange={setModality}
                  />
                }
              >
                {hasMonthly ? (
                  <LineChart
                    points={points}
                    seriesName={modality === "online" ? "Online" : "Presencial"}
                    reference={{ value: goal, label: `Meta pedagógica: ${fmtNumber(goal, 0)}%` }}
                    accessibilityLabel={`Aproveitamento médio ${modality} por mês no período`}
                  />
                ) : (
                  <EmptyState text={`Nenhuma avaliação ${modality} no período e filtros escolhidos.`} />
                )}
                <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ marginTop: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
                  <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
                    <Text className="font-semibold text-ink">Por que as modalidades ficam separadas? </Text>
                    Simulados presenciais e online têm escala, conteúdo e dificuldade diferentes. Meses sem avaliação aparecem como lacuna, não como zero.
                  </Text>
                </View>
              </Panel>
            </View>
            <View style={{ flex: width >= 1100 ? 1 : undefined, width: width >= 1100 ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Disciplinas com maior dificuldade" description="% de acertos · simulados online e banco, 1ª tentativa.">
                {data.subjects_difficulty.length ? (
                  <DifficultyBars items={data.subjects_difficulty} goal={goal} onSelect={(id) => navigate("bi-subjects", { subjectId: id })} />
                ) : (
                  <EmptyState text={`Nenhuma disciplina com ao menos ${definitions["subjects.difficulty_rank"]?.min_sample ?? 20} respostas no período.`} />
                )}
              </Panel>
            </View>
          </View>

          <Panel
            title="Alunos que precisam de reforço"
            description={`Sugestões do sistema com o motivo de cada uma — a decisão é da coordenação.${support && support.total > support.items.length ? ` Mostrando ${support.items.length} de ${support.total}.` : ""}`}
            flush
          >
            {support && support.items.length ? (
              <ScrollView horizontal={isMobile} contentContainerStyle={{ minWidth: isMobile ? 720 : "100%" }}>
                <View style={{ width: "100%" }}>
                  <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 2 }}>Aluno</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 3 }}>Indicador de atenção</Text>
                    <Text style={{ width: 140 }} />
                  </View>
                  {support.items.map((item, index) => (
                    <View
                      key={item.student_id}
                      className={`flex-row items-center ${index < support.items.length - 1 ? "border-b border-border" : ""}`}
                      style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}
                    >
                      <View className="flex-row items-center" style={{ flex: 2, gap: 10, minWidth: 0 }}>
                        <View className="bg-brand-tint items-center justify-center" style={{ width: 28, height: 28, borderRadius: 14 }}>
                          <Text className="font-semibold text-brand" style={{ fontSize: 11 }}>{initials(item.name)}</Text>
                        </View>
                        <View style={{ flexShrink: 1 }}>
                          <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>{item.name}</Text>
                          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>{item.classes.join(", ") || "—"}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 3, gap: 6 }}>
                        {item.reasons.map((reason) => (
                          <View key={reason.code} className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                            <Badge label={reason.label} tone={REASON_TONE[reason.code]} dot />
                            <Text className="font-mono text-ink-muted" style={{ fontSize: 12 }}>{reason.detail}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{ width: 140, alignItems: "flex-end" }}>
                        <Button size="sm" label="Ver desempenho" onPress={() => navigate("alunos-performance", { studentId: item.student_id })} />
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={{ padding: 24 }}>
                <EmptyState text="Nenhum aluno com indicador de atenção no período e filtros escolhidos." />
              </View>
            )}
          </Panel>
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>
        {text}
      </Text>
    </View>
  );
}
