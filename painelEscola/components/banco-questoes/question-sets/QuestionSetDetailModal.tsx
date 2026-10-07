import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowDown, ArrowUp, Eye, EyeOff, Save, X } from "lucide-react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import FormInput from "../../ui/FormInput";
import ConfirmModal from "../../ui/ConfirmModal";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  QUESTION_SET_ORIGIN_LABEL as ORIGIN_LABEL,
  fetchQuestionSet,
  removeQuestionFromSet,
  reorderQuestionSet,
  updateQuestionSet,
  type QuestionSet,
  type QuestionSetQuestion,
} from "../../../services/questionSets";
import { type ApiToastState, getApiErrorMessage, showApiErrorToast, showApiToast } from "../../../utils/apiErrors";
import { plainRichText } from "../../../utils/richText";

type Props = {
  setId: number | null;
  onClose: () => void;
  /** Algo mudou (título, status, questões): a lista recarrega. */
  onChanged: () => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};

/** Detalhe do simulado do banco: dados, publicação e ordem das questões. */
export default function QuestionSetDetailModal({ setId, onClose, onChanged, setToast }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [questions, setQuestions] = useState<QuestionSetQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeQuestion, setRemoveQuestion] = useState<QuestionSetQuestion | null>(null);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await fetchQuestionSet(id);
      setSet(body.question_set);
      setQuestions(body.questions);
      setTitle(body.question_set.title);
      setDescription(body.question_set.description ?? "");
    } catch (cause) {
      setLoadError(getApiErrorMessage(cause, "Não foi possível carregar o simulado."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (setId) void load(setId);
    else { setSet(null); setQuestions([]); }
  }, [setId, load]);

  /** Executa a ação, mostra a mensagem da API e recarrega o simulado e a lista. */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (!set) return;
    setBusy(true);
    try {
      showApiToast(setToast, await action(), fallback);
      onChanged();
      await load(set.id);
    } catch (cause) {
      showApiErrorToast(setToast, cause, fallback);
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) => {
    const ids = questions.map((q) => q.id);
    const target = index + delta;
    if (!set || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => reorderQuestionSet(set.id, ids), "Não foi possível reordenar as questões.");
  };

  const dirty = !!set && (title.trim() !== set.title || description.trim() !== (set.description ?? ""));
  const published = set?.status === "published";
  const practicable = questions.filter((q) => q.practicable).length;

  return (
    <>
      <Modal visible={setId !== null} title={set?.title ?? "Simulado do banco"} onClose={onClose} size="lg" maxHeight="92%"
        footer={
          <View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>
            <Button label="Fechar" onPress={onClose} disabled={busy} />
            {set && (
              <Button variant="primary" icon={published ? EyeOff : Eye} loading={busy}
                label={published ? "Voltar para rascunho" : "Publicar para os alunos"}
                disabled={!published && practicable === 0}
                onPress={() => void run(() => updateQuestionSet(set.id, { status: published ? "draft" : "published" }),
                  "Não foi possível alterar a publicação.")} />
            )}
          </View>
        }>
        {loading && !set ? (
          <View className="py-10 items-center"><ActivityIndicator color="var(--ds-brand)" /></View>
        ) : loadError ? (
          <View className="py-8 items-center" style={{ gap: 10 }}>
            <Text className="text-sm text-danger text-center">{loadError}</Text>
            {setId ? <Button label="Tentar novamente" onPress={() => void load(setId)} /> : null}
          </View>
        ) : set ? (
          <View style={{ gap: 14 }}>
            <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
              <Badge label={published ? "Publicado" : "Rascunho"} tone={published ? "success" : "neutral"} />
              <Badge label={ORIGIN_LABEL[set.origin]} tone="brand" />
              {set.exam_type ? <Badge label={set.exam_type.label} tone="neutral" /> : null}
              <Text className="text-xs text-ink-muted">
                {practicable} de {questions.length} questão(ões) visíveis para o aluno · {set.attempts_count} tentativa(s)
              </Text>
            </View>
            {practicable < questions.length && (
              <Text className="text-xs text-warning">
                Questões marcadas como “Não aparece para o aluno” precisam ser objetivas, avulsas, com enunciado, ao menos
                2 alternativas e exatamente 1 correta. Corrija no banco de questões.
              </Text>
            )}

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "stretch" : "flex-end" }}>
              <View style={{ flex: 1 }}>
                <FormInput label="Título" required value={title} onChangeText={setTitle} maxLength={255} />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput label="Descrição" value={description} onChangeText={setDescription} maxLength={2000}
                  placeholder="Orientações para o aluno (opcional)" />
              </View>
              <Button icon={Save} label="Salvar dados" disabled={!dirty || !title.trim() || busy}
                onPress={() => void run(() => updateQuestionSet(set.id, { title: title.trim(), description: description.trim() || null }),
                  "Não foi possível salvar o simulado.")} />
            </View>

            {questions.length === 0 ? (
              <Text className="text-sm text-ink-subtle py-6 text-center">
                Sem questões. Na lista do banco, selecione questões avulsas e use “Adicionar a simulado”.
              </Text>
            ) : (
              <View className="border border-border rounded-ds-md">
                {questions.map((question, index) => (
                  <View key={question.id} className={`px-3 py-3 ${index > 0 ? "border-t border-border" : ""}`}
                    style={{ flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}>
                    <Text className="font-mono text-sm font-semibold text-ink" style={{ width: 36 }}>{index + 1}.</Text>
                    <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
                      <Text className="text-sm text-ink" numberOfLines={2}>
                        {plainRichText(question.question_text) || (question.image_url ? "(Enunciado em imagem)" : "(Sem enunciado)")}
                      </Text>
                      <Text className="text-xs text-ink-muted" numberOfLines={1}>
                        #{question.id} · {question.subject?.name ?? "Sem disciplina"}
                        {question.topics.length ? ` · ${question.topics.map((t) => t.name).join(", ")}` : ""}
                      </Text>
                    </View>
                    {!question.practicable && <Badge label="Não aparece para o aluno" tone="warning" />}
                    <View className="flex-row justify-end" style={{ gap: 6 }}>
                      <Button size="sm" icon={ArrowUp} iconOnly accessibilityLabel={`Subir questão ${index + 1}`}
                        disabled={busy || index === 0} onPress={() => move(index, -1)} />
                      <Button size="sm" icon={ArrowDown} iconOnly accessibilityLabel={`Descer questão ${index + 1}`}
                        disabled={busy || index === questions.length - 1} onPress={() => move(index, 1)} />
                      <Button size="sm" icon={X} iconOnly variant="danger" accessibilityLabel={`Remover questão ${index + 1} do simulado`}
                        disabled={busy} onPress={() => setRemoveQuestion(question)} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </Modal>

      <ConfirmModal visible={removeQuestion !== null} title="Remover questão do simulado?"
        message={`A questão #${removeQuestion?.id ?? ""} sai deste simulado e continua no banco de questões.`}
        confirmLabel="Remover" loading={busy}
        onCancel={() => setRemoveQuestion(null)}
        onConfirm={() => {
          const question = removeQuestion;
          setRemoveQuestion(null);
          if (set && question) void run(() => removeQuestionFromSet(set.id, question.id), "Não foi possível remover a questão.");
        }} />
    </>
  );
}
