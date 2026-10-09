import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { ExternalLink, ImagePlus, Sparkles, Trash2 } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import RichTextInput from "../../components/ui/RichTextInput";
import FormInput from "../../components/ui/FormInput";
import RichText from "../../components/ui/RichText";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import MessageModal from "../../components/ui/MessageModal";
import { describeAiError } from "../../utils/aiErrors";
import SegmentedControl from "../../components/banco-questoes/SegmentedControl";
import ClassificationFields from "../../components/banco-questoes/ClassificationFields";
import OptionsEditor from "../../components/banco-questoes/OptionsEditor";
import SimilarQuestionsModal, { type SimilarSource } from "../../components/banco-questoes/SimilarQuestionsModal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import {
  createStandaloneQuestion,
  fetchQuestionBankQuestion,
  patchQuestionClassification,
  updateStandaloneQuestion,
  uploadQuestionBankImage,
} from "../../services/questionBank";
import { aiApproveQuestionReview, aiAutofillQuestion, aiCorrectQuestion, aiReviewQuestion, fetchQuestionReviews } from "../../services/questionAi";
import type { QuestionReview } from "../../types/questionAi";
import QuestionReviewPanel from "../../components/banco-questoes/QuestionReviewPanel";
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
import type { QuestionBankQuestion } from "../../types/questionBank";

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

/**
 * Criação e edição de questões do banco: único lugar para classificar e gerar semelhantes.
 * Avulsa: conteúdo + classificação. De simulado: conteúdo só leitura (editado pelo simulado), classificação editável.
 */
export default function QuestionEditScreen({ navigate, questionId, listQuery = "" }: Props) {
  const isEdit = questionId !== null;
  const { isMobile, contentPadding } = useResponsiveLayout();
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
    attempts: review?.attempts ?? 0,
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
        return;
      }
      const response = action === "correct" ? await aiCorrectQuestion(reviewPayload()) : await aiReviewQuestion(reviewPayload());
      setReview(response.body);
      if (response.body.id) setReviewHistory((prev) => [response.body, ...prev.filter((item) => item.id !== response.body.id)]);
      const question = response.body.question;
      if (question && !isFromExam) {
        setContent((prev) => ({
          ...prev,
          question_text: question.question_text || prev.question_text,
          explanation: question.explanation ?? prev.explanation,
          options: question.options?.length
            ? question.options.map((option, index) => ({ key: `opt-review-${index}-${Date.now()}`, option_text: option.option_text, is_correct: option.is_correct }))
            : prev.options,
        }));
      }
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

  /** Questão de simulado: só a classificação é gravada (o conteúdo é do simulado). */
  const saveExamClassification = async () => {
    if (questionId === null) return;
    const clientErrors = validateClassification(classification, catalogs.taxonomy);
    if (Object.keys(clientErrors).length) {
      showClientErrors(clientErrors);
      return;
    }
    const patch = diffClassification(initialClassification, classification);
    if (!Object.keys(patch).length) {
      navigate("questoes-classificar", { questionId, query: listQuery });
      return;
    }
    setSaving("save");
    try {
      const response = await patchQuestionClassification(questionId, patch);
      showApiToast(setToast, response, "Classificação salva com sucesso.");
      setInitialClassification(classification);
      navigate("questoes-classificar", { questionId, query: listQuery });
    } catch (error) {
      setErrors(getApiValidationErrors(error));
      showApiErrorToast(setToast, error, "Não foi possível salvar a classificação.");
    } finally {
      setSaving(null);
    }
  };

  const save = async (mode: "save" | "another") => {
    if (aiFilling || uploading || saving !== null) return;
    if (isFromExam) {
      await saveExamClassification();
      return;
    }
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

  const title = isEdit ? `Editar questão #${questionId}` : "Nova questão";

  const examContentPanel = examQuestion && (
    <Panel
      title="Conteúdo"
      description={`Questão do simulado "${examQuestion.exam?.title ?? ""}". O conteúdo é editado pelo simulado; aqui você altera a classificação.`}
      actions={
        examQuestion.exam ? (
          <Button
            size="sm"
            icon={ExternalLink}
            label="Abrir simulado"
            onPress={() => leave(() => navigate("simulados-form", { examId: examQuestion.exam!.id }))}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 12 }}>
        <FormInput
          label="Nome da prova/simulado de origem"
          value={examQuestion.exam?.title || examQuestion.source_exam_name || ""}
          editable={false}
        />
        <Text className="text-xs text-ink-subtle" style={{ marginTop: -8 }}>
          Definido pelo simulado. Não pode ser alterado nesta tela.
        </Text>
        {!!examQuestion.question_text?.trim() && <RichText className="text-sm text-ink leading-6" selectable value={examQuestion.question_text} />}
        {!!examQuestion.image_url && (
          <Image source={{ uri: examQuestion.image_url }} accessibilityLabel="Imagem do enunciado" style={{ width: "100%", height: isMobile ? 180 : 260 }} resizeMode="contain" />
        )}
        {(examQuestion.options ?? []).map((option, i) => (
          <View
            key={option.id}
            className={`flex-row rounded-ds-md border px-3 py-2 ${option.is_correct ? "bg-success-tint border-success" : "bg-surface border-border"}`}
            style={{ gap: 8 }}
          >
            <Text className={`text-sm font-semibold ${option.is_correct ? "text-success" : "text-ink-muted"}`}>{"ABCDEFGHIJ"[i]})</Text>
            <RichText className="text-sm text-ink flex-1" value={option.option_text} />
          </View>
        ))}
      </View>
    </Panel>
  );

  const contentPanel = (
    <Panel
      title="Conteúdo"
      description="Enunciado, alternativas e gabarito da questão avulsa."
    >
      <SegmentedControl<QuestionType>
        label="Tipo"
        allowClear={false}
        options={[
          { value: "multiple_choice", label: "Objetiva" },
          { value: "essay", label: "Dissertativa" },
        ]}
        value={content.type}
        onChange={(v) => v && setField("type", v)}
      />
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
        minHeight={140}
        disabled={aiFilling}
        placeholder="Texto do enunciado (ou envie a imagem abaixo). Pode colar a questão inteira, com as alternativas."
      />

        <View style={{ gap: 8, marginBottom: 16 }}>
          <Text className={`text-xs ${aiStatusError ? "text-danger" : "text-ink-muted"}`} aria-live="polite">
            {aiStatusLoading
              ? "Verificando configuração de IA…"
              : aiStatusError
                ? aiStatusError
                : !aiAvailable
                  ? "Para autocompletar, cadastre uma chave em Configurações → Integração com IA."
                  : "Escreva ao menos 15 caracteres no enunciado e use “Autocompletar com IA” para sugerir alternativas, gabarito, explicação e classificação. Revise antes de salvar."}
          </Text>
          {aiStatusError ? <Button size="sm" label="Verificar IA novamente" onPress={() => void loadAiStatus()} /> : null}
        </View>

      {showAiHint && (
        <View
          className="flex-row flex-wrap items-center border border-brand bg-brand-tint rounded-ds-md"
          style={{ gap: 12, padding: 12, marginBottom: 16 }}
          aria-live="polite"
        >
          <Text className="text-sm text-ink" style={{ flex: 1, minWidth: 220 }}>
            Enunciado pronto. Use “Autocompletar com IA” no topo para preencher alternativas, gabarito, explicação e classificação.
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" label="Agora não" onPress={() => setAiHintDismissed(true)} />
          </View>
        </View>
      )}

      {/* Imagem do enunciado */}
      <View className="mb-4">
        <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
          Imagem do enunciado
        </Text>
        {content.image_url ? (
          <View className="border border-border rounded-ds-md p-2" style={{ gap: 8 }}>
            <Image
              source={{ uri: content.image_url }}
              accessibilityLabel="Imagem do enunciado"
              style={{ width: "100%", height: isMobile ? 180 : 260 }}
              resizeMode="contain"
            />
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              <Button size="sm" icon={ImagePlus} label="Trocar imagem" onPress={() => fileInputRef.current?.click()} loading={uploading} disabled={aiFilling || saving !== null} />
              <Button variant="ai"
                size="sm"
                icon={Sparkles}
                label="Gerar nova imagem com IA"
                onPress={() => void openRedraw()}
                disabled={aiFilling || saving !== null || uploading}
              />
              <Button size="sm" variant="danger" icon={Trash2} label="Remover imagem" onPress={() => setField("image_url", "")} disabled={aiFilling || saving !== null} />
            </View>
          </View>
        ) : (
          <Button icon={ImagePlus} label="Enviar imagem" onPress={() => fileInputRef.current?.click()} loading={uploading} disabled={aiFilling || saving !== null} />
        )}
        <Text className="text-xs text-ink-subtle" style={{ marginTop: 6 }}>
          JPG, PNG, WEBP ou GIF, até 5MB.
        </Text>
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

      {/* Alternativas */}
      {content.type === "multiple_choice" && (
        <OptionsEditor options={content.options} onChange={(options) => setField("options", options)} error={errors.options} disabled={aiFilling} />
      )}

      <RichTextInput
        label="Explicação"
        value={content.explanation}
        onChange={(v) => setField("explanation", v)}
        error={errors.explanation}
        minHeight={96}
        disabled={aiFilling}
        placeholder="Comentário da resposta (opcional)"
      />
    </Panel>
  );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}>
        <View className="mb-6">
          <PageHeader
            breadcrumb={[{ label: "Banco de questões", onPress: () => leave(goToList) }, { label: isEdit ? `Questão #${questionId}` : "Nova questão" }]}
            title={title}
            description={
              !isEdit
                ? "Questão avulsa, sem vínculo com simulado."
                : isFromExam
                  ? "Classificação da questão de simulado."
                  : "Conteúdo e classificação da questão avulsa."
            }
            actions={
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {!isFromExam && (
                <Button variant="ai"
                  icon={Sparkles}
                  label="Autocompletar com IA"
                  onPress={() => void autofill()}
                  loading={aiFilling}
                  disabled={loading || !!loadError || saving !== null || uploading}
                />
                )}
                {isEdit && (
                  <Button variant="ai"
                    icon={Sparkles}
                    label="Gerar similares com IA"
                    onPress={() => void openSimilar()}
                    disabled={loading || !!loadError || aiFilling || saving !== null || uploading}
                  />
                )}
              </View>
            }
          />
        </View>

        {!loading && !loadError && (examQuestion?.issue_reports_count ?? 0) > 0 ? (
          <Text className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {examQuestion?.issue_reports_count === 1
              ? "1 aluno marcou que esta questão tem um erro e precisa de revisão."
              : `${examQuestion?.issue_reports_count} alunos marcaram que esta questão tem um erro e precisa de revisão.`}
          </Text>
        ) : null}

        {!loading && !loadError ? (
          <QuestionReviewPanel
            review={review}
            history={reviewHistory}
            busy={reviewing}
            canCorrect={!isFromExam}
            onValidate={() => void runReview("validate")}
            onCorrect={() => void runReview("correct")}
            onApprove={questionId !== null ? () => void runReview("approve") : undefined}
          />
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
          <>
            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 24, alignItems: "flex-start" }}>
              <View style={{ flex: 3, width: isMobile ? "100%" : undefined }}>{isFromExam ? examContentPanel : contentPanel}</View>
              <View style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320 }}>
                <Panel title="Classificação" description="Disciplina, assuntos, dificuldade, banca e tags.">
                  <ClassificationFields
                    form={classification}
                    onChange={changeClassification}
                    catalogs={catalogs}
                    errors={errors}
                  />
                </Panel>
              </View>
            </View>

            <View className="flex-row flex-wrap justify-end" style={{ gap: 8, marginTop: 24 }}>
              <Button label="Cancelar" onPress={() => leave(goToList)} disabled={saving !== null || aiFilling} />
              {!isEdit && (
                <Button label="Salvar e criar outra" onPress={() => void save("another")} loading={saving === "another"} disabled={saving !== null || aiFilling || uploading} />
              )}
              <Button variant="primary" label={isEdit ? "Salvar alterações" : "Salvar questão"} onPress={() => void save("save")} loading={saving === "save"} disabled={saving !== null} />
            </View>
          </>
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
        visible={confirmConvert}
        title="Transformar em objetiva com IA?"
        message="A IA reescreve o comando do enunciado, cria as alternativas com o gabarito e atualiza a explicação. Nada é salvo até você clicar em Salvar."
        confirmLabel="Transformar"
        cancelLabel="Cancelar"
        onConfirm={() => void convertToObjective()}
        onCancel={() => setConfirmConvert(false)}
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
