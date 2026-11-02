import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import PctBars from "../../components/bi/PctBars";
import ScoreHistogram from "../../components/bi/ScoreHistogram";
import { presetRange } from "../../components/bi/BiFilterBar";
import { fmtDate, fmtNumber } from "../../components/bi/format";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiAssessment, type BiAssessmentDetail, type BiFilters, type BiModality } from "../../services/biService";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  modality: BiModality;
  assessmentId: number;
  /** Filtros da lista de origem; sem eles (ex.: link direto), últimos 90 dias. */
  filters?: BiFilters;
};

const pct = (value: number | null, decimals = 1) => (value === null ? "—" : `${fmtNumber(value, decimals)}%`);

/** Inteligência Educacional › Análise de simulados › avaliação: distribuição, turmas, disciplinas, assuntos e alunos. */
export default function BiAssessmentDetailScreen({ navigate, modality, assessmentId, filters: initialFilters }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const [filters] = useState<BiFilters>(() => initialFilters ?? presetRange("90d"));
  const [data, setData] = useState<BiAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchBiAssessment(modality, assessmentId, filters));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a avaliação."));
    } finally {
      setLoading(false);
    }
  }, [modality, assessmentId, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const goal = data?.meta.goal_pct ?? 70;
  const stats = data?.stats;
  const wide = width >= 1100;
  const header = data?.assessment;
  const minSample = data?.meta.min_sample ?? 5;

  const tiles = stats
    ? [
        { label: "Participantes", value: stats.participants.toLocaleString("pt-BR"), hint: stats.absent !== null ? `${stats.absent} falta(s), fora da média` : "1ª tentativa concluída" },
        { label: "Média", value: pct(stats.avg), hint: stats.avg !== null && stats.avg < goal ? "▾ abaixo da meta" : `meta ${fmtNumber(goal, 0)}%` },
        { label: "Mediana", value: pct(stats.median), hint: stats.min !== null ? `mín. ${pct(stats.min, 0)} · máx. ${pct(stats.max, 0)}` : undefined },
        { label: "Na meta ou acima", value: pct(stats.at_goal_pct), hint: "dos participantes" },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[
          { label: "Inteligência Educacional", onPress: () => navigate("bi-overview") },
          { label: "Análise de simulados", onPress: () => navigate("bi-assessments") },
          { label: header?.title ?? "Avaliação" },
        ]}
        title={header?.title ?? "Avaliação"}
        description={
          header
            ? [
                header.school_class,
                header.exam_type,
                header.date ? (header.date_to && header.date_to !== header.date ? `${fmtDate(header.date)} a ${fmtDate(header.date_to)}` : fmtDate(header.date)) : null,
                header.max_score ? `nota máxima ${fmtNumber(header.max_score, 1)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        titleAddon={<Badge label={modality === "online" ? "Online" : "Presencial"} tone={modality === "online" ? "brand" : "neutral"} />}
        actions={<Button icon={RefreshCw} label="Atualizar" onPress={load} loading={loading} />}
      />

      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
        {`Resultados de ${fmtDate(filters.from ?? "")} a ${fmtDate(filters.to ?? "")}, nas turmas do seu escopo e filtros da lista.`}
      </Text>

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

      {data && stats ? (
        <View style={{ gap: 24, opacity: loading ? 0.6 : 1 }}>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, rowGap: 16 }}>
            {tiles.map((tile) => (
              <View key={tile.label} style={{ width: `${100 / (width >= 1100 ? 4 : width >= 600 ? 2 : 1)}%`, paddingHorizontal: 8 }}>
                <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 4 }}>
                  <Text className="text-ink-muted" style={{ fontSize: 13 }}>{tile.label}</Text>
                  <Text className="font-mono font-semibold text-ink" style={{ fontSize: 24, lineHeight: 30 }}>{tile.value}</Text>
                  {tile.hint ? <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{tile.hint}</Text> : null}
                </View>
              </View>
            ))}
          </View>
          {!stats.sufficient && stats.participants > 0 ? (
            <Text className="text-ink-muted" style={{ fontSize: 12 }}>
              {`Média, mediana e % na meta exigem ao menos ${minSample} participantes; com ${stats.participants}, aparecem como "—".`}
            </Text>
          ) : null}

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Distribuição dos resultados" description="Quantos alunos em cada faixa de 10 pontos percentuais.">
                {stats.participants ? <ScoreHistogram bins={data.histogram} goal={goal} /> : <EmptyState text="Nenhum resultado no recorte." />}
              </Panel>
            </View>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel
                title="Desempenho por disciplina"
                description={modality === "online" ? "Pontos obtidos ÷ pontos possíveis, 1ª tentativa." : "Média das notas lançadas ÷ nota máxima; faltas fora."}
              >
                {data.subjects.length ? (
                  <PctBars
                    goal={goal}
                    items={data.subjects.map((s) => ({
                      key: s.subject_id,
                      label: s.name,
                      sublabel: s.questions !== null ? `${s.questions} questão(ões)` : undefined,
                      value: s.pct,
                      note: `n=${s.participants}`,
                    }))}
                  />
                ) : (
                  <EmptyState text="Sem disciplina associada às questões ou notas desta avaliação." />
                )}
              </Panel>
            </View>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
              <Panel title="Comparação entre turmas" description="Aluno em duas turmas conta nas duas." flush>
                {data.classes.length ? (
                  <View role="table" aria-label="Média por turma">
                    <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 2 }}>Turma</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 96, textAlign: "right" }}>Participantes</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 64, textAlign: "right" }}>Média</Text>
                      <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 72, textAlign: "right" }}>Mediana</Text>
                    </View>
                    {data.classes.map((c, i) => (
                      <View key={c.school_class_id} className={`flex-row items-center ${i < data.classes.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
                        <Text className="text-ink" style={{ fontSize: 14, flex: 2 }} numberOfLines={1}>{c.name}</Text>
                        <Text className="font-mono text-ink" style={{ fontSize: 12, width: 96, textAlign: "right" }}>{c.participants}</Text>
                        <Text className={`font-mono ${c.avg === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 64, textAlign: "right" }}>
                          {c.avg === null ? "—" : `${fmtNumber(c.avg, 0)}%${c.avg < goal ? " ▾" : ""}`}
                        </Text>
                        <Text className={`font-mono ${c.median === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 72, textAlign: "right" }}>
                          {c.median === null ? "—" : `${fmtNumber(c.median, 0)}%`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ padding: 24 }}>
                    <EmptyState text="Nenhuma turma com resultado." />
                  </View>
                )}
              </Panel>
            </View>
            {modality === "online" ? (
              <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", minWidth: 0 }}>
                <Panel title="Assuntos com menor acerto" description="Respostas objetivas da 1ª tentativa; assuntos com ao menos 5 respostas.">
                  {data.topics.length ? (
                    <PctBars
                      goal={goal}
                      items={data.topics.map((t) => ({ key: t.topic_id, label: t.name, sublabel: t.subject, value: t.accuracy, note: `${t.answers} resp.` }))}
                    />
                  ) : (
                    <EmptyState text="Nenhum assunto com respostas suficientes (as questões precisam estar classificadas por assunto)." />
                  )}
                </Panel>
              </View>
            ) : null}
          </View>

          <Panel
            title="Alunos"
            description={`Do menor para o maior resultado.${data.students.total > data.students.items.length ? ` Mostrando ${data.students.items.length} de ${data.students.total}.` : ""}`}
            flush
          >
            {data.students.items.length ? (
              <ScrollView horizontal={isMobile} contentContainerStyle={{ minWidth: isMobile ? 600 : "100%" }}>
                <View style={{ width: "100%" }} role="table" aria-label="Resultado por aluno">
                  <View className="flex-row bg-surface-sunken border-b border-border" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 2 }}>Aluno</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1 }}>Turma</Text>
                    <Text className="font-medium text-ink-muted" style={{ fontSize: 12, width: 80, textAlign: "right" }}>Resultado</Text>
                    <View style={{ width: 140 }} />
                  </View>
                  {data.students.items.map((s, i) => (
                    <View key={s.student_id} className={`flex-row items-center ${i < data.students.items.length - 1 ? "border-b border-border" : ""}`} style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
                      <Text className="text-ink" style={{ fontSize: 14, flex: 2 }} numberOfLines={1}>{s.name}</Text>
                      <Text className="text-ink-muted" style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>{s.classes.join(", ") || "—"}</Text>
                      <Text className={`font-mono ${s.below_goal ? "text-danger" : "text-ink"}`} style={{ fontSize: 12, width: 80, textAlign: "right" }}>
                        {`${fmtNumber(s.pct, 0)}%${s.below_goal ? " ▾" : ""}`}
                      </Text>
                      <View style={{ width: 140, alignItems: "flex-end" }}>
                        <Button size="sm" label="Ver desempenho" onPress={() => navigate("alunos-performance", { studentId: s.student_id })} />
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={{ padding: 24 }}>
                <EmptyState text="Nenhum aluno do seu escopo com resultado nesta avaliação no período." />
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
