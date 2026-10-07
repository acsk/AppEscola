import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ArrowRight, Pencil } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import RichText from "../../components/ui/RichText";
import ToastBanner from "../../components/ui/ToastBanner";
import DefinitionRows from "../../components/ui/DefinitionRows";
import QuestionStatusBadge from "../../components/banco-questoes/QuestionStatusBadge";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { fetchQuestionBankIds, fetchQuestionBankQuestion } from "../../services/questionBank";
import { getApiErrorMessage, showApiErrorToast } from "../../utils/apiErrors";
import { parseListState, toApiParams } from "../../utils/questionBankQuery";
import type { QuestionBankQuestion } from "../../types/questionBank";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  questionId: number;
  /** Query da listagem de origem (filtros, aba e ordem) — usada no "Próxima" e no voltar. */
  listQuery?: string;
};

const OPTION_LETTERS = "ABCDEFGHIJ";

/**
 * Visualização da questão (conteúdo + classificação, só leitura).
 * Classificar e gerar semelhantes ficam na edição (QuestionEditScreen).
 */
export default function QuestionClassifyScreen({ navigate, questionId, listQuery = "" }: Props) {
  const { isMobile, contentPadding } = useResponsiveLayout();

  const [question, setQuestion] = useState<QuestionBankQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [goingNext, setGoingNext] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setQuestion(await fetchQuestionBankQuestion(questionId));
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar a questão."));
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const goToList = () => navigate("questoes", { query: listQuery });
  const goToEdit = () => navigate("questoes-editar", { questionId, query: listQuery });

  /** Próxima questão da mesma listagem (filtros, aba e ordem de origem). */
  const goToNext = async () => {
    setGoingNext(true);
    try {
      const { ids } = await fetchQuestionBankIds(toApiParams(parseListState(listQuery), { paginate: false }));
      const index = ids.indexOf(questionId);
      const nextId = index >= 0 ? ids[index + 1] : ids.find((id) => id !== questionId);
      if (nextId) navigate("questoes-classificar", { questionId: nextId, query: listQuery });
      else setToast({ visible: true, type: "success", message: "Fim da lista: não há próxima questão." });
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível obter a próxima questão.");
    } finally {
      setGoingNext(false);
    }
  };

  const content = question && (
    <Panel
      title={question.exam ? `Simulado: ${question.exam.title}` : question.source_exam_name ? `Origem: ${question.source_exam_name}` : "Questão avulsa"}
      actions={<QuestionStatusBadge isAnnulled={question.is_annulled} isOutdated={question.is_outdated} />}
    >
      <View style={{ gap: 14 }}>
        {!!question.question_text?.trim() && (
          <RichText className="text-sm text-ink leading-6" selectable value={question.question_text} />
        )}
        {!!question.image_url && (
          <Image
            source={{ uri: question.image_url }}
            accessibilityLabel="Imagem do enunciado"
            style={{ width: "100%", height: isMobile ? 220 : 320 }}
            resizeMode="contain"
          />
        )}
        {question.type === "essay" ? (
          <Text className="text-xs text-ink-muted">Questão dissertativa (sem alternativas).</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {(question.options ?? []).map((option, i) => (
              <View
                key={option.id}
                className={`flex-row rounded-ds-md border px-3 py-2.5 ${option.is_correct ? "bg-success-tint border-success" : "bg-surface border-border"}`}
                style={{ gap: 10 }}
              >
                <Text className={`text-sm font-semibold ${option.is_correct ? "text-success" : "text-ink-muted"}`}>
                  {OPTION_LETTERS[i] ?? i + 1})
                </Text>
                <RichText className="text-sm text-ink flex-1" selectable value={option.option_text} />
                {option.is_correct && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="checkmark-circle" size={16} color="var(--ds-success)" />
                    <Text className="text-xs font-semibold text-success">Gabarito</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        {!!question.explanation?.trim() && (
          <View className="rounded-ds-md bg-surface-sunken border border-border p-3">
            <Text className="text-xs font-semibold text-ink-muted mb-1">Explicação</Text>
            <RichText className="text-xs text-ink" selectable value={question.explanation} />
          </View>
        )}
      </View>
    </Panel>
  );

  const classification = question && (
    <Panel title="Classificação" description="Para alterar, use Editar questão.">
      <DefinitionRows
        rows={[
          question.subject
            ? { label: "Disciplina", value: question.subject.name, text: true }
            : { label: "Disciplina", value: "Não informada", muted: true },
          question.topics.length
            ? { label: "Assuntos", value: question.topics.map((t) => t.name).join(", "), text: true }
            : { label: "Assuntos", value: "Nenhum", muted: true },
          question.difficulty
            ? { label: "Dificuldade", value: question.difficulty.name, text: true }
            : { label: "Dificuldade", value: "Não informada", muted: true },
          question.board ? { label: "Banca", value: question.board.name, text: true } : { label: "Banca", value: "—", muted: true },
          question.year ? { label: "Ano", value: String(question.year) } : { label: "Ano", value: "—", muted: true },
          question.exam_type
            ? { label: "Modalidade", value: question.exam_type.label, text: true }
            : { label: "Modalidade", value: "—", muted: true },
          question.tags.length
            ? { label: "Tags", value: question.tags.join(", "), text: true }
            : { label: "Tags", value: "Nenhuma", muted: true },
        ]}
      />
    </Panel>
  );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
        <View className="mb-6">
          <PageHeader
            title={`Questão #${questionId}`}
            breadcrumb={[{ label: "Banco de questões", onPress: goToList }, { label: `Questão #${questionId}` }]}
            actions={
              <>
                <Button icon={ArrowRight} label="Próxima" onPress={() => void goToNext()} loading={goingNext} disabled={loading} />
                <Button variant="primary" icon={Pencil} label="Editar questão" onPress={goToEdit} disabled={loading || !!loadError} />
              </>
            }
          />
        </View>

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="var(--ds-brand)" />
          </View>
        ) : loadError || !question ? (
          <View className="py-16 items-center" style={{ gap: 12 }}>
            <Text className="text-sm text-ink-muted text-center">{loadError ?? "Questão não encontrada."}</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              <Button variant="primary" label="Tentar novamente" onPress={() => void load()} />
              <Button label="Voltar à lista" onPress={goToList} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 24, alignItems: "flex-start" }}>
            <View style={{ flex: 3, width: isMobile ? "100%" : undefined }}>{content}</View>
            <View style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320 }}>{classification}</View>
          </View>
        )}
      </ScrollView>

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
