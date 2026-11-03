import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormInput from "../../components/ui/FormInput";
import InfoTip from "../../components/bi/InfoTip";
import RadarChart from "../../components/bi/RadarChart";
import MultiLineChart from "../../components/bi/MultiLineChart";
import Heatmap from "../../components/bi/Heatmap";
import SegmentedControl from "../../components/bi/SegmentedControl";
import InterventionFormModal, { type InterventionPreset } from "../../components/bi/InterventionFormModal";
import { presetRange, type PeriodPreset } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtMetricDelta, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchBiDiagnosis,
  fetchBiMetrics,
  fetchBiStudents,
  type BiDiagnosis,
  type BiDimension,
  type BiDimensionKey,
  type BiFilters,
  type BiMetricDefinition,
  type BiStudentRow,
} from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  studentId?: number | null;
  filters?: BiFilters;
};

const DIMENSIONS: { key: BiDimensionKey; label: string; color: string }[] = [
  { key: "learning", label: "Aprendizagem", color: color["data-1"] },
  { key: "engagement", label: "Engajamento", color: color["data-2"] },
  { key: "preparation", label: "Preparação", color: color["data-3"] },
];

const PRESETS: { value: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "semester", label: "Semestre" },
  { value: "year", label: "Ano letivo" },
];

const REASON_TONE = { below_goal: "danger", declining: "danger", low_attendance: "warning" } as const;

/** Inteligência Educacional › Diagnóstico 360°: escolha do aluno e diagnóstico com as três dimensões. */
export default function BiDiagnosisScreen({ navigate, studentId = null, filters: initialFilters }: Props) {
  return studentId ? (
    <DiagnosisDetail navigate={navigate} studentId={studentId} initialFilters={initialFilters} />
  ) : (
    <StudentPicker navigate={navigate} />
  );
}

function StudentPicker({ navigate }: { navigate: Props["navigate"] }) {
  const { contentPadding } = useResponsiveLayout();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BiStudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      fetchBiStudents(presetRange("90d"), { filter: "all", search: search.trim(), page: 1, perPage: 20 })
        .then((d) => setItems(d.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Inteligência Educacional", onPress: () => navigate("bi-overview") }, { label: "Diagnóstico 360°" }]}
        title="Diagnóstico Pedagógico 360°"
        description="Escolha um aluno para ver Aprendizagem, Engajamento e Preparação comparados com a turma."
        actions={<Button label="Perfis de aprendizagem" onPress={() => navigate("bi-profiles")} />}
      />
      <Panel flush>
        <View className="border-b border-border" style={{ padding: 16 }}>
          <FormInput dense label="Buscar aluno" placeholder="Nome do aluno" value={search} onChangeText={setSearch} />
        </View>
        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={color.brand} />
          </View>
        ) : items.length ? (
          items.map((s, i) => (
            <Pressable
              key={s.student_id}
              accessibilityRole="link"
              onPress={() => navigate("bi-diagnosis", { studentId: s.student_id })}
              className={`flex-row items-center ${i < items.length - 1 ? "border-b border-border" : ""}`}
              style={({ hovered }: any) => [{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }, hovered ? { backgroundColor: color["surface-sunken"] } : null]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-ink" style={{ fontSize: 14 }} numberOfLines={1}>{s.name}</Text>
                <Text className="text-ink-subtle" style={{ fontSize: 12 }} numberOfLines={1}>{s.classes.join(", ") || "—"}</Text>
              </View>
              {s.reasons.length ? <Badge label="Em atenção" tone="warning" dot /> : null}
              <Text className="text-brand font-medium" style={{ fontSize: 13 }}>Abrir 360°</Text>
            </Pressable>
          ))
        ) : (
          <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
            {search ? `Nenhum aluno encontrado para "${search}".` : "Nenhum aluno com matrícula ativa no seu escopo."}
          </Text>
        )}
      </Panel>
    </ScrollView>
  );
}

function DiagnosisDetail({ navigate, studentId, initialFilters }: { navigate: Props["navigate"]; studentId: number; initialFilters?: BiFilters }) {
  const { contentPadding, width } = useResponsiveLayout();
  const [preset, setPreset] = useState<Exclude<PeriodPreset, "custom">>("90d");
  const [filters, setFilters] = useState<BiFilters>(() => initialFilters ?? presetRange("90d"));
  const [definitions, setDefinitions] = useState<Record<string, BiMetricDefinition>>({});
  const [data, setData] = useState<BiDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intervention, setIntervention] = useState<InterventionPreset | null>(null);

  useEffect(() => {
    fetchBiMetrics()
      .then((list) => setDefinitions(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch(() => setDefinitions({}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiDiagnosis(studentId, filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o diagnóstico."));
    } finally {
      setLoading(false);
    }
  }, [studentId, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const wide = width >= 1100;
  const goal = data?.meta.goal_pct ?? 70;
  const student = data?.student;

  const domain = useMemo(() => {
    if (!data) return null;
    const columns = Math.max(0, ...data.domain.map((s) => s.topics.length));
    return {
      topics: Array.from({ length: columns }, (_, i) => ({ topic_id: i + 1, name: String(i + 1) })),
      rows: data.domain.map((s) => ({
        school_class_id: s.subject_id,
        name: s.name,
        answers: s.topics.reduce((sum, t) => sum + t.answers, 0),
        cells: Array.from({ length: columns }, (_, i) => {
          const t = s.topics[i];
          return t
            ? {
                topic_id: i + 1,
                value: t.value,
                answers: t.answers,
                below_goal: t.below_goal,
                label: t.name,
                extra: `turma ${t.class_value === null ? "sem amostra" : `${fmtNumber(t.class_value, 0)}%`}${t.weight ? ` · peso ${t.weight}` : ""}`,
              }
            : { topic_id: i + 1, value: null, answers: 0, below_goal: false, label: "—" };
        }),
      })),
      truncated: false,
    };
  }, [data]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Diagnóstico 360°", onPress: () => navigate("bi-diagnosis") },
          { label: student?.name ?? "Aluno" },
        ]}
        title="Diagnóstico Pedagógico 360°"
        actions={
          <View className="flex-row" style={{ gap: 8 }}>
            <Button label="Evolução do aluno" onPress={() => navigate("bi-student", { studentId, filters })} />
            {data && student ? (
              <Button
                variant="primary"
                label="Registrar intervenção"
                onPress={() => {
                  // Alvo sugerido: o assunto com menor acerto abaixo da meta no domínio.
                  const weakest = data.domain
                    .flatMap((s) => s.topics.filter((t) => t.below_goal && t.value !== null).map((t) => ({ subjectId: s.subject_id, ...t })))
                    .sort((a, b) => (a.value as number) - (b.value as number))[0];
                  setIntervention({
                    students: [{ id: student.id, name: student.name }],
                    reasonCode: student.reasons[0]?.code ?? (weakest ? "below_goal" : "manual"),
                    reasonDetail: weakest ? `${weakest.name} ${fmtNumber(weakest.value as number, 0)}% · meta ${fmtNumber(data.meta.goal_pct, 0)}%` : student.reasons.map((r) => r.detail).join(" · "),
                    subjectId: weakest?.subjectId ?? null,
                    topicId: weakest?.topic_id ?? null,
                    schoolClassId: student.school_class.id,
                  });
                }}
              />
            ) : null}
            <Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />
          </View>
        }
      />

      <View className="bg-surface border border-border rounded-ds-md flex-row flex-wrap" style={{ padding: 16, gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexShrink: 1, gap: 4 }}>
          <Text className="font-semibold text-ink" style={{ fontSize: 18 }}>{student?.name ?? "…"}</Text>
          {student ? (
            <Text className="text-ink-muted" style={{ fontSize: 13 }}>
              {[
                `Turma ${student.school_class.name}`,
                student.course ? `Curso ${student.course}` : null,
                data?.meta.exam_type ? `Objetivo ${data.meta.exam_type.label}` : "Sem concurso alvo no curso",
                `${fmtDate(data!.meta.period.from)} a ${fmtDate(data!.meta.period.to)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
          {student?.reasons.length ? (
            <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 4 }}>
              {student.reasons.map((r) => <Badge key={r.code} label={r.label} tone={REASON_TONE[r.code]} dot />)}
            </View>
          ) : null}
        </View>
        <SegmentedControl
          accessibilityLabel="Período"
          value={preset}
          options={PRESETS}
          onChange={(v) => {
            setPreset(v);
            setFilters(presetRange(v));
          }}
        />
      </View>

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

      {data && student && domain ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {DIMENSIONS.map((d) => (
              <View key={d.key} style={{ width: width >= 1000 ? "33.333%" : "100%", paddingHorizontal: 8 }}>
                <DimensionCard
                  label={d.label}
                  accent={d.color}
                  dimension={data.dimensions[d.key]}
                  definition={definitions[`index.${d.key}`]}
                  footer={
                    d.key === "learning" && data.highlight
                      ? `▼ ${data.highlight.subject} ${fmtNumber(data.highlight.accuracy, 0)}%${data.highlight.topics.length ? ` · ${data.highlight.topics.join(" e ").toLocaleLowerCase("pt-BR")}` : ""}`
                      : d.key === "preparation" && data.meta.priorities_provisional
                        ? "Prioritários provisórios: cadastre os pesos do concurso"
                        : undefined
                  }
                />
              </View>
            ))}
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Radar das três dimensões">
                <RadarChart
                  seriesName={student.name.split(" ")[0]}
                  compareName={`Média da turma ${student.school_class.name}`}
                  axes={DIMENSIONS.map((d) => ({
                    label: d.label,
                    value: data.dimensions[d.key].value,
                    compare: data.dimensions[d.key].class_avg,
                  }))}
                />
              </Panel>
            </View>
            <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Histórico das dimensões" description="Índice mensal · meses sem amostra mínima ficam em branco.">
                <MultiLineChart
                  labels={data.history.map((h) => h.label)}
                  series={DIMENSIONS.map((d) => ({ key: d.key, name: d.label, color: d.color, values: data.history.map((h) => h[d.key]) }))}
                  accessibilityLabel={`Índices mensais de ${student.name}`}
                />
              </Panel>
            </View>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel
                title="Domínio por assunto"
                description={`% de acertos em simulados e banco de questões · colunas = assuntos ${data.meta.priorities_provisional ? "mais respondidos pela turma" : "prioritários do concurso, por peso"}.`}
              >
                {domain.rows.length ? (
                  <View style={{ gap: 12 }}>
                    <Heatmap heatmap={domain} goal={goal} minSample={data.meta.min_topic_answers} tableLabel={`Domínio de ${student.name} por disciplina e assunto`} />
                    <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 12, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
                      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
                        {data.domain.map((s) => `${s.name}: ${s.topics.map((t, i) => `${i + 1} ${t.name}`).join(" · ")}`).join("  |  ")}
                        {". Passe o mouse para ver o assunto, a amostra e a média da turma."}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
                    Nenhuma resposta do aluno em questões classificadas por assunto no período.
                  </Text>
                )}
              </Panel>
            </View>
            <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Recomendações" description="Sugestões por regra, com o dado que gerou cada uma. A decisão é da coordenação.">
                {data.recommendations.length ? (
                  <View style={{ gap: 14 }}>
                    {data.recommendations.map((r, i) => (
                      <View key={`${r.type}${i}`} className={i ? "border-t border-border" : ""} style={{ paddingTop: i ? 14 : 0, gap: 2 }}>
                        <Text className="text-ink font-medium" style={{ fontSize: 14 }}>{r.title}</Text>
                        <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{`${r.category} · motivo: ${r.reason}`}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-ink-subtle" style={{ fontSize: 13 }}>Nenhuma recomendação: indicadores dentro dos critérios da escola.</Text>
                )}
              </Panel>
            </View>
          </View>
        </View>
      ) : null}
      <InterventionFormModal
        visible={intervention !== null}
        preset={intervention ?? undefined}
        onClose={() => setIntervention(null)}
        onCreated={() => navigate("bi-follow-up")}
      />
    </ScrollView>
  );
}

function DimensionCard({
  label,
  accent,
  dimension,
  definition,
  footer,
}: {
  label: string;
  accent: string;
  dimension: BiDimension;
  definition?: BiMetricDefinition;
  footer?: string;
}) {
  const delta = fmtMetricDelta(dimension);
  const trend = dimension.trend;
  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 10, borderTopWidth: 3, borderTopColor: accent }}>
      <View className="flex-row items-center" style={{ justifyContent: "space-between", gap: 8 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: accent }} />
          <Text className="font-semibold text-ink" style={{ fontSize: 14 }}>{label}</Text>
          {definition ? <InfoTip title={definition.name} lines={[definition.description, `Cálculo: ${definition.formula}.`, definition.missing]} /> : null}
        </View>
        {delta && trend && trend !== "stable" ? (
          <Text className={`font-mono ${trend === "up" ? "text-success" : "text-danger"}`} style={{ fontSize: 12 }}>
            {`${trend === "up" ? "▲ +" : "▼ −"}${delta}`}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-end" style={{ justifyContent: "space-between" }}>
        <Text className="font-mono font-semibold text-ink" style={{ fontSize: 28, lineHeight: 34 }}>
          {dimension.value === null ? "—" : fmtNumber(dimension.value, 0)}
          <Text className="text-ink-subtle" style={{ fontSize: 13 }}>{" / 100"}</Text>
        </Text>
        <Text className="text-ink-muted" style={{ fontSize: 12 }}>
          {`turma: ${dimension.class_avg === null ? "—" : fmtNumber(dimension.class_avg, 0)}`}
        </Text>
      </View>
      <View className="bg-surface-sunken" style={{ height: 6, borderRadius: 2, position: "relative" }}>
        {dimension.value !== null ? (
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${dimension.value}%`, backgroundColor: accent, borderRadius: 2 }} />
        ) : null}
        {dimension.class_avg !== null ? (
          <View style={{ position: "absolute", top: -4, bottom: -4, left: `${dimension.class_avg}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color.ink }} />
        ) : null}
      </View>
      {dimension.value === null ? (
        <Text className="text-ink-subtle" style={{ fontSize: 12 }}>Amostra insuficiente: precisa de 2 componentes com dados.</Text>
      ) : null}
      <View style={{ gap: 4 }}>
        {dimension.components.map((c) => (
          <View key={c.key} className="flex-row" style={{ justifyContent: "space-between", gap: 8 }}>
            <Text className="text-ink-muted" style={{ fontSize: 12, flexShrink: 1 }}>{c.label}</Text>
            <Text className={`font-mono ${c.sufficient ? "text-ink" : "text-ink-subtle"}`} style={{ fontSize: 12 }}>
              {!c.sufficient
                ? `— (n=${c.n})`
                : c.key === "regularity" && c.raw !== null
                  ? `${fmtNumber(c.raw, 1)} dias/sem.`
                  : c.key === "trend" && c.raw !== null
                    ? `${c.raw >= 0 ? "+" : "−"}${fmtNumber(Math.abs(c.raw), 1)} pp`
                    : `${fmtNumber(c.value as number, 0)}%`}
            </Text>
          </View>
        ))}
      </View>
      {footer ? <Text className={footer.startsWith("▼") ? "text-danger" : "text-ink-subtle"} style={{ fontSize: 12 }}>{footer}</Text> : null}
    </View>
  );
}
