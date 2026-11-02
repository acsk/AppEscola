import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import FormSelect from "../../components/ui/FormSelect";
import MetricCard from "../../components/bi/MetricCard";
import Heatmap from "../../components/bi/Heatmap";
import BiMetaBar from "../../components/bi/BiMetaBar";
import BiFilterBar, { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { ErrorPatternNote, RecurringErrorItem } from "../../components/bi/RecurringErrors";
import { fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiMeta,
  fetchBiMetrics,
  fetchBiSubject,
  fetchBiSubjects,
  fetchBiTopicErrors,
  type BiAnswerSource,
  type BiFilters,
  type BiMeta,
  type BiMetricDefinition,
  type BiSubjectAnalytics,
  type BiSubjectSummary,
  type BiTopicErrors,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  subjectId?: number | null;
};

const SOURCES: { value: BiAnswerSource; label: string }[] = [
  { value: "both", label: "Simulados + banco" },
  { value: "online", label: "Simulados online" },
  { value: "practice", label: "Banco de questões" },
];

const SOURCE_NOTE: Record<BiAnswerSource, string> = {
  both: "Fontes: simulados online e banco de questões (1ª tentativa)",
  online: "Fonte: simulados online (1ª tentativa concluída)",
  practice: "Fonte: banco de questões (1ª tentativa)",
};

const ERRORS_PREVIEW = 3;
const ERRORS_ALL = 20;

/** Inteligência Educacional › Disciplinas e assuntos: onde a turma acerta, onde trava e o que revisar primeiro. */
export default function BiSubjectsScreen({ navigate, subjectId: initialSubjectId = null }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [preset, setPreset] = useState<PeriodPreset>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => presetRange("90d"));
  const [source, setSource] = useState<BiAnswerSource>("both");
  const [subjects, setSubjects] = useState<BiSubjectSummary[] | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(initialSubjectId);
  const [data, setData] = useState<BiSubjectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topicId, setTopicId] = useState<number | null>(null);
  const [errors, setErrors] = useState<BiTopicErrors | null>(null);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchBiMeta().then(setMeta).catch(() => setMeta(null));
    fetchBiMetrics()
      .then((list) => setDefinitions(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setDefinitions({}));
  }, []);

  // Abas: disciplinas com respostas no recorte. Mantém a aba atual se ela continuar na lista.
  const loadSubjects = useCallback(async () => {
    setError("");
    try {
      const list = await fetchBiSubjects(filters, source);
      setSubjects(list);
      setSubjectId((current) => (current && list.some((s) => s.subject_id === current) ? current : list[0]?.subject_id ?? current));
    } catch (err: any) {
      setSubjects([]);
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as disciplinas."));
    }
  }, [filters, source]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const load = useCallback(async () => {
    if (!subjectId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await fetchBiSubject(subjectId, filters, source);
      setData(next);
      setTopicId((current) =>
        current && next.ranking.items.some((t) => t.topic_id === current) ? current : next.ranking.items[0]?.topic_id ?? null
      );
    } catch (err: any) {
      setData(null);
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a disciplina."));
    } finally {
      setLoading(false);
    }
  }, [subjectId, filters, source]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setShowAll(false);
  }, [topicId, subjectId]);

  useEffect(() => {
    if (!subjectId || !topicId) {
      setErrors(null);
      return;
    }
    let active = true;
    setErrorsLoading(true);
    fetchBiTopicErrors(subjectId, topicId, filters, source, showAll ? ERRORS_ALL : ERRORS_PREVIEW)
      .then((result) => active && setErrors(result))
      .catch(() => active && setErrors(null))
      .finally(() => active && setErrorsLoading(false));
    return () => {
      active = false;
    };
  }, [subjectId, topicId, filters, source, showAll]);

  const metric = (key: string) => data?.metrics.find((m) => m.key === key);
  const goal = data?.meta.goal_pct ?? meta?.defaults.goal_pct ?? 70;
  const minSample = data?.meta.topic_min_sample ?? 20;
  const columns = width >= 1200 ? 4 : width >= 768 ? 2 : 1;
  const tileWidth = `${100 / columns}%` as const;
  const wide = width >= 1100;
  const evaluated = metric("subject.students_evaluated");
  const below = metric("subject.topics_below_goal");
  const ranking = data?.ranking.items ?? [];
  const selectedTopic = ranking.find((t) => t.topic_id === topicId);
  const periodDays = data ? Math.round((Date.parse(data.meta.period.to) - Date.parse(data.meta.period.from)) / 86400000) + 1 : null;

  const tiles = [
    { key: "subject.answers", label: "Questões respondidas", hint: periodDays ? `vs. ${periodDays} dias anteriores` : undefined },
    { key: "subject.accuracy", label: "Acertos", unit: "%" },
    {
      key: "subject.students_evaluated",
      label: "Alunos avaliados",
      hint: evaluated?.sample.pct_of_active !== undefined && evaluated.sample.pct_of_active !== null ? `${fmtNumber(evaluated.sample.pct_of_active, 0)}% dos ativos` : undefined,
    },
    {
      key: "subject.topics_below_goal",
      label: "Assuntos abaixo da meta",
      unit: below?.sample.topics_with_sample ? `de ${below.sample.topics_with_sample}` : undefined,
      goodWhen: "down" as const,
    },
  ];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Disciplinas e assuntos" }]}
        title="Disciplinas e assuntos"
        description="Onde a turma acerta, onde trava e o que revisar primeiro."
        actions={
          <Button
            icon={RefreshCw}
            label="Atualizar"
            onPress={() => {
              loadSubjects();
              load();
            }}
            loading={loading}
          />
        }
      />

      <BiMetaBar plan={meta?.features.plan} generatedAt={data?.meta.generated_at} answersAsOf={data?.meta.answers_as_of} extra={SOURCE_NOTE[source]} />

      {subjects && subjects.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border" contentContainerStyle={{ gap: 24 }}>
          <View className="flex-row" role="tablist" aria-label="Disciplinas" style={{ gap: 24 }}>
            {subjects.map((s) => {
              const selected = s.subject_id === subjectId;
              return (
                <Pressable
                  key={s.subject_id}
                  role="tab"
                  aria-selected={selected}
                  onPress={() => setSubjectId(s.subject_id)}
                  style={{ paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: selected ? color.brand : "transparent", marginBottom: -1 }}
                >
                  <Text className={selected ? "font-semibold text-brand" : "text-ink-muted"} style={{ fontSize: 14 }}>
                    {s.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <BiFilterBar
        meta={meta}
        filters={filters}
        preset={preset}
        hideSubject
        onChange={(next, nextPreset) => {
          setFilters(next);
          setPreset(nextPreset);
        }}
        extra={<FormSelect dense label="Fonte" value={source} options={SOURCES} onChange={(v) => setSource(v as BiAnswerSource)} />}
      />

      {error ? (
        <Panel>
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            <Text className="text-danger" style={{ fontSize: 14 }}>
              {error}
            </Text>
            <Button label="Tentar novamente" onPress={() => (subjectId ? load() : loadSubjects())} />
          </View>
        </Panel>
      ) : null}

      {subjects && !subjects.length && !error ? (
        <Panel>
          <EmptyState text="Nenhuma resposta de simulado ou banco de questões no período e filtros escolhidos." />
        </Panel>
      ) : null}

      {(loading && !data) || subjects === null ? (
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

          {data.heatmap_available ? (
            <Panel
              title="Mapa de calor · turmas × assuntos"
              description={`% de acertos em ${data.subject.name} · assuntos mais respondidos no período.`}
            >
              {data.heatmap && data.heatmap.rows.length ? (
                <Heatmap heatmap={data.heatmap} goal={goal} minSample={minSample} tableLabel={`Acertos em ${data.subject.name} por turma e assunto`} />
              ) : (
                <EmptyState text="Nenhuma questão desta disciplina está classificada por assunto no período." />
              )}
            </Panel>
          ) : null}

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Ranking de assuntos críticos" description="Menor aproveitamento primeiro · todas as turmas filtradas. Toque num assunto para ver os erros." flush>
                {ranking.length ? (
                  <ScrollView horizontal={isMobile} contentContainerStyle={{ minWidth: isMobile ? 640 : "100%" }}>
                    <View style={{ width: "100%" }} role="table" aria-label="Ranking de assuntos">
                      <View className="flex-row bg-surface-sunken border-b border-border" role="row" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 8 }}>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 20 }}>#</Text>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 2 }}>Assunto</Text>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 2 }}>Aproveitamento</Text>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 92, textAlign: "right" }}>{periodDays ? `Evolução ${periodDays}d` : "Evolução"}</Text>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Respostas</Text>
                        <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 56, textAlign: "right" }}>Alunos</Text>
                      </View>
                      {ranking.map((topic, index) => {
                        const selected = topic.topic_id === topicId;
                        const delta = topic.delta_pp;
                        return (
                          <Pressable
                            key={topic.topic_id}
                            role="row"
                            aria-selected={selected}
                            onPress={() => setTopicId(topic.topic_id)}
                            className={`flex-row items-center ${selected ? "bg-surface-sunken" : ""} ${index < ranking.length - 1 ? "border-b border-border" : ""}`}
                            style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8, borderLeftWidth: 3, borderLeftColor: selected ? color.brand : "transparent" }}
                          >
                            <Text className="font-mono text-ink-subtle" style={{ fontSize: 12, width: 20 }}>{index + 1}</Text>
                            <Text className="text-ink" style={{ fontSize: 14, flex: 2 }} numberOfLines={2}>{topic.name}</Text>
                            <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                              <View className="bg-surface-sunken" style={{ flex: 1, height: 6, borderRadius: 2, maxWidth: 96 }}>
                                <View style={{ width: `${topic.accuracy}%`, height: 6, borderRadius: 2, backgroundColor: color["data-1"] }} />
                              </View>
                              <Text className="font-mono text-ink" style={{ fontSize: 12 }}>{`${fmtNumber(topic.accuracy, 0)}%`}</Text>
                              {topic.below_goal ? (
                                <Text className="font-mono text-danger" style={{ fontSize: 11 }}>▾ meta</Text>
                              ) : null}
                            </View>
                            <Text
                              className={`font-mono ${delta === null ? "text-ink-subtle" : delta < 0 ? "text-danger" : "text-success"}`}
                              style={{ fontSize: 12, width: 92, textAlign: "right" }}
                              aria-label={delta === null ? "Sem comparação com o período anterior" : `${delta < 0 ? "Queda" : "Alta"} de ${fmtNumber(Math.abs(delta), 1)} pontos percentuais`}
                            >
                              {delta === null ? "—" : `${delta < 0 ? "▼" : "▲"} ${delta < 0 ? "−" : "+"}${fmtNumber(Math.abs(delta), 1)} pp`}
                            </Text>
                            <Text className="font-mono text-ink" style={{ fontSize: 12, width: 72, textAlign: "right" }}>{topic.answers.toLocaleString("pt-BR")}</Text>
                            <Text className="font-mono text-ink" style={{ fontSize: 12, width: 56, textAlign: "right" }}>{topic.students.toLocaleString("pt-BR")}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : (
                  <View style={{ padding: 24 }}>
                    <EmptyState text={`Nenhum assunto com ao menos ${minSample} respostas no período.`} />
                  </View>
                )}
                <View style={{ padding: 16 }}>
                  <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
                    <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
                      {`Evolução compara o aproveitamento do período com o período anterior de mesma duração. Assuntos com menos de ${minSample} respostas não entram no ranking`}
                      {data.ranking.insufficient.length ? ` (${data.ranking.insufficient.length} nesta disciplina: ${data.ranking.insufficient.slice(0, 4).map((t) => t.name).join(", ")}${data.ranking.insufficient.length > 4 ? "…" : ""}).` : "."}
                    </Text>
                  </View>
                </View>
              </Panel>
            </View>

            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel
                title={selectedTopic ? `Erros recorrentes · ${selectedTopic.name}` : "Erros recorrentes"}
                description="Questões com maior taxa de erro e a alternativa errada mais marcada."
                actions={
                  errors && errors.total > errors.items.length && !showAll ? (
                    <Button size="sm" label="Ver todas" onPress={() => setShowAll(true)} />
                  ) : null
                }
              >
                {errorsLoading && !errors ? (
                  <View style={{ paddingVertical: 32, alignItems: "center" }}>
                    <ActivityIndicator color={color.brand} />
                  </View>
                ) : errors && errors.items.length ? (
                  <View style={{ gap: 20, opacity: errorsLoading ? 0.6 : 1 }}>
                    {errors.items.map((item, index) => (
                      <View key={item.question_id} className={index ? "border-t border-border" : ""} style={{ paddingTop: index ? 20 : 0 }}>
                        <RecurringErrorItem item={item} />
                      </View>
                    ))}
                    <ErrorPatternNote item={errors.items[0]} />
                    {showAll && errors.total > errors.items.length ? (
                      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
                        {`Mostrando ${errors.items.length} de ${errors.total} questões.`}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <EmptyState
                    text={
                      selectedTopic
                        ? `Nenhuma questão deste assunto com ao menos ${errors?.min_answers ?? definitions["questions.recurring_errors"]?.min_sample ?? 5} respostas.`
                        : "Selecione um assunto no ranking."
                    }
                  />
                )}
              </Panel>
            </View>
          </View>
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
