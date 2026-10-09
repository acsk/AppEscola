import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Tabs from "../../ui/Tabs";
import FormSelect from "../../ui/FormSelect";
import Pagination from "../../ui/Pagination";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  fetchPracticeRanking,
  type PracticeRankingCriterion,
  type PracticeRankingPeriod,
  type PracticeRankingRow,
} from "../../../services/questionSets";
import type { TaxonomySubject } from "../../../types/questionBank";
import { getApiErrorMessage } from "../../../utils/apiErrors";

const PERIODOS: { id: PracticeRankingPeriod; label: string }[] = [
  { id: "week", label: "Esta semana" },
  { id: "last_week", label: "Semana anterior" },
  { id: "month", label: "Últimos 30 dias" },
  { id: "all", label: "Geral" },
];

const MODOS: { id: Extract<PracticeRankingCriterion, "wilson" | "dedication">; label: string }[] = [
  { id: "wilson", label: "🏆 Desempenho" },
  { id: "dedication", label: "🔥 Dedicação" },
];

const AJUDA = {
  wilson: "Limite inferior do intervalo de Wilson com 95% de confiança. Conta só a primeira tentativa de cada questão, e apenas se essa primeira vez foi neste período. Repetir a questão não muda a pontuação.",
  dedication: "Questões inéditas valem 1 ponto e cada dia com estudo vale 5. Repetir uma questão não soma ponto.",
};

const medalha = (pos: number) => (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null);
const pontos = (score: number) => score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

type Props = { visible: boolean; onClose: () => void; taxonomy?: TaxonomySubject[] };

/** Participação (quem mais respondeu) e desempenho (Wilson Score) do banco de questões. */
export default function PracticeRankingModal({ visible, onClose, taxonomy = [] }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [criterion, setCriterion] = useState<Extract<PracticeRankingCriterion, "wilson" | "dedication">>("wilson");
  const [period, setPeriod] = useState<PracticeRankingPeriod>("month");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PracticeRankingRow[]>([]);
  const [participants, setParticipants] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ajuda, setAjuda] = useState(false);

  const desempenho = criterion === "wilson";
  const topics = subjectId ? taxonomy.find((s) => s.id === subjectId)?.topics ?? [] : taxonomy.flatMap((s) => s.topics);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await fetchPracticeRanking(period, { criterion, subjectId, topicId, page, perPage: 20 });
      setRows(body.ranking);
      setParticipants(body.participants);
      setLastPage(body.last_page ?? 1);
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar o ranking."));
    } finally {
      setLoading(false);
    }
  }, [criterion, period, subjectId, topicId, page]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  return (
    <Modal visible={visible} title="Ranking do banco de questões" onClose={onClose} size="lg" maxHeight="90%"
      footer={<Button label="Fechar" onPress={onClose} />}>
      <View style={{ gap: 14 }}>
        <Tabs items={MODOS} value={criterion} onChange={(id) => { setCriterion(id); setPage(1); }} accessibilityLabel="Tipo de ranking" />
        <Text className="text-sm text-ink-muted">
          {desempenho
            ? "Desempenho pela primeira tentativa de cada questão. Retentativa não aumenta a pontuação. A semana vai de segunda a domingo."
            : "Dedicação por questões inéditas e dias com estudo. Repetir uma questão não soma ponto. A semana vai de segunda a domingo."}
        </Text>
        <Tabs items={PERIODOS} value={period} onChange={(id) => { setPeriod(id); setPage(1); }} accessibilityLabel="Período do ranking" />

        <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FormSelect dense label="Disciplina" value={subjectId ?? ""} onChange={(value) => { setSubjectId(value ? Number(value) : null); setTopicId(null); setPage(1); }}
                options={[{ value: "", label: "Todas" }, ...taxonomy.map((s) => ({ value: String(s.id), label: s.name }))]} />
            </View>
            <View style={{ flex: 1 }}>
              <FormSelect dense label="Assunto" value={topicId ?? ""} onChange={(value) => { setTopicId(value ? Number(value) : null); setPage(1); }}
                options={[{ value: "", label: "Todos" }, ...topics.map((t) => ({ value: String(t.id), label: t.name }))]} />
            </View>
          </View>

        {loading ? (
          <View className="py-10 items-center"><ActivityIndicator color="var(--ds-brand)" /></View>
        ) : loadError ? (
          <View className="py-8 items-center" style={{ gap: 10 }}>
            <Text className="text-sm text-danger text-center">{loadError}</Text>
            <Button label="Tentar novamente" variant="secondary" onPress={() => void load()} />
          </View>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-ink-subtle py-8 text-center">Nenhum aluno entrou no ranking neste período.</Text>
        ) : (
          <>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
              <Text className="text-xs text-ink-subtle">{participants} aluno(s) no período.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Como a pontuação é calculada" accessibilityHint={AJUDA[criterion]}
                onPress={() => setAjuda((v) => !v)} {...{ title: AJUDA[criterion] }}>
                <Text className="text-xs font-semibold text-brand">Pontuação</Text>
              </Pressable>
            </View>
            {ajuda ? <Text className="text-xs text-ink-muted" style={{ lineHeight: 18 }}>{AJUDA[criterion]}</Text> : null}
            {!isMobile ? (
              <View className="flex-row px-3" style={{ gap: 8 }}>
                <Text className="text-xs text-ink-subtle" style={{ width: 72 }}>Posição</Text>
                <Text className="text-xs text-ink-subtle" style={{ flex: 1 }}>Aluno</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 88, textAlign: "right" }}>{desempenho ? "Questões" : "Inéditas"}</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 64, textAlign: "right" }}>{desempenho ? "Acertos" : "Dias"}</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 110, textAlign: "right" }}>{desempenho ? "Aproveitamento" : "Seguidos"}</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 120, textAlign: "right" }}>Pontuação</Text>
              </View>
            ) : null}
            <View className="border border-border rounded-ds-md">
              {rows.map((row, i) => (
                <LinhaRanking key={row.student_id ?? `${row.position}-${row.name}`} row={row} first={i === 0} mobile={isMobile}
                  mode={criterion} maxScore={Math.max(1, ...rows.map((item) => item.score ?? 0))} />
              ))}
            </View>
            <Pagination currentPage={page} lastPage={lastPage} total={participants} perPage={20} onPageChange={setPage} />
          </>
        )}
      </View>
    </Modal>
  );
}

function LinhaRanking({ row, first, mobile, mode, maxScore }: { row: PracticeRankingRow; first: boolean; mobile: boolean; mode: "wilson" | "dedication"; maxScore: number }) {
  const score = row.score ?? 0;
  const medal = medalha(row.position);
  const fundo = row.position === 1 ? "bg-accent-tint" : row.position <= 3 ? "bg-brand-tint" : "";
  const largura = mode === "dedication" ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : Math.max(0, Math.min(100, score));
  const detalhe = mode === "dedication"
    ? `${row.questions} inéditas · ${row.active_days ?? 0} dias · ${row.streak ?? 0} seguidos`
    : `${row.questions} questões · ${row.first_attempt_correct ?? row.correct} acertos · ${pct(row.accuracy)}`;
  return (
    <View className={`px-3 py-3 ${first ? "" : "border-t border-border"} ${fundo}`} style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text accessibilityLabel={`${row.position}º lugar`} className="font-mono text-base font-semibold text-ink" style={{ width: mobile ? 64 : 72 }}>
          {medal ? `${medal} ` : ""}{row.position}º
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{row.name}</Text>
          {row.enrollment_number ? <Text className="text-xs text-ink-muted">Matrícula {row.enrollment_number}</Text> : null}
          {(row.retakes ?? 0) > 0 ? <Text className="text-xs text-ink-subtle">{row.retakes} retentativas fora da pontuação</Text> : null}
        </View>
        {mobile ? (
          <Text className="font-mono text-base font-semibold text-ink">{mode === "dedication" ? score : pontos(score)}</Text>
        ) : mode === "dedication" ? (
          <>
            <Text className="font-mono text-sm text-ink" style={{ width: 88, textAlign: "right" }}>{row.questions}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 64, textAlign: "right" }}>{row.active_days ?? 0}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 110, textAlign: "right" }}>{row.streak ?? 0}</Text>
            <Text className="font-mono text-sm font-semibold text-ink" style={{ width: 120, textAlign: "right" }}>{score}</Text>
          </>
        ) : (
          <>
            <Text className="font-mono text-sm text-ink" style={{ width: 88, textAlign: "right" }}>{row.questions}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 64, textAlign: "right" }}>{row.first_attempt_correct ?? row.correct}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 110, textAlign: "right" }}>{pct(row.accuracy)}</Text>
            <Text className="font-mono text-sm font-semibold text-ink" style={{ width: 120, textAlign: "right" }}>{pontos(score)}</Text>
          </>
        )}
      </View>
      {mobile ? <Text className="text-xs text-ink-muted">{detalhe}</Text> : null}
      <View className="rounded-full bg-surface-sunken" style={{ height: 6, overflow: "hidden" }}>
        <View className="bg-brand" style={{ height: 6, width: `${largura}%` }} />
      </View>
    </View>
  );
}
