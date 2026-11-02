import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import MetricCard from "../../components/bi/MetricCard";
import LineChart from "../../components/bi/LineChart";
import DifficultyBars from "../../components/bi/DifficultyBars";
import SegmentedControl from "../../components/bi/SegmentedControl";
import { overviewTiles } from "../../components/bi/overviewTiles";
import StudentRosterTable from "../../components/bi/StudentRosterTable";
import { presetRange } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiClass,
  fetchBiMetrics,
  fetchBiOverview,
  type BiClassDetail,
  type BiFilters,
  type BiMetricDefinition,
  type BiModality,
  type BiOverview,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  schoolClassId: number;
  /** Filtros da lista de origem; sem eles (ex.: link direto), últimos 90 dias. */
  filters?: BiFilters;
};

/** Inteligência Educacional › Análise de turmas › turma: indicadores da visão geral recortados + alunos. */
export default function BiClassDetailScreen({ navigate, schoolClassId, filters: initialFilters }: Props) {
  const { contentPadding, width } = useResponsiveLayout();
  const filters = useMemo<BiFilters>(
    () => ({ ...(initialFilters ?? presetRange("90d")), school_class_id: schoolClassId }),
    [initialFilters, schoolClassId]
  );
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [overview, setOverview] = useState<BiOverview | null>(null);
  const [detail, setDetail] = useState<BiClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modality, setModality] = useState<BiModality>("online");

  useEffect(() => {
    fetchBiMetrics()
      .then((list) => setDefinitions(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setDefinitions({}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, d] = await Promise.all([fetchBiOverview(filters), fetchBiClass(schoolClassId, filters)]);
      setOverview(o);
      setDetail(d);
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a turma."));
    } finally {
      setLoading(false);
    }
  }, [filters, schoolClassId]);

  useEffect(() => {
    load();
  }, [load]);

  const metric = (key: string) => overview?.metrics.find((m) => m.key === key);
  const goal = overview?.meta.goal_pct ?? 70;
  const columns = width >= 1200 ? 4 : width >= 768 ? 2 : 1;
  const wide = width >= 1100;
  const points = useMemo(
    () => (overview?.monthly ?? []).map((p) => ({ label: p.label, value: p[modality].value, n: p[modality].students })),
    [overview, modality]
  );
  const sc = detail?.school_class;
  const students = detail?.students.items ?? [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Análise de turmas", onPress: () => navigate("bi-classes") },
          { label: sc?.name ?? "Turma" },
        ]}
        title={sc?.name ?? "Turma"}
        description={
          sc
            ? [sc.course, sc.year, sc.teachers.length ? `Professores: ${sc.teachers.join(", ")}` : null].filter(Boolean).join(" · ")
            : undefined
        }
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
        {`Período: ${fmtDate(filters.from ?? "")} a ${fmtDate(filters.to ?? "")}, comparado ao período anterior de mesma duração.`}
      </Text>

      {error ? (
        <Panel>
          <View style={{ alignItems: "flex-start", gap: 12 }}>
            <Text className="text-danger" style={{ fontSize: 14 }}>{error}</Text>
            <Button label="Tentar novamente" onPress={load} />
          </View>
        </Panel>
      ) : null}

      {loading && !overview ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      ) : null}

      {overview && detail ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {overviewTiles(metric).map((tile) => (
              <View key={tile.key} style={{ width: `${100 / columns}%`, paddingHorizontal: 8 }}>
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

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel
                title="Evolução da turma"
                description="Média mensal em % da nota máxima · modalidades separadas."
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
                    accessibilityLabel={`Média ${modality} da turma por mês`}
                  />
                ) : (
                  <EmptyState text={`Nenhuma avaliação ${modality} da turma no período.`} />
                )}
              </Panel>
            </View>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Disciplinas com maior dificuldade" description="% de acertos · simulados online e banco, 1ª tentativa.">
                {overview.subjects_difficulty.length ? (
                  <DifficultyBars
                    items={overview.subjects_difficulty}
                    goal={goal}
                    onSelect={(id) => navigate("bi-subjects", { subjectId: id })}
                  />
                ) : (
                  <EmptyState text="Nenhuma disciplina com respostas suficientes no período." />
                )}
              </Panel>
            </View>
          </View>

          <Panel
            title="Alunos da turma"
            description={`${detail.students.total} aluno(s) · ${detail.students.needs_support} em atenção primeiro. Médias individuais exigem ${detail.meta.min_student_results} avaliações; banco, ${detail.meta.min_practice_answers} respostas; frequência, ${detail.meta.min_attendance_records} chamadas.`}
            flush
          >
            {students.length ? (
              <StudentRosterTable
                students={students}
                goal={goal}
                ariaLabel="Alunos da turma"
                action={{ label: "Ver evolução", onPress: (id) => navigate("bi-student", { studentId: id, filters }) }}
              />
            ) : (
              <View style={{ padding: 24 }}>
                <EmptyState text="Nenhum aluno ativo na turma no período." />
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
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
