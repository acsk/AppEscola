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

const PARTICIPACAO: { id: PracticeRankingPeriod; label: string }[] = [
  { id: "week", label: "Esta semana" },
  { id: "last_week", label: "Semana anterior" },
  { id: "month", label: "Últimos 30 dias" },
  { id: "all", label: "Desde o início" },
];

const DESEMPENHO: { id: PracticeRankingPeriod; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "month", label: "30 dias" },
  { id: "all", label: "Geral" },
];

const MODOS: { id: PracticeRankingCriterion; label: string }[] = [
  { id: "participation", label: "Participação" },
  { id: "wilson", label: "Desempenho" },
];

const AJUDA = "Limite inferior do intervalo de Wilson com 95% de confiança. Combina o percentual de acertos com a quantidade de questões, para que poucas respostas certas não passem na frente de quem praticou mais.";

const medalha = (pos: number) => (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null);
const pontos = (score: number) => score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

type Props = { visible: boolean; onClose: () => void; taxonomy?: TaxonomySubject[] };

/** Participação (quem mais respondeu) e desempenho (Wilson Score) do banco de questões. */
export default function PracticeRankingModal({ visible, onClose, taxonomy = [] }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [criterion, setCriterion] = useState<PracticeRankingCriterion>("participation");
  const [period, setPeriod] = useState<PracticeRankingPeriod>("month");
  const [wilsonPeriod, setWilsonPeriod] = useState<PracticeRankingPeriod>("month");
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
  const periodos = desempenho ? DESEMPENHO : PARTICIPACAO;
  const periodoAtivo = desempenho ? wilsonPeriod : period;
  const topics = subjectId ? taxonomy.find((s) => s.id === subjectId)?.topics ?? [] : taxonomy.flatMap((s) => s.topics);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await fetchPracticeRanking(
        desempenho ? wilsonPeriod : period,
        50,
        desempenho ? { subjectId, topicId, page, perPage: 20 } : undefined,
      );
      setRows(body.ranking);
      setParticipants(body.participants);
      setLastPage(body.last_page ?? 1);
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar o ranking."));
    } finally {
      setLoading(false);
    }
  }, [desempenho, period, wilsonPeriod, subjectId, topicId, page]);

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
            ? "Desempenho pela pontuação de Wilson. Cada questão entra uma vez, pela primeira resposta válida no período. No app, o aluno vê o próprio nome abreviado e a posição destacada."
            : "Alunos que mais responderam questões diferentes no app (prática avulsa e simulados do banco finalizados). Repetir a mesma questão não sobe posição; empates são decididos pelos acertos. No app, os alunos veem o nome abreviado. A semana vai de segunda a domingo e reinicia toda segunda às 00h; \"Semana anterior\" mostra o resultado já fechado."}
        </Text>
        <Tabs items={periodos} value={periodoAtivo} onChange={(id) => { if (desempenho) setWilsonPeriod(id); else setPeriod(id); setPage(1); }} accessibilityLabel="Período do ranking" />

        {desempenho ? (
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
        ) : null}

        {loading ? (
          <View className="py-10 items-center"><ActivityIndicator color="var(--ds-brand)" /></View>
        ) : loadError ? (
          <View className="py-8 items-center" style={{ gap: 10 }}>
            <Text className="text-sm text-danger text-center">{loadError}</Text>
            <Button label="Tentar novamente" variant="secondary" onPress={() => void load()} />
          </View>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-ink-subtle py-8 text-center">Nenhum aluno respondeu questões do banco neste período.</Text>
        ) : desempenho ? (
          <>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
              <Text className="text-xs text-ink-subtle">{participants} aluno(s) no período.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Como a pontuação é calculada" accessibilityHint={AJUDA}
                onPress={() => setAjuda((v) => !v)} {...{ title: AJUDA }}>
                <Text className="text-xs font-semibold text-brand">Pontuação</Text>
              </Pressable>
            </View>
            {ajuda ? <Text className="text-xs text-ink-muted" style={{ lineHeight: 18 }}>{AJUDA}</Text> : null}
            {!isMobile ? (
              <View className="flex-row px-3" style={{ gap: 8 }}>
                <Text className="text-xs text-ink-subtle" style={{ width: 72 }}>Posição</Text>
                <Text className="text-xs text-ink-subtle" style={{ flex: 1 }}>Aluno</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 88, textAlign: "right" }}>Respondidas</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 64, textAlign: "right" }}>Acertos</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 110, textAlign: "right" }}>Aproveitamento</Text>
                <Text className="text-xs text-ink-subtle" style={{ width: 120, textAlign: "right" }}>Pontuação</Text>
              </View>
            ) : null}
            <View className="border border-border rounded-ds-md">
              {rows.map((row, i) => <LinhaWilson key={row.student_id ?? `${row.position}-${row.name}`} row={row} first={i === 0} mobile={isMobile} />)}
            </View>
            <Pagination currentPage={page} lastPage={lastPage} total={participants} perPage={20} onPageChange={setPage} />
          </>
        ) : (
          <>
            <Text className="text-xs text-ink-subtle">{participants} aluno(s) participaram no período.</Text>
            <View className="border border-border rounded-ds-md">
              {rows.map((row, i) => (
                <View key={row.student_id} className={`px-3 py-3 flex-row items-center ${i > 0 ? "border-t border-border" : ""}`}
                  style={{ gap: 12 }}>
                  <Text className="font-mono text-base font-semibold text-ink" style={{ width: 36, textAlign: "right" }}>
                    {row.position}º
                  </Text>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{row.name}</Text>
                    {row.enrollment_number ? <Text className="text-xs text-ink-muted">Matrícula {row.enrollment_number}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", minWidth: isMobile ? 90 : 160 }}>
                    <Text className="text-sm font-semibold text-ink">{row.questions} questões</Text>
                    <Text className="text-xs text-ink-muted">
                      {row.accuracy === null ? "—" : `${row.accuracy.toLocaleString("pt-BR")}% de acerto`}
                      {isMobile ? "" : ` · ${row.answered} resposta(s)`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function LinhaWilson({ row, first, mobile }: { row: PracticeRankingRow; first: boolean; mobile: boolean }) {
  const score = row.score ?? 0;
  const medal = medalha(row.position);
  const fundo = row.position === 1 ? "bg-accent-tint" : row.position <= 3 ? "bg-brand-tint" : "";
  return (
    <View className={`px-3 py-3 ${first ? "" : "border-t border-border"} ${fundo}`} style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text accessibilityLabel={medal ? `${row.position}º lugar` : `${row.position}º lugar`} className="font-mono text-base font-semibold text-ink" style={{ width: mobile ? 64 : 72 }}>
          {medal ? `${medal} ` : ""}{row.position}º
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{row.name}</Text>
          {row.enrollment_number ? <Text className="text-xs text-ink-muted">Matrícula {row.enrollment_number}</Text> : null}
        </View>
        {mobile ? (
          <Text className="font-mono text-base font-semibold text-ink">{pontos(score)}</Text>
        ) : (
          <>
            <Text className="font-mono text-sm text-ink" style={{ width: 88, textAlign: "right" }}>{row.answered}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 64, textAlign: "right" }}>{row.correct}</Text>
            <Text className="font-mono text-sm text-ink" style={{ width: 110, textAlign: "right" }}>{pct(row.accuracy)}</Text>
            <Text className="font-mono text-sm font-semibold text-ink" style={{ width: 120, textAlign: "right" }}>{pontos(score)}</Text>
          </>
        )}
      </View>
      {mobile ? (
        <Text className="text-xs text-ink-muted">{row.answered} respondidas · {row.correct} acertos · {pct(row.accuracy)} de aproveitamento</Text>
      ) : null}
      <View className="rounded-full bg-surface-sunken" style={{ height: 6, overflow: "hidden" }}>
        <View className="bg-brand" style={{ height: 6, width: `${Math.max(0, Math.min(100, score))}%` }} />
      </View>
    </View>
  );
}
