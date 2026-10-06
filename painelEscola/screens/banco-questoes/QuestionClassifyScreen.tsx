import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import ClassificationFields from "../../components/banco-questoes/ClassificationFields";
import QuestionStatusBadge from "../../components/banco-questoes/QuestionStatusBadge";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import {
  fetchQuestionBankIds,
  fetchQuestionBankQuestion,
  patchQuestionClassification,
} from "../../services/questionBank";
import { getApiErrorMessage, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import { parseListState, toApiParams } from "../../utils/questionBankQuery";
import {
  type ClassificationForm,
  EMPTY_CLASSIFICATION_FORM,
  diffClassification,
  formFromQuestion,
} from "../../utils/questionClassification";
import type { QuestionBankQuestion } from "../../types/questionBank";
import { Pencil, Sparkles } from "lucide-react-native";
import Button from "../../components/ui/Button";
import RichText from "../../components/ui/RichText";
import SimilarQuestionsModal, { type SimilarSource } from "../../components/banco-questoes/SimilarQuestionsModal";
import { useQuestionAiStatus } from "../../hooks/useQuestionAiStatus";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  questionId: number;
  /** Query da listagem de origem (filtros, aba e ordem) — usada no "Salvar e próxima" e no voltar. */
  listQuery?: string;
};

const OPTION_LETTERS = "ABCDEFGHIJ";

export default function QuestionClassifyScreen({ navigate, questionId, listQuery = "" }: Props) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const catalogs = useQuestionBankCatalogs();

  const [question, setQuestion] = useState<QuestionBankQuestion | null>(null);
  const [initial, setInitial] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
  const [form, setForm] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "next" | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const { ensureAvailable } = useQuestionAiStatus();
  const [similarSource, setSimilarSource] = useState<SimilarSource | null>(null);

  const openSimilar = async () => {
    if (!question) return;
    const unavailable = await ensureAvailable();
    if (unavailable) {
      setToast({ visible: true, type: "error", message: unavailable });
      return;
    }
    setSimilarSource({
      id: question.id,
      type: question.type,
      optionsCount: question.options?.length ?? 0,
      difficultyId: question.difficulty_id,
      imageUrl: question.image_url,
    });
  };

  const patch = useMemo(() => diffClassification(initial, form), [initial, form]);
  const dirty = Object.keys(patch).length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = await fetchQuestionBankQuestion(questionId);
      setQuestion(q);
      setInitial(formFromQuestion(q));
      setForm(formFromQuestion(q));
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar a questão."));
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Aviso ao fechar/recarregar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const goToList = () => navigate("questoes", { query: listQuery });
  const leave = (action: () => void) => (dirty ? setPendingLeave(() => action) : action());

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    try {
      const response = await patchQuestionClassification(questionId, patch);
      showApiToast(setToast, response, "Classificação salva com sucesso.");
      setQuestion(response.body);
      setInitial(formFromQuestion(response.body));
      setForm(formFromQuestion(response.body));
      return true;
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível salvar a classificação.");
      return false;
    }
  };

  const onSave = async () => {
    setSaving("save");
    await save();
    setSaving(null);
  };

  /**
   * A próxima é calculada antes de salvar: na aba "Sem classificação" a questão atual
   * sai da lista assim que é classificada.
   */
  const onSaveAndNext = async () => {
    setSaving("next");
    try {
      const { ids } = await fetchQuestionBankIds(toApiParams(parseListState(listQuery), { paginate: false }));
      const index = ids.indexOf(questionId);
      const nextId = index >= 0 ? ids[index + 1] : ids.find((id) => id !== questionId);

      if (!(await save())) return;
      if (nextId) {
        navigate("questoes-classificar", { questionId: nextId, query: listQuery });
      } else {
        setToast({ visible: true, type: "success", message: "Fim da lista: não há próxima questão." });
      }
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível obter a próxima questão.");
    } finally {
      setSaving(null);
    }
  };

  const content = question && (
    <View className="bg-surface rounded-ds-md border border-border p-5" style={{ gap: 14 }}>
      <View className="flex-row items-center justify-between flex-wrap gap-2">
        <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
          Questão #{question.id} · {question.exam ? `Simulado: ${question.exam.title}` : "Avulsa"}
        </Text>
        <QuestionStatusBadge isAnnulled={question.is_annulled} isOutdated={question.is_outdated} />
      </View>
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
      {question.exam && <Text className="text-xs text-ink-subtle">O conteúdo desta questão é editado pelo simulado.</Text>}
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {!question.exam && (
          <Button
            size="sm"
            icon={Pencil}
            label="Editar conteúdo"
            onPress={() => leave(() => navigate("questoes-editar", { questionId, query: listQuery }))}
          />
        )}
          <Button
            size="sm"
            icon={Sparkles}
            label="Gerar similares com IA"
            onPress={() => void openSimilar()}
          />
      </View>
    </View>
  );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
        <ScreenBreadcrumb
          items={[
            { label: "Banco de questões", onPress: () => leave(goToList) },
            { label: `Questão #${questionId}` },
          ]}
        />

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="var(--ds-brand)" />
          </View>
        ) : loadError || !question ? (
          <View className="py-16 items-center gap-3">
            <Ionicons name="alert-circle-outline" size={32} color="var(--ds-danger)" />
            <Text className="text-sm text-ink-muted text-center">{loadError ?? "Questão não encontrada."}</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => void load()} className="px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center">
                <Text className="text-sm font-medium text-on-brand">Tentar novamente</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={goToList} className="px-4 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center">
                <Text className="text-sm font-semibold text-ink-muted">Voltar à lista</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
            <View style={{ flex: 3, width: isMobile ? "100%" : undefined }}>{content}</View>
            <View
              className="bg-surface rounded-ds-md border border-border p-5"
              style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320 }}
            >
              <Text className="text-base font-semibold text-ink mb-3">Classificação</Text>
              <ClassificationFields form={form} onChange={setForm} catalogs={catalogs} />

              <View className="mt-4 pt-4 border-t border-border" style={{ gap: 8 }}>
                {dirty && (
                  <Text className="text-xs text-warning" aria-live="polite">
                    Alterações não salvas.
                  </Text>
                )}
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    onPress={onSave}
                    disabled={!dirty || saving !== null}
                    className={`flex-row items-center gap-2 px-4 py-2.5 rounded-ds-md ${!dirty || saving ? "bg-brand-tint" : "bg-brand"}`}
                  >
                    {saving === "save" && <ActivityIndicator size="small" color="var(--ds-on-brand)" />}
                    <Text className="text-sm font-medium text-on-brand">Salvar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onSaveAndNext}
                    disabled={saving !== null}
                    className="flex-row items-center gap-2 px-4 py-2 rounded-ds-md border border-border-strong bg-surface min-h-control-md"
                  >
                    {saving === "next" && <ActivityIndicator size="small" color="var(--ds-ink)" />}
                    <Text className="text-sm font-semibold text-ink">{dirty ? "Salvar e próxima" : "Próxima"}</Text>
                    <Ionicons name="arrow-forward" size={14} color="var(--ds-ink)" />
                  </TouchableOpacity>
                  {dirty && (
                    <TouchableOpacity onPress={() => setForm(initial)} disabled={saving !== null} className="px-4 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center">
                      <Text className="text-sm font-semibold text-ink-muted">Descartar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <SimilarQuestionsModal
        visible={similarSource !== null}
        source={similarSource}
        catalogs={catalogs}
        onClose={() => setSimilarSource(null)}
        onCreated={(count) =>
          setToast({ visible: true, type: "success", message: `${count} questão(ões) semelhante(s) incluída(s) no banco.` })
        }
        setToast={setToast}
      />

      <ConfirmModal
        visible={pendingLeave !== null}
        title="Sair sem salvar?"
        message="Há alterações de classificação não salvas. Se sair agora, elas serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        iconName="alert-circle-outline"
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          action?.();
        }}
        onCancel={() => setPendingLeave(null)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
