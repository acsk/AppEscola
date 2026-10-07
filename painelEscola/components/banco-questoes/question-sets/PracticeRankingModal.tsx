import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Tabs from "../../ui/Tabs";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { fetchPracticeRanking, type PracticeRankingPeriod, type PracticeRankingRow } from "../../../services/questionSets";
import { getApiErrorMessage } from "../../../utils/apiErrors";

const PERIODS: { id: PracticeRankingPeriod; label: string }[] = [
  { id: "week", label: "Últimos 7 dias" },
  { id: "month", label: "Últimos 30 dias" },
  { id: "all", label: "Desde o início" },
];

type Props = { visible: boolean; onClose: () => void };

/** Ranking de participação: alunos que mais responderam questões diferentes no banco (prática e simulados do banco). */
export default function PracticeRankingModal({ visible, onClose }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [period, setPeriod] = useState<PracticeRankingPeriod>("month");
  const [rows, setRows] = useState<PracticeRankingRow[]>([]);
  const [participants, setParticipants] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await fetchPracticeRanking(period);
      setRows(body.ranking);
      setParticipants(body.participants);
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar o ranking."));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  return (
    <Modal visible={visible} title="Ranking do banco de questões" onClose={onClose} size="lg" maxHeight="90%"
      footer={<Button label="Fechar" onPress={onClose} />}>
      <View style={{ gap: 14 }}>
        <Text className="text-sm text-ink-muted">
          Alunos que mais responderam questões diferentes no app (prática avulsa e simulados do banco finalizados).
          Repetir a mesma questão não sobe posição; empates são decididos pelos acertos. No app, os alunos veem o nome abreviado.
        </Text>
        <Tabs items={PERIODS} value={period} onChange={setPeriod} accessibilityLabel="Período do ranking" />

        {loading ? (
          <View className="py-10 items-center"><ActivityIndicator color="var(--ds-brand)" /></View>
        ) : loadError ? (
          <View className="py-8 items-center" style={{ gap: 10 }}>
            <Text className="text-sm text-danger text-center">{loadError}</Text>
            <Button label="Tentar novamente" onPress={() => void load()} />
          </View>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-ink-subtle py-8 text-center">Nenhum aluno respondeu questões do banco neste período.</Text>
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
