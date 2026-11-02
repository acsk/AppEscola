import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import StatTile from "../../components/ui/StatTile";
import FormSelect from "../../components/ui/FormSelect";
import LineChart from "../../components/bi/LineChart";
import { presetRange } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiStudentEvolution, type BiFilters, type BiStudentEvolution, type BiTopicTrend } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  studentId: number;
  /** Filtros da tela de origem; sem eles (ex.: link direto), últimos 90 dias. */
  filters?: BiFilters;
};

const REASON_TONE = { below_goal: "danger", declining: "danger", low_attendance: "warning" } as const;

/** Inteligência Educacional › Evolução dos alunos › aluno: avaliações comparáveis × colegas, disciplinas e assuntos. */
export default function BiStudentEvolutionScreen({ navigate, studentId, filters: initialFilters }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const [filters] = useState<BiFilters>(() => initialFilters ?? presetRange("90d"));
  const [data, setData] = useState<BiStudentEvolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seriesKey, setSeriesKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchBiStudentEvolution(studentId, filters);
      setData(next);
      setSeriesKey((current) => current || (next.series[0] ? `${next.series[0].modality}:${next.series[0].exam_type_id ?? 0}` : ""));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a evolução do aluno."));
    } finally {
      setLoading(false);
    }
  }, [studentId, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const student = data?.student;
  const goal = data?.meta.goal_pct ?? 70;
  const wide = width >= 1100;
  const columns = width >= 1100 ? 4 : width >= 600 ? 2 : 1;
  const seriesOptions = (data?.series ?? []).map((s) => ({
    value: `${s.modality}:${s.exam_type_id ?? 0}`,
    label: `${s.modality === "online" ? "Online" : "Presencial"}${s.exam_type ? ` · ${s.exam_type}` : ""} (${s.points.length})`,
  }));
  const series = data?.series.find((s) => `${s.modality}:${s.exam_type_id ?? 0}` === seriesKey);
  const points = useMemo(
    () => (series?.points ?? []).map((p) => ({ label: fmtDate(p.date).slice(0, 5), value: p.pct, n: 1 })),
    [series]
  );

  const cell = (v?: { value: number | null; n: number }) => (v && v.value !== null ? `${fmtNumber(v.value, 1)}` : "—");
  const tiles = student
    ? [
        { label: "Média online", value: cell(student.online), unit: student.online.value !== null ? "%" : undefined, hint: `${student.online.n} simulado(s)` },
        { label: "Média presencial", value: cell(student.presencial), unit: student.presencial.value !== null ? "%" : undefined, hint: `${student.presencial.n} avaliação(ões)` },
        { label: "Acerto no banco", value: cell(student.practice), unit: student.practice.value !== null ? "%" : undefined, hint: `${student.practice.n} resposta(s) · 1ª tentativa` },
        { label: "Frequência", value: cell(student.attendance), unit: student.attendance.value !== null ? "%" : undefined, hint: `${student.attendance.n} chamada(s)` },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Evolução dos alunos", onPress: () => navigate("bi-students") },
          { label: student?.name ?? "Aluno" },
        ]}
        title={student?.name ?? "Aluno"}
        description={
          student
            ? [student.classes.join(", "), `${fmtDate(data!.meta.period.from)} a ${fmtDate(data!.meta.period.to)}`].filter(Boolean).join(" · ")
            : undefined
        }
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            <Button label="Diagnóstico 360°" onPress={() => navigate("bi-diagnosis", { studentId, filters })} />
            <Button label="Desempenho completo" onPress={() => navigate("alunos-performance", { studentId })} />
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
          </View>
        }
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

      {data && student ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
            <Text className="text-ink-muted" style={{ fontSize: 13 }}>Evolução no período:</Text>
            <Text
              className={`font-mono font-semibold ${student.evolution_pp === null ? "text-ink-subtle" : student.evolution_pp < 0 ? "text-danger" : "text-success"}`}
              style={{ fontSize: 13 }}
            >
              {student.evolution_pp === null
                ? `sem amostra (mín. ${data.meta.min_student_results} avaliações comparáveis)`
                : `${student.evolution_pp < 0 ? "▼ −" : "▲ +"}${fmtNumber(Math.abs(student.evolution_pp), 1)} pp`}
            </Text>
            {student.reasons.map((r) => (
              <Badge key={r.code} label={`${r.label} · ${r.detail}`} tone={REASON_TONE[r.code]} dot />
            ))}
          </View>

          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {tiles.map((tile) => (
              <View key={tile.label} style={{ width: `${100 / columns}%`, paddingHorizontal: 8 }}>
                <StatTile label={tile.label} value={tile.value} unit={tile.unit} hint={tile.hint} />
              </View>
            ))}
          </View>

          <Panel
            title="Avaliações comparáveis"
            description={`Aluno × média dos colegas de turma (${Math.max(0, data.peers.students - 1)} colega(s)) na mesma avaliação. Cada série reúne uma modalidade e um concurso.`}
            actions={
              seriesOptions.length > 1 ? (
                <View style={{ width: width < 600 ? 180 : 260 }}>
                  <FormSelect dense label="Série" value={seriesKey} options={seriesOptions} onChange={setSeriesKey} />
                </View>
              ) : null
            }
          >
            {series && series.points.length ? (
              <View style={{ gap: 12 }}>
                <LineChart
                  points={points}
                  seriesName={student.name}
                  showN={false}
                  compare={{ name: "Média dos colegas", values: series.points.map((p) => p.peers_avg), n: series.points.map((p) => p.peers_n) }}
                  reference={{ value: goal, label: `Meta: ${fmtNumber(goal, 0)}%` }}
                  accessibilityLabel={`Resultados de ${student.name} comparados com a média dos colegas`}
                />
                <View style={{ gap: 4 }}>
                  {series.points.map((p) => (
                    <Text key={p.assessment_id} className="text-ink-muted" style={{ fontSize: 12 }}>
                      {`${fmtDate(p.date)} · ${p.title}: ${fmtNumber(p.pct, 1)}%${p.peers_avg !== null ? ` · colegas ${fmtNumber(p.peers_avg, 1)}% (n=${p.peers_n})` : " · sem colegas com resultado"}`}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <EmptyState text="Nenhuma avaliação do aluno no período." />
            )}
          </Panel>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Acerto por disciplina" description={`Simulados online e banco, 1ª tentativa · mín. ${data.meta.min_answers} respostas.`} flush>
                {data.subjects.length ? (
                  <View role="table" aria-label="Acerto por disciplina, aluno e colegas">
                    <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Disciplina</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Aluno</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Colegas</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Diferença</Text>
                    </View>
                    {data.subjects.map((s, i) => {
                      const diff = s.accuracy !== null && s.peers_accuracy !== null ? s.accuracy - s.peers_accuracy : null;
                      return (
                        <View key={s.subject_id} className={`flex-row items-center ${i < data.subjects.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{s.name}</Text>
                            <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`${s.answers} resp. · colegas ${s.peers_answers}`}</Text>
                          </View>
                          <Text className={`font-mono ${s.accuracy === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                            {s.accuracy === null ? "—" : `${fmtNumber(s.accuracy, 0)}%${s.accuracy < goal ? " ▾" : ""}`}
                          </Text>
                          <Text className={`font-mono ${s.peers_accuracy === null ? "text-ink-subtle" : "text-ink-muted"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                            {s.peers_accuracy === null ? "—" : `${fmtNumber(s.peers_accuracy, 0)}%`}
                          </Text>
                          <Text className={`font-mono ${diff === null ? "text-ink-subtle" : diff < 0 ? "text-danger" : "text-success"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                            {diff === null ? "—" : `${diff < 0 ? "−" : "+"}${fmtNumber(Math.abs(diff), 0)} pp`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ padding: 24 }}>
                    <EmptyState text="Nenhuma resposta do aluno no período." />
                  </View>
                )}
              </Panel>
            </View>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0, gap: 24 }}>
              <Panel title="Assuntos críticos" description={`Menor acerto no período · mín. ${data.meta.min_answers} respostas.`}>
                <TopicList items={data.topics.critical} goal={goal} empty="Nenhum assunto com respostas suficientes." />
              </Panel>
              <Panel title="Assuntos em evolução" description={`Ganho de ${fmtNumber(data.meta.evolution_threshold_pp, 0)} pp ou mais vs. período anterior.`}>
                <TopicList items={data.topics.improving} goal={goal} empty="Nenhum assunto com evolução comparável." showDelta />
              </Panel>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function TopicList({ items, goal, empty, showDelta = false }: { items: BiTopicTrend[]; goal: number; empty: string; showDelta?: boolean }) {
  if (!items.length) return <EmptyState text={empty} />;
  return (
    <View style={{ gap: 10 }}>
      {items.map((t) => (
        <View key={t.topic_id} className="flex-row items-center" style={{ gap: 12, justifyContent: "space-between" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{t.name}</Text>
            <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`${t.subject} · ${t.answers} resp.`}</Text>
          </View>
          <Text className="font-mono text-ink" style={{ fontSize: 12 }}>
            {`${fmtNumber(t.accuracy, 0)}%${t.accuracy < goal ? " ▾" : ""}`}
          </Text>
          {showDelta && t.delta_pp !== null ? (
            <Text className="font-mono text-success" style={{ fontSize: 12, width: 84, textAlign: "right" }}>
              {`▲ +${fmtNumber(t.delta_pp, 1)} pp`}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ paddingVertical: 24, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
