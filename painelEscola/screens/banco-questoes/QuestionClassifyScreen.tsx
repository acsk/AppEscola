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
    <View className="bg-white rounded-2xl border border-gray-200 p-5" style={{ gap: 14 }}>
      <View className="flex-row items-center justify-between flex-wrap gap-2">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Questão #{question.id} · {question.exam ? `Simulado: ${question.exam.title}` : "Avulsa"}
        </Text>
        <QuestionStatusBadge isAnnulled={question.is_annulled} isOutdated={question.is_outdated} />
      </View>
      {!!question.question_text?.trim() && (
        <Text className="text-sm text-gray-800 leading-6" selectable>
          {question.question_text}
        </Text>
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
        <Text className="text-xs text-gray-500">Questão dissertativa (sem alternativas).</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {(question.options ?? []).map((option, i) => (
            <View
              key={option.id}
              className={`flex-row rounded-xl border px-3 py-2.5 ${option.is_correct ? "bg-green-50 border-green-300" : "bg-white border-gray-200"}`}
              style={{ gap: 10 }}
            >
              <Text className={`text-sm font-bold ${option.is_correct ? "text-green-700" : "text-gray-500"}`}>
                {OPTION_LETTERS[i] ?? i + 1})
              </Text>
              <Text className="text-sm text-gray-800 flex-1" selectable>
                {option.option_text}
              </Text>
              {option.is_correct && (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="checkmark-circle" size={16} color="#15803D" />
                  <Text className="text-xs font-semibold text-green-700">Gabarito</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {!!question.explanation?.trim() && (
        <View className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <Text className="text-xs font-semibold text-gray-500 mb-1">Explicação</Text>
          <Text className="text-xs text-gray-700" selectable>
            {question.explanation}
          </Text>
        </View>
      )}
      <Text className="text-xs text-gray-400">
        O conteúdo da questão é somente leitura aqui{question.exam ? "; edite pelo simulado." : "."}
      </Text>
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
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : loadError || !question ? (
          <View className="py-16 items-center gap-3">
            <Ionicons name="alert-circle-outline" size={32} color="#F87171" />
            <Text className="text-sm text-gray-600 text-center">{loadError ?? "Questão não encontrada."}</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => void load()} className="px-4 py-2 rounded-xl bg-violet-600">
                <Text className="text-sm font-semibold text-white">Tentar novamente</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={goToList} className="px-4 py-2 rounded-xl border border-gray-200">
                <Text className="text-sm font-semibold text-gray-600">Voltar à lista</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "flex-start" }}>
            <View style={{ flex: 3, width: isMobile ? "100%" : undefined }}>{content}</View>
            <View
              className="bg-white rounded-2xl border border-gray-200 p-5"
              style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320 }}
            >
              <Text className="text-base font-bold text-gray-800 mb-3">Classificação</Text>
              <ClassificationFields form={form} onChange={setForm} catalogs={catalogs} />

              <View className="mt-4 pt-4 border-t border-gray-100" style={{ gap: 8 }}>
                {dirty && (
                  <Text className="text-xs text-amber-700" aria-live="polite">
                    Alterações não salvas.
                  </Text>
                )}
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    onPress={onSave}
                    disabled={!dirty || saving !== null}
                    className={`flex-row items-center gap-2 px-4 py-2.5 rounded-xl ${!dirty || saving ? "bg-violet-300" : "bg-violet-600"}`}
                  >
                    {saving === "save" && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text className="text-sm font-semibold text-white">Salvar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onSaveAndNext}
                    disabled={saving !== null}
                    className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-300 bg-violet-50"
                  >
                    {saving === "next" && <ActivityIndicator size="small" color="#7C3AED" />}
                    <Text className="text-sm font-semibold text-violet-700">{dirty ? "Salvar e próxima" : "Próxima"}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#7C3AED" />
                  </TouchableOpacity>
                  {dirty && (
                    <TouchableOpacity onPress={() => setForm(initial)} disabled={saving !== null} className="px-4 py-2.5 rounded-xl border border-gray-200">
                      <Text className="text-sm font-semibold text-gray-600">Descartar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

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
