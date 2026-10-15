import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, Copy, ExternalLink, ImagePlus, RotateCcw, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";
import ActionsMenu, { type ActionsMenuItem } from "../../components/ui/ActionsMenu";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import RichTextInput from "../../components/ui/RichTextInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import MessageModal from "../../components/ui/MessageModal";
import { describeAiError } from "../../utils/aiErrors";
import ClassificationFields, { SituationFields } from "../../components/banco-questoes/ClassificationFields";
import { reporterDetail, RevalidatedMark } from "../../components/banco-questoes/QuestionMarks";
import OptionsEditor from "../../components/banco-questoes/OptionsEditor";
import SimilarQuestionsModal, { type SimilarSource } from "../../components/banco-questoes/SimilarQuestionsModal";
import SimilarSearchPanel from "../../components/banco-questoes/SimilarSearchPanel";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import {
  createStandaloneQuestion,
  deleteStandaloneQuestion,
  fetchQuestionBankQuestion,
  markQuestionsRevalidated,
  resetQuestionPractice,
  updateStandaloneQuestion,
  uploadQuestionBankImage,
} from "../../services/questionBank";
import { aiApproveQuestionReview, aiAutofillQuestion, aiCorrectQuestion, aiReviewQuestion, fetchQuestionReviews } from "../../services/questionAi";
import type { QuestionReview } from "../../types/questionAi";
import QuestionReviewCard from "../../components/banco-questoes/QuestionReviewCard";
import { useQuestionAiStatus } from "../../hooks/useQuestionAiStatus";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import { prepareImageForUpload } from "../../utils/imageCompression";
import {
  type ContentForm,
  type QuestionType,
  EMPTY_CONTENT_FORM,
  contentFromQuestion,
  contentPayload,
  mergeContentSuggestion,
  objectiveFromSuggestion,
  validateContent,
} from "../../utils/questionContent";
import {
  type ClassificationForm,
  EMPTY_CLASSIFICATION_FORM,
  detectQuestionYear,
  diffClassification,
  formFromQuestion,
  mergeClassificationSuggestion,
  validateClassification,
} from "../../utils/questionClassification";
import { imageQuestionContent } from "../../utils/questionImageReview";
import RedrawImageModal from "../../components/banco-questoes/RedrawImageModal";
import { plainRichText } from "../../utils/richText";
import { color } from "../../constants/theme";
import type { QuestionBankQuestion, QuestionIssueReporter } from "../../types/questionBank";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  /** null = nova questão avulsa. */
  questionId: number | null;
  /** Query da listagem de origem, para voltar com os mesmos filtros. */
  listQuery?: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Tamanho mínimo do enunciado (sem formatação) para a IA (espelha a API). */
const AI_MIN_CHARS = 15;
/** A partir deste tamanho, a tela sugere o preenchimento automático. */
const AI_HINT_CHARS = 40;
/** Abaixo desta largura, a coluna lateral (revisão e classificação) desce para baixo do conteúdo. */
const STACK_BELOW = 1100;

/** "agora", "há 5 min", "há 3 h", "há 2 dias", "em 12/10/2026". */
function updatedAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 30) return days === 1 ? "há 1 dia" : `há ${days} dias`;
  return `em ${d.toLocaleDateString("pt-BR")}`;
}

/**
 * Criação e edição de questões do banco: único lugar para classificar e gerar semelhantes.
 * Avulsa: conteúdo + classificação. De simulado: conteúdo só leitura (editado pelo simulado), classificação editável.
 */
export default function QuestionEditScreen({ navigate, questionId, listQuery = "" }: Props) {
  const isEdit = questionId !== null;
  const { isMobile, width, contentPadding } = useResponsiveLayout();
  const stacked = width < STACK_BELOW;
  const catalogs = useQuestionBankCatalogs();

  const [initialContent, setInitialContent] = useState<ContentForm>(EMPTY_CONTENT_FORM);
  const [content, setContent] = useState<ContentForm>(initialContent);
  const [classification, setClassification] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
  const [initialClassification, setInitialClassification] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
  const [sourceExamName, setSourceExamName] = useState("");
  const [initialSourceExamName, setInitialSourceExamName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "another" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const releasing = useRef(false);
  const {
    available: aiAvailable, loading: aiStatusLoading, error: aiStatusError,
    reload: loadAiStatus, ensureAvailable,
  } = useQuestionAiStatus();
  const [aiFilling, setAiFilling] = useState(false);
  const [aiHintDismissed, setAiHintDismissed] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  /** Falha da IA: modal de erro padrão do sistema. */
  const [aiError, setAiError] = useState<{ title: string; message: string } | null>(null);
  const [similarSource, setSimilarSource] = useState<SimilarSource | null>(null);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [sourceDifficultyId, setSourceDifficultyId] = useState<number | null>(null);
  /** Questão de simulado: conteúdo só leitura aqui. */
  const [examQuestion, setExamQuestion] = useState<QuestionBankQuestion | null>(null);
  const [review, setReview] = useState<QuestionReview | null>(null);
  const [reviewHistory, setReviewHistory] = useState<QuestionReview[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [revalidatedAt, setRevalidatedAt] = useState<string | null>(null);
  const [markingRevalidated, setMarkingRevalidated] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [releaseKind, setReleaseKind] = useState<"save" | "revalidate" | "approve" | null>(null);
  const [issueReportsCount, setIssueReportsCount] = useState(0);
  const [issueReporters, setIssueReporters] = useState<QuestionIssueReporter[]>([]);
  const [analysisHint, setAnalysisHint] = useState(false);
  const isFromExam = examQuestion !== null;

  const load = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    try {
      const q = await fetchQuestionBankQuestion(questionId);
      setExamQuestion(q.origin === "avulsa" ? null : q);
      const form = contentFromQuestion(q);
      setSourceDifficultyId(q.difficulty_id);
      setInitialContent(form);
      setContent(form);
      const classified = formFromQuestion(q);
      setInitialClassification(classified);
      setClassification(classified);
      setIssueReportsCount(q.issue_reports_count ?? 0);
      setIssueReporters(q.issue_reporters ?? []);
      setRevalidatedAt(q.revalidated_at ?? null);
      setUpdatedAt(q.updated_at ?? null);
      setSourceExamName(q.source_exam_name ?? "");
      setInitialSourceExamName(q.source_exam_name ?? "");
      const reviews = await fetchQuestionReviews(questionId).catch(() => []);
      setReviewHistory(reviews);
      setReview(reviews[0] ?? null);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar a questão."));
    } finally {
      setLoading(false);
    }
  }, [isEdit, questionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () =>
      JSON.stringify(contentPayload(content)) !== JSON.stringify(contentPayload(initialContent)) ||
      sourceExamName.trim() !== initialSourceExamName.trim() ||
      Object.keys(diffClassification(initialClassification, classification)).length > 0,
    [classification, content, initialContent, initialClassification, sourceExamName, initialSourceExamName]
  );

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

  const setField = <K extends keyof ContentForm>(key: K, value: ContentForm[K]) => {
    if (aiFilling) return;
    setContent((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      if (key === "image_url") delete next.question_text;
      return next;
    });
  };

  const statementChars = plainRichText(content.question_text).trim().length;
  const contentIsBlank =
    content.options.every((o) => !plainRichText(o.option_text).trim()) && !plainRichText(content.explanation).trim();
  const showAiHint = aiAvailable && !aiHintDismissed && !aiFilling && statementChars >= AI_HINT_CHARS && contentIsBlank;

  /** Preenche alternativas, gabarito, explicação e classificação, sem apagar o que já foi digitado. */
  const autofill = async () => {
    if (aiFilling || saving !== null || uploading) return;
    setAiFilling(true);
    try {
      const unavailable = await ensureAvailable();
      if (unavailable) {
        setToast({ visible: true, type: "error", message: unavailable });
        return;
      }
      if (statementChars < AI_MIN_CHARS) {
        const message = `Escreva um enunciado com pelo menos ${AI_MIN_CHARS} caracteres para usar a IA.`;
        setErrors((prev) => ({ ...prev, question_text: message }));
        setToast({ visible: true, type: "error", message });
        return;
      }
      const response = await aiAutofillQuestion({
        question_text: content.question_text,
        // "Objetiva" é o padrão da tela: só envia o tipo quando o usuário escolheu "Dissertativa".
        type: content.type === "essay" ? "essay" : undefined,
        options: content.options.map((o) => ({ option_text: o.option_text })),
        subject_id: classification.subject_id ?? undefined,
        source_exam_name: sourceExamName.trim() || undefined,
      });
      const merged = mergeContentSuggestion(content, response.body);
      setContent(merged.form);
      const classified = mergeClassificationSuggestion(classification, response.body);
      if (classified.changed) {
        setClassification(classified.form);
      }
      setErrors({});
      setAiHintDismissed(true);
      showApiToast(setToast, response, "Campos sugeridos pela IA. Revise antes de salvar.");
    } catch (error) {
      const fieldErrors = getApiValidationErrors(error);
      if (Object.keys(fieldErrors).length) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        showApiErrorToast(setToast, error, "Não foi possível preencher com IA.");
      } else {
        setAiError(describeAiError(error, "Não foi possível preencher com IA"));
      }
    } finally {
      setAiFilling(false);
    }
  };

  /** Dissertativa → objetiva: a IA reescreve o comando e cria as alternativas; nada é salvo até "Salvar". */
  const convertToObjective = async () => {
    setConfirmConvert(false);
    if (aiFilling || saving !== null || uploading) return;
    setAiFilling(true);
    try {
      const unavailable = await ensureAvailable();
      if (unavailable) {
        setToast({ visible: true, type: "error", message: unavailable });
        return;
      }
      if (statementChars < AI_MIN_CHARS) {
        const message = `Escreva um enunciado com pelo menos ${AI_MIN_CHARS} caracteres para usar a IA.`;
        setErrors((prev) => ({ ...prev, question_text: message }));
        setToast({ visible: true, type: "error", message });
        return;
      }
      const response = await aiAutofillQuestion({
        question_text: content.question_text,
        convert_to_objective: true,
        explanation: content.explanation.trim() || undefined,
        subject_id: classification.subject_id ?? undefined,
        source_exam_name: sourceExamName.trim() || undefined,
      });
      setContent(objectiveFromSuggestion(content, response.body));
      const classified = mergeClassificationSuggestion(classification, response.body);
      if (classified.changed) setClassification(classified.form);
      setErrors({});
      setToast({ visible: true, type: "success", message: "Questão transformada em objetiva. Revise o enunciado e as alternativas antes de salvar." });
    } catch (error) {
      const fieldErrors = getApiValidationErrors(error);
      if (Object.keys(fieldErrors).length) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        showApiErrorToast(setToast, error, "Não foi possível transformar a questão.");
      } else {
        setAiError(describeAiError(error, "Não foi possível transformar em objetiva"));
      }
    } finally {
      setAiFilling(false);
    }
  };

  /** A IA usa o que está no formulário agora (inclusive edições ainda não salvas), não a versão gravada. */
  const openSimilar = async () => {
    if (questionId === null || loading || loadError || aiFilling || saving !== null || uploading) return;
    const unavailable = await ensureAvailable();
    if (unavailable) {
      setToast({ visible: true, type: "error", message: unavailable });
      return;
    }
    const { type, question_text, explanation, options } = imageQuestionContent(content);
    setSimilarSource({
      id: questionId,
      type,
      optionsCount: options.length,
      difficultyId: classification.difficulty_id ?? sourceDifficultyId,
      imageUrl: content.image_url || null,
      context: {
        type,
        question_text,
        explanation,
        image_url: content.image_url || null,
        options,
        subject_id: classification.subject_id,
        topic_ids: classification.topic_ids,
        board_id: classification.board_id,
        year: classification.year,
        exam_type_id: classification.exam_type_id,
        tags: classification.tags,
        source_exam_name: sourceExamName.trim() || null,
      },
    });
  };

  const reviewPayload = () => ({
    question_text: content.question_text,
    explanation: content.explanation,
    type: content.type,
    options: content.options.map(({ option_text, is_correct }) => ({ option_text, is_correct })),
    subject_name: catalogs.subjects.find((subject) => subject.id === classification.subject_id)?.name ?? null,
    difficulty_name: catalogs.difficulties.find((item) => item.id === classification.difficulty_id)?.name ?? null,
    topic_names: catalogs.taxonomy.flatMap((subject) => subject.topics).filter((topic) => classification.topic_ids.includes(topic.id)).map((topic) => topic.name),
    question_id: questionId,
    force: true,
  });

  const runReview = async (action: "validate" | "correct" | "approve") => {
    if (reviewing) return;
    setReviewing(true);
    try {
      if (action === "approve") {
        if (questionId === null) return;
        const response = await aiApproveQuestionReview(questionId);
        setReview(response.body);
        setReviewHistory((prev) => [response.body, ...prev]);
        setRevalidatedAt(new Date().toISOString());
        setIssueReportsCount(0);
        setIssueReporters([]);
        showApiToast(setToast, response, "Questão liberada para resposta.");
        return;
      }
      const payload = action === "correct"
        ? { ...reviewPayload(), attempts: Math.min(review?.attempts ?? 0, 2) }
        : reviewPayload();
      const response = action === "correct" ? await aiCorrectQuestion(payload) : await aiReviewQuestion(payload);
      setReview(response.body);
      if (response.body.id) setReviewHistory((prev) => [response.body, ...prev.filter((item) => item.id !== response.body.id)]);
      const question = response.body.question;
      if (question) {
        setContent((prev) => ({
          ...prev,
          question_text: question.question_text || prev.question_text,
          explanation: question.explanation ?? prev.explanation,
          options: question.options?.length
            ? question.options.map((option, index) => ({
                key: `opt-review-${index}-${Date.now()}`,
                option_text: option.option_text,
                is_correct: !!option.is_correct,
              }))
            : prev.options,
        }));
      } else if (question && examQuestion) {
        setExamQuestion({
          ...examQuestion,
          explanation: question.explanation ?? examQuestion.explanation,
          options: (examQuestion.options ?? []).map((option, index) => ({
            ...option,
            option_text: question.options?.[index]?.option_text || option.option_text,
            is_correct: question.options?.[index] ? !!question.options[index].is_correct : option.is_correct,
          })),
        });
      }
      if (questionId !== null) void markQuestionsRevalidated([questionId], true).then(() => setRevalidatedAt(new Date().toISOString())).catch(() => undefined);
    } catch (error) {
      setAiError(describeAiError(error, "Não foi possível revisar a questão"));
    } finally {
      setReviewing(false);
    }
  };

  // Questão que vem com o ano (cabeçalho do enunciado ou nome da prova): preenche o ano vazio da classificação.
  const detectedYear = useMemo(() => detectQuestionYear(content.question_text, sourceExamName), [content.question_text, sourceExamName]);
  const lastDetectedYear = useRef<number | null>(null);
  useEffect(() => {
    if (loading || detectedYear === null || detectedYear === lastDetectedYear.current) return;
    lastDetectedYear.current = detectedYear;
    setClassification((prev) => (prev.year === null ? { ...prev, year: detectedYear } : prev));
  }, [detectedYear, loading]);

  const applyRevalidated = async (next: boolean) => {
    if (questionId === null || markingRevalidated) return;
    setMarkingRevalidated(true);
    try {
      const response = await markQuestionsRevalidated([questionId], next, next);
      setRevalidatedAt(next ? new Date().toISOString() : null);
      if (next) {
        setIssueReportsCount(0);
        setIssueReporters([]);
      }
      showApiToast(setToast, response, next ? "Questão liberada para resposta." : "Marca de revalidação removida.");
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível marcar a revalidação.");
    } finally {
      setMarkingRevalidated(false);
    }
  };

  const confirmResetPractice = async () => {
    if (questionId === null || resetting) return;
    setResetting(true);
    try {
      const response = await resetQuestionPractice(questionId);
      setConfirmReset(false);
      showApiToast(setToast, response, "A questão voltou como nova. Os alunos respondem de novo.");
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível resetar a questão.");
    } finally {
      setResetting(false);
    }
  };

  const openRedraw = async () => {
    if (!content.image_url || aiFilling || saving !== null || uploading) return;
    const unavailable = await ensureAvailable();
    if (unavailable) {
      setToast({ visible: true, type: "error", message: unavailable });
      return;
    }
    setRedrawOpen(true);
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file || aiFilling || saving !== null) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((prev) => ({ ...prev, image_url: "A imagem deve ter no máximo 5MB." }));
      return;
    }
    setUploading(true);
    try {
      const optimized = await prepareImageForUpload(file, 5000);
      const response = await uploadQuestionBankImage(optimized as File, questionId ?? undefined);
      setField("image_url", response.body.image_url);
      showApiToast(setToast, response, "Imagem enviada com sucesso.");
    } catch (error) {
      setErrors((prev) => ({ ...prev, ...getApiValidationErrors(error) }));
      showApiErrorToast(setToast, error, "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const showClientErrors = (clientErrors: Record<string, string>) => {
    setErrors(clientErrors);
    setToast({ visible: true, type: "error", message: Object.values(clientErrors)[0] });
  };

  const changeClassification = (form: ClassificationForm) => {
    if (aiFilling || saving !== null) return;
    setClassification(form);
    setErrors((prev) => {
      if (!prev.subject_id && !prev.topic_ids) return prev;
      const { subject_id, topic_ids, ...rest } = prev;
      return rest;
    });
  };

  const save = async (mode: "save" | "another", hadError?: boolean) => {
    if (aiFilling || uploading || saving !== null) return;
    const clientErrors = { ...validateContent(content), ...validateClassification(classification, catalogs.taxonomy) };
    if (Object.keys(clientErrors).length) {
      showClientErrors(clientErrors);
      return;
    }

    setSaving(mode);
    try {
      const payload = {
        ...contentPayload(content), ...diffClassification(initialClassification, classification),
        source_exam_name: sourceExamName.trim() || null,
        ...(hadError === undefined ? {} : { had_error: hadError }),
      };
      const response = isEdit
        ? await updateStandaloneQuestion(questionId, payload)
        : await createStandaloneQuestion(payload);
      showApiToast(setToast, response, "Questão salva com sucesso.");

      if (mode === "another") {
        // Mantém a classificação (útil ao cadastrar várias questões do mesmo assunto/banca).
        const blank = EMPTY_CONTENT_FORM();
        setInitialContent(blank);
        setContent(blank);
        setInitialSourceExamName(sourceExamName);
        setErrors({});
        return;
      }
      setInitialContent(content);
      setInitialClassification(classification);
      setInitialSourceExamName(sourceExamName);
      navigate("questoes-classificar", { questionId: response.body.id, query: listQuery });
    } catch (error) {
      setErrors(getApiValidationErrors(error));
      showApiErrorToast(setToast, error, "Não foi possível salvar a questão.");
    } finally {
      setSaving(null);
    }
  };

  const askSave = () => {
    if (aiFilling || uploading || saving !== null) return;
    const clientErrors = { ...validateContent(content), ...validateClassification(classification, catalogs.taxonomy) };
    if (Object.keys(clientErrors).length) {
      showClientErrors(clientErrors);
      return;
    }
    if (!isEdit) {
      void save("save");
      return;
    }
    setReleaseKind("save");
  };

  const confirmRelease = async (hadError?: boolean) => {
    if (releasing.current || releaseKind === null) return;
    releasing.current = true;
    const kind = releaseKind;
    try {
      if (kind === "save") await save("save", hadError);
      else if (kind === "revalidate") await applyRevalidated(true);
      else if (kind === "approve") await runReview("approve");
    } finally {
      releasing.current = false;
      setReleaseKind(null);
    }
  };

  const releaseBusy = saving !== null || markingRevalidated || reviewing;

  /** Volta ao que está gravado (sem sair da tela). */
  const discard = () => {
    setContent(initialContent);
    setClassification(initialClassification);
    setSourceExamName(initialSourceExamName);
    setErrors({});
  };

  const confirmDeleteQuestion = async () => {
    if (questionId === null || deleting) return;
    setDeleting(true);
    try {
      const response = await deleteStandaloneQuestion(questionId);
      showApiToast(setToast, response, "Questão removida com sucesso.");
      setConfirmDelete(false);
      setInitialContent(content);
      setInitialClassification(classification);
      setInitialSourceExamName(sourceExamName);
      goToList();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível excluir a questão.");
    } finally {
      setDeleting(false);
    }
  };

  const busyAny = loading || !!loadError || aiFilling || saving !== null || uploading;
  const subjectName = catalogs.subjects.find((x) => x.id === classification.subject_id)?.name;
  const topicNames = catalogs.taxonomy.flatMap((x) => x.topics).filter((t) => classification.topic_ids.includes(t.id)).map((t) => t.name);
  const description = !isEdit
    ? "Questão avulsa, sem vínculo com simulado."
    : [
        isFromExam ? `Simulado arquivado${examQuestion?.exam?.title ? `: ${examQuestion.exam.title}` : ""}` : null,
        [subjectName, topicNames[0] && `${topicNames[0]}${topicNames.length > 1 ? ` +${topicNames.length - 1}` : ""}`].filter(Boolean).join(" › "),
        updatedAgo(updatedAt) && `atualizada ${updatedAgo(updatedAt)}`,
      ].filter(Boolean).join(" · ") || undefined;

  const aiItems: ActionsMenuItem[] = [
    { key: "autofill", label: "Autocompletar questão", icon: Sparkles, description: "Sugere alternativas, gabarito, explicação e classificação", onPress: () => void autofill(), disabled: busyAny },
    ...(content.type === "essay"
      ? [{ key: "convert", label: "Transformar em objetiva", icon: Wand2, description: "Reescreve o comando e cria 5 alternativas", onPress: () => setConfirmConvert(true), disabled: busyAny }]
      : []),
    { key: "correct", label: "Corrigir com IA", icon: Wand2, description: review ? "Corrige o que a revisão pedagógica apontou" : "Valide a questão antes de corrigir", onPress: () => void runReview("correct"), disabled: busyAny || reviewing || !review || review.aprovada },
    ...(isEdit
      ? [{ key: "similar", label: "Gerar questões similares", icon: Copy, description: "Cria variações no mesmo assunto", onPress: () => void openSimilar(), disabled: busyAny }]
      : []),
  ];

  const reportedCount = issueReportsCount;
  const releaseMessage = reportedCount > 0
    ? `${reportedCount === 1 ? "1 aluno marcou" : `${reportedCount} alunos marcaram`} esta questão com erro. Ela fica liberada para os alunos responderem e as respostas erradas são zeradas. As notas do simulado oficial permanecem.`
    : "Nenhum aluno marcou erro nesta questão. Ela fica liberada para os alunos responderem e a contagem de respostas erradas permanece. As notas do simulado oficial permanecem.";

  const moreItems: ActionsMenuItem[] = isEdit
    ? [
        {
          key: "revalidate",
          label: revalidatedAt ? "Remover marca de revalidada" : "Marcar como revalidada",
          icon: ShieldCheck,
          description: revalidatedAt
            ? "A questão deixa de aparecer como revalidada"
            : reportedCount > 0
              ? "A restrição sai ao salvar e confirmar se havia erro"
              : "Libera a questão e mantém a contagem de erros",
          onPress: () => {
            if (!revalidatedAt && reportedCount > 0) {
              setAnalysisHint(true);
              return;
            }
            if (revalidatedAt) void applyRevalidated(false);
            else setReleaseKind("revalidate");
          },
          disabled: markingRevalidated || reviewing || resetting,
        },
        {
          key: "reset",
          label: "Resetar como nova",
          icon: RotateCcw,
          description: "Os alunos respondem de novo, como questão nova",
          onPress: () => setConfirmReset(true),
          disabled: markingRevalidated || reviewing || resetting,
        },
        ...(!isFromExam
          ? [{ key: "delete", label: "Excluir questão…", icon: Trash2, danger: true, separatorBefore: true, onPress: () => setConfirmDelete(true), disabled: deleting || saving !== null }]
          : []),
      ]
    : [];

  /** Objetiva | Dissertativa no cabeçalho do cartão "Conteúdo". */
  const typeToggle = (
    <View role="radiogroup" aria-label="Tipo" className="flex-row rounded-ds-md border border-border-strong overflow-hidden">
      {([["multiple_choice", "Objetiva"], ["essay", "Dissertativa"]] as [QuestionType, string][]).map(([value, label], i) => {
        const on = content.type === value;
        return (
          <TouchableOpacity
            key={value}
            role="radio"
            aria-checked={on}
            disabled={aiFilling}
            onPress={() => setField("type", value)}
            className={`justify-center ${on ? "bg-brand" : "bg-surface"}`}
            style={{ height: 32, paddingHorizontal: 14, borderLeftWidth: i ? 1 : 0, borderLeftColor: color["border-strong"] }}
          >
            <Text className="font-medium" style={{ fontSize: 13, color: on ? color["on-brand"] : color["ink-muted"] }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const autofillLink = aiAvailable ? (
    <TouchableOpacity
      onPress={() => void autofill()}
      disabled={busyAny}
      className="flex-row items-center rounded-ds-sm"
      style={{ gap: 6, height: 26, paddingHorizontal: 8, opacity: busyAny ? 0.5 : 1 }}
      aria-label="Autocompletar com IA"
    >
      {aiFilling ? <ActivityIndicator size="small" color={color.brand} /> : <Sparkles size={14} color={color.brand} strokeWidth={1.5} />}
      <Text className="font-medium text-brand" style={{ fontSize: 12 }}>{aiFilling ? "Preenchendo…" : "Autocompletar com IA"}</Text>
    </TouchableOpacity>
  ) : null;

  const imageField = (
    <View className="mb-4">
      {content.image_url ? (
        <View className="border border-border rounded-ds-md" style={{ gap: 8, padding: 8 }}>
          <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18 }}>Imagem do enunciado</Text>
          <Image
            source={{ uri: content.image_url }}
            accessibilityLabel="Imagem do enunciado"
            style={{ width: "100%", height: isMobile ? 180 : 260 }}
            resizeMode="contain"
          />
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button size="sm" icon={ImagePlus} label="Trocar imagem" onPress={() => fileInputRef.current?.click()} loading={uploading} disabled={aiFilling || saving !== null} />
            <Button variant="ai" size="sm" icon={Sparkles} label="Gerar nova imagem com IA" onPress={() => void openRedraw()} disabled={aiFilling || saving !== null || uploading} />
            <Button size="sm" variant="danger" icon={Trash2} label="Remover imagem" onPress={() => setField("image_url", "")} disabled={aiFilling || saving !== null} />
          </View>
        </View>
      ) : (
        // Arrastar, colar (com a área em foco) ou enviar.
        <div
          tabIndex={0}
          aria-label="Imagem do enunciado: arraste, cole ou envie"
          onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
          onDragLeave={() => setImageDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setImageDragOver(false); void onPickImage(e.dataTransfer.files?.[0]); }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files ?? []).find((x) => x.type.startsWith("image/"));
            if (pasted) { e.preventDefault(); void onPickImage(pasted); }
          }}
          style={{
            display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "12px 16px",
            border: `1px dashed ${imageDragOver ? color.brand : color["border-strong"]}`, borderRadius: 4, background: color["surface-sunken"],
          }}
        >
          <ImagePlus size={20} color={color["ink-subtle"]} strokeWidth={1.5} />
          <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, flex: 1, minWidth: 200 }}>
            <Text className="font-medium text-ink">Imagem do enunciado</Text> · arraste, cole ou envie (JPG, PNG, WEBP, GIF até 5 MB)
          </Text>
          <Button size="sm" label="Enviar imagem" onPress={() => fileInputRef.current?.click()} loading={uploading} disabled={aiFilling || saving !== null} />
        </div>
      )}
      {errors.image_url ? <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>{errors.image_url}</Text> : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        aria-hidden
        onChange={(e) => void onPickImage(e.target.files?.[0])}
      />
    </View>
  );

  const aiStatusNote = aiStatusLoading
    ? "Verificando configuração de IA…"
    : aiStatusError ?? (!aiAvailable ? "Para usar a IA, cadastre uma chave em Configurações → Integração com IA." : null);

  const contentPanel = (
    <Panel
      title="Conteúdo"
      description={isFromExam ? `Questão do simulado arquivado "${examQuestion?.exam?.title ?? ""}". A edição aqui altera o simulado.` : undefined}
      actions={
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {isFromExam && examQuestion?.exam ? (
            <Button size="sm" icon={ExternalLink} label="Abrir simulado" onPress={() => leave(() => navigate("simulados-form", { examId: examQuestion.exam!.id }))} />
          ) : null}
          {typeToggle}
        </View>
      }
    >
      {content.type === "essay" && (
        <View className="flex-row flex-wrap items-center border border-border rounded-ds-md bg-surface-sunken" style={{ gap: 10, padding: 12, marginBottom: 16 }}>
          <Text className="text-sm text-ink-muted" style={{ flex: 1, minWidth: 220 }}>
            A IA pode reescrever o comando e criar 5 alternativas, usando a explicação como resposta esperada.
          </Text>
          <Button variant="ai" size="sm" icon={Sparkles} label="Transformar em objetiva com IA" loading={aiFilling}
            disabled={loading || saving !== null || uploading} onPress={() => setConfirmConvert(true)} />
        </View>
      )}

      <RichTextInput
        label="Enunciado"
        required
        value={content.question_text}
        onChange={(v) => setField("question_text", v)}
        error={errors.question_text}
        minHeight={96}
        disabled={aiFilling}
        placeholder="Texto do enunciado (ou envie a imagem abaixo). Pode colar a questão inteira, com as alternativas."
        toolbarRight={autofillLink}
      />

      {aiStatusNote ? (
        <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: -8, marginBottom: 16 }}>
          <Text className={`text-xs ${aiStatusError ? "text-danger" : "text-ink-muted"}`} aria-live="polite">{aiStatusNote}</Text>
          {aiStatusError ? <Button size="sm" variant="ghost" label="Verificar IA novamente" onPress={() => void loadAiStatus()} /> : null}
        </View>
      ) : null}

      {showAiHint && (
        <View
          className="flex-row flex-wrap items-center border border-brand bg-brand-tint rounded-ds-md"
          style={{ gap: 12, padding: 12, marginBottom: 16 }}
          aria-live="polite"
        >
          <Text className="text-sm text-ink" style={{ flex: 1, minWidth: 220 }}>
            Enunciado pronto. Use “Autocompletar com IA” para preencher alternativas, gabarito, explicação e classificação.
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" label="Agora não" onPress={() => setAiHintDismissed(true)} />
            <Button size="sm" variant="ai" icon={Sparkles} label="Autocompletar" onPress={() => void autofill()} disabled={busyAny} />
          </View>
        </View>
      )}

      {imageField}

      {content.type === "multiple_choice" && (
        <OptionsEditor options={content.options} onChange={(options) => setField("options", options)} error={errors.options} disabled={aiFilling} />
      )}

      <RichTextInput
        label="Explicação"
        value={content.explanation}
        onChange={(v) => setField("explanation", v)}
        error={errors.explanation}
        minHeight={72}
        disabled={aiFilling}
        placeholder="Comentário da resposta (opcional)"
      />
    </Panel>
  );

  const sideColumn = (
    <View style={{ gap: 20 }}>
      {isEdit ? (
        <SimilarSearchPanel
          questionText={content.question_text}
          subjectId={classification.subject_id}
          topicId={classification.topic_ids[0] ?? null}
          imageUrl={content.image_url}
          options={content.options.map((option) => ({ option_text: option.option_text }))}
          ignoreId={questionId}
          onOpen={(id) => leave(() => navigate("questoes-classificar", { questionId: id, query: listQuery }))}
        />
      ) : null}
      {isEdit ? (
        <QuestionReviewCard
          review={review}
          history={reviewHistory}
          revalidatedAt={revalidatedAt}
          busy={reviewing}
          onValidate={() => void runReview("validate")}
          onApprove={questionId !== null ? () => (issueReportsCount > 0 ? setAnalysisHint(true) : setReleaseKind("approve")) : undefined}
        />
      ) : null}
      <Panel title="Classificação">
        <ClassificationFields form={classification} onChange={changeClassification} catalogs={catalogs} errors={errors} layout="side" />
      </Panel>
      <Panel title="Situação na banca">
        <SituationFields form={classification} onChange={changeClassification} />
      </Panel>
    </View>
  );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 32 }}>
        <View style={{ marginBottom: 20, zIndex: 10 }}>
          <PageHeader
            breadcrumb={[{ label: "Banco de questões", onPress: () => leave(goToList) }, { label: isEdit ? `Questão #${questionId}` : "Nova questão" }]}
            title={isEdit ? `Questão #${questionId}` : "Nova questão"}
            titleAddon={
              loading || loadError ? null : (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  {revalidatedAt ? <RevalidatedMark iconOnly size={26} /> : null}
                  <Badge label={isFromExam ? "De simulado" : "Avulsa"} />
                </View>
              )
            }
            description={loading ? undefined : description}
            actions={
              loading || loadError ? undefined : (
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {aiItems.length ? (
                    <ActionsMenu
                      items={aiItems}
                      minWidth={300}
                      renderTrigger={({ toggle }) => (
                        <TouchableOpacity
                          onPress={toggle}
                          aria-haspopup="menu"
                          className="flex-row items-center bg-surface border border-border-strong rounded-ds-md"
                          style={{ gap: 8, height: 36, paddingHorizontal: 14 }}
                        >
                          {aiFilling || reviewing ? <ActivityIndicator size="small" color={color.ink} /> : <Sparkles size={16} color={color.ink} strokeWidth={1.5} />}
                          <Text className="font-medium text-ink" style={{ fontSize: 14 }}>Ferramentas de IA</Text>
                          <ChevronDown size={16} color={color["ink-muted"]} strokeWidth={1.5} />
                        </TouchableOpacity>
                      )}
                    />
                  ) : null}
                  {moreItems.length ? <ActionsMenu items={moreItems} minWidth={280} /> : null}
                </View>
              )
            }
          />
        </View>

        {!loading && !loadError && issueReportsCount > 0 ? (
          <View className="border border-warning bg-warning-tint rounded-ds-md" style={{ paddingVertical: 10, paddingHorizontal: 16, marginBottom: 20, gap: 8 }}>
            <Text className="text-ink" style={{ fontSize: 13, lineHeight: 20 }}>
              {issueReporters.length === 1
                ? "Este aluno marcou a questão para revisão. Ela está sem validação. Analise o enunciado e corrija se houver erro. A restrição sai ao salvar, quando você confirma se havia erro."
                : issueReporters.length > 1
                  ? "Estes alunos marcaram a questão para revisão. Ela está sem validação. Analise o enunciado e corrija se houver erro. A restrição sai ao salvar, quando você confirma se havia erro."
                  : "Alunos marcaram esta questão para revisão. Ela está sem validação. Analise o enunciado e corrija se houver erro. A restrição sai ao salvar, quando você confirma se havia erro."}
            </Text>
            {issueReporters.length > 0 ? (
              <View style={{ gap: 4 }}>
                {issueReporters.map((reporter) => (
                  <View key={reporter.student_id} style={{ gap: 2 }}>
                    <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                      {reporterDetail(reporter)}
                    </Text>
                    {reporter.note ? (
                      <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                        {reporter.note}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color={color.brand} />
          </View>
        ) : loadError ? (
          <View className="py-16 items-center" style={{ gap: 12 }}>
            <Text className="text-sm text-ink-muted text-center">{loadError}</Text>
            <Button label="Voltar à lista" onPress={goToList} />
          </View>
        ) : (
          <View style={{ flexDirection: stacked ? "column" : "row", gap: 20, alignItems: stacked ? "stretch" : "flex-start" }}>
            <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>{contentPanel}</View>
            <View style={{ width: stacked ? "100%" : 380 }}>{sideColumn}</View>
          </View>
        )}
      </ScrollView>

      {!loading && !loadError ? (
        <View
          className="flex-row flex-wrap items-center bg-surface border-t border-border"
          style={{ gap: 12, paddingVertical: 12, paddingHorizontal: contentPadding }}
        >
          <View className="flex-row items-center" style={{ gap: 8, flex: 1, minWidth: 160 }} aria-live="polite">
            <View style={{ width: 8, height: 8, backgroundColor: dirty ? color.warning : color.success }} />
            <Text className="text-ink-muted" style={{ fontSize: 13 }}>{dirty ? "Alterações não salvas" : isEdit ? "Tudo salvo" : "Nova questão"}</Text>
          </View>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {isEdit ? (
              dirty ? <Button label="Descartar" onPress={discard} disabled={saving !== null || aiFilling} /> : null
            ) : (
              <>
                <Button label="Cancelar" onPress={() => leave(goToList)} disabled={saving !== null || aiFilling} />
                <Button label="Salvar e criar outra" onPress={() => void save("another")} loading={saving === "another"} disabled={saving !== null || aiFilling || uploading} />
              </>
            )}
            <Button variant="primary" label={isEdit ? "Salvar alterações" : "Salvar questão"} onPress={askSave} loading={saving === "save"} disabled={saving !== null} />
          </View>
        </View>
      ) : null}

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

      <RedrawImageModal
        visible={redrawOpen}
        questionId={questionId}
        content={content}
        onClose={() => setRedrawOpen(false)}
        onUse={(imageUrl) => {
          setRedrawOpen(false);
          setField("image_url", imageUrl);
          setToast({ visible: true, type: "success", message: "Nova imagem aplicada. Salve a questão para manter a alteração." });
        }}
      />

      <ConfirmModal
        visible={pendingLeave !== null}
        title="Sair sem salvar?"
        message="Há alterações não salvas nesta questão. Se sair agora, elas serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          action?.();
        }}
        onCancel={() => setPendingLeave(null)}
      />

      <ConfirmModal
        visible={releaseKind === "save" && reportedCount > 0}
        title="A questão tinha erro?"
        message="Analise a questão e deixe a correção pronta antes de confirmar. A restrição sai nesta confirmação. Se havia erro, as respostas erradas são zeradas. Se não havia erro, a contagem permanece. As notas do simulado oficial permanecem."
        confirmLabel="Havia erro"
        alternateLabel="Não havia erro"
        cancelLabel="Cancelar"
        tone="primary"
        loading={releaseBusy}
        onConfirm={() => void confirmRelease(true)}
        onAlternate={() => void confirmRelease(false)}
        onCancel={() => { if (!releaseBusy) setReleaseKind(null); }}
      />

      <ConfirmModal
        visible={releaseKind !== null && reportedCount === 0}
        title="Liberar a questão para resposta?"
        message={releaseMessage}
        confirmLabel="Liberar"
        cancelLabel="Cancelar"
        tone="primary"
        loading={releaseBusy}
        onConfirm={() => void confirmRelease()}
        onCancel={() => { if (!releaseBusy) setReleaseKind(null); }}
      />

      <MessageModal
        visible={analysisHint}
        type="info"
        title="Confirme no salvar"
        message="Analise a questão e corrija se houver erro. A restrição sai ao salvar, quando você confirma se havia erro ou não."
        onClose={() => setAnalysisHint(false)}
      />

      <ConfirmModal
        visible={confirmReset}
        title="Resetar como nova?"
        message="As respostas de prática desta questão saem da soma e do ranking. Ela volta como nova por 14 dias e os alunos respondem de novo. As notas do simulado oficial não mudam."
        confirmLabel="Resetar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={resetting}
        onConfirm={() => void confirmResetPractice()}
        onCancel={() => { if (!resetting) setConfirmReset(false); }}
      />

      <ConfirmModal
        visible={confirmConvert}
        title="Transformar em objetiva com IA?"
        message="A IA reescreve o comando do enunciado, cria as alternativas com o gabarito e atualiza a explicação. Nada é salvo até você clicar em Salvar."
        confirmLabel="Transformar"
        cancelLabel="Cancelar"
        onConfirm={() => void convertToObjective()}
        onCancel={() => setConfirmConvert(false)}
      />

      <ConfirmModal
        visible={confirmDelete}
        title="Excluir questão?"
        message={`Excluir a questão #${questionId ?? ""}? Ela deixa de aparecer no banco de questões.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        tone="danger"
        loading={deleting}
        onConfirm={() => void confirmDeleteQuestion()}
        onCancel={() => { if (!deleting) setConfirmDelete(false); }}
      />

      <MessageModal
        visible={aiError !== null}
        type="error"
        title={aiError?.title ?? ""}
        message={aiError?.message ?? ""}
        onClose={() => setAiError(null)}
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
