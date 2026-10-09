import React, { useEffect, useMemo, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import FormSelect from "../ui/FormSelect";
import FormInput from "../ui/FormInput";
import SearchableSelect from "../ui/SearchableSelect";
import RichTextInput from "../ui/RichTextInput";
import DeleteIconButton from "../ui/DeleteIconButton";
import ClassificationFields from "./ClassificationFields";
import OptionsEditor from "./OptionsEditor";
import TopicMultiSelect from "./TopicMultiSelect";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { aiCorrectQuestion, aiRegenerateImage, aiReviewQuestion, aiSimilarQuestions, type SimilarFormContext } from "../../services/questionAi";
import type { QuestionReview } from "../../types/questionAi";
import QuestionReviewPanel from "./QuestionReviewPanel";
import type { AiImageReview } from "../../types/questionAi";
import { imageContentSignature, imageQuestionContent, imageReviewIssue } from "../../utils/questionImageReview";
import { createStandaloneQuestion } from "../../services/questionBank";
import { getApiErrorMessage, getApiValidationErrors } from "../../utils/apiErrors";
import { describeAiError } from "../../utils/aiErrors";
import MessageModal from "../ui/MessageModal";
import ProgressDialog from "../ui/ProgressDialog";
import {
  type ContentForm,
  contentFromSuggestion,
  contentPayload,
  validateContent,
} from "../../utils/questionContent";
import {
  type ClassificationForm,
  EMPTY_CLASSIFICATION_FORM,
  classificationFromSuggestion,
  diffClassification,
  validateClassification,
} from "../../utils/questionClassification";
import { color } from "../../constants/theme";

/** Dados mínimos da questão de origem. */
export type SimilarSource = {
  id: number;
  type: "multiple_choice" | "essay";
  optionsCount: number;
  difficultyId: number | null;
  imageUrl?: string | null;
  /** Estado atual do formulário: a IA usa ele, não a versão salva. */
  context?: SimilarFormContext;
};

type Draft = {
  key: string;
  include: boolean;
  content: ContentForm;
  classification: ClassificationForm;
  errors: Record<string, string>;
  showClassification: boolean;
  image?: AiImageReview;
  imageSignature?: string;
  imageInstructions: string;
  imageLoadError: boolean;
  review?: QuestionReview;
  manualApproved: boolean;
};

type Props = {
  visible: boolean;
  source: SimilarSource | null;
  catalogs: QuestionBankCatalogs;
  onClose: () => void;
  /** Chamado após incluir as questões (count = quantas foram salvas). */
  onCreated: (count: number) => void;
  setToast: (toast: { visible: boolean; type: "success" | "error"; message: string }) => void;
};

const QUANTITY_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const OPTIONS_COUNT = Array.from({ length: 5 }, (_, i) => ({ value: i + 2, label: `${i + 2} alternativas` }));
const SAME_DIFFICULTY = "same";
const MAX_INSTRUCTIONS = 500;

let draftSeq = 0;

/**
 * Gera questões semelhantes com IA: 1) quantidade, dificuldade e nº de alternativas;
 * 2) revisão/edição de cada questão gerada; 3) inclusão no banco (questões avulsas).
 */
export default function SimilarQuestionsModal({ visible, source, catalogs, onClose, onCreated, setToast }: Props) {
  const [step, setStep] = useState<"config" | "review">("config");
  const [quantity, setQuantity] = useState(3);
  const [difficulty, setDifficulty] = useState<string>(SAME_DIFFICULTY);
  const [optionsCount, setOptionsCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  /** Falha da IA: exibida no modal de erro padrão do sistema. */
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [instructionsError, setInstructionsError] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [topicIds, setTopicIds] = useState<number[]>([]);

  useEffect(() => {
    if (!visible || !source) return;
    setStep("config");
    setDrafts([]);
    setError(null);
    setDifficulty(SAME_DIFFICULTY);
    setInstructions("");
    setInstructionsError(undefined);
    setOptionsCount(Math.min(6, Math.max(2, source.optionsCount || 5)));
    setSubjectId(source.context?.subject_id ?? null);
    setTopicIds(source.context?.topic_ids ?? []);
  }, [visible, source]);

  const allTopics = useMemo(
    () => catalogs.taxonomy.flatMap((s) => s.topics.map((t) => ({ ...t, subject_id: s.id, subject_name: s.name }))),
    [catalogs.taxonomy]
  );
  const topicSubjectById = useMemo(() => new Map(allTopics.map((t) => [t.id, t.subject_id])), [allTopics]);
  const topicsForSubject = useMemo(
    () => (subjectId ? allTopics.filter((t) => t.subject_id === subjectId).map(({ subject_name, ...t }) => t) : allTopics),
    [allTopics, subjectId]
  );
  const subjectWithoutTopics = !!subjectId && topicsForSubject.length === 0;

  const included = drafts.filter((d) => d.include);
  const reviewBlocks = (draft: Draft) => draft.include && !!draft.review && !draft.review.aprovada && !draft.manualApproved;
  const busy = generating || saving || regenerating !== null || reviewing !== null;
  const isEssay = source?.type === "essay";

  const difficultyOptions = useMemo(
    () => [
      {
        value: SAME_DIFFICULTY,
        label: source?.difficultyId
          ? `Mesma da original (${catalogs.difficulties.find((d) => d.id === source.difficultyId)?.name ?? "—"})`
          : "Mesma da original (sem dificuldade)",
      },
      ...catalogs.difficulties.map((d) => ({ value: String(d.id), label: d.name })),
    ],
    [catalogs.difficulties, source?.difficultyId]
  );

  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const generate = async () => {
    if (!source) return;
    setGenerating(true);
    setError(null);
    setInstructionsError(undefined);
    try {
      const response = await aiSimilarQuestions(source.id, {
        quantity,
        difficulty_id: difficulty === SAME_DIFFICULTY ? undefined : Number(difficulty),
        options_count: isEssay ? undefined : optionsCount,
        instructions: instructions.trim() || undefined,
        context: source.context
          ? { ...source.context, subject_id: subjectId, topic_ids: topicIds }
          : undefined,
      }, Boolean(source.imageUrl));
      setDrafts(
        response.body.questions.map((q) => ({
          key: `draft-${draftSeq++}`,
          include: true,
          content: contentFromSuggestion(q),
          classification: {
            ...classificationFromSuggestion(q),
            ...(subjectId !== null ? { subject_id: subjectId, topic_ids: [...topicIds] } : {}),
          },
          errors: {},
          showClassification: false,
          image: q.generation_id && q.image_generation
            ? { generation_id: q.generation_id, image_url: q.image_url ?? null, image_generation: q.image_generation }
            : undefined,
          imageSignature: imageContentSignature(contentFromSuggestion(q)),
          imageInstructions: "",
          imageLoadError: false,
          review: q.review,
          manualApproved: false,
        }))
      );
      setStep("review");
    } catch (err) {
      const fieldError = getApiValidationErrors(err).instructions;
      if (fieldError) setInstructionsError(fieldError);
      else setError(describeAiError(err, "Não foi possível gerar as questões"));
    } finally {
      setGenerating(false);
    }
  };

  const regenerateImage = async (draft: Draft) => {
    if (!draft.image || busy) return;
    const errors = validateContent(draft.content);
    if (Object.keys(errors).length) {
      updateDraft(draft.key, { errors });
      return;
    }
    setRegenerating(draft.key);
    try {
      const response = await aiRegenerateImage(draft.image.generation_id, imageQuestionContent(draft.content), draft.imageInstructions.trim() || undefined);
      updateDraft(draft.key, {
        image: response.body,
        content: { ...draft.content, image_url: response.body.image_url ?? "" },
        imageSignature: imageContentSignature(draft.content),
        imageLoadError: false,
        errors: {},
      });
      setToast({ visible: true, type: response.body.image_generation.status === "READY" ? "success" : "error", message: response.message });
    } catch (err) {
      setError(describeAiError(err, "Não foi possível regenerar a imagem"));
    } finally {
      setRegenerating(null);
    }
  };

  const reviewInput = (draft: Draft) => ({
    question_text: draft.content.question_text,
    explanation: draft.content.explanation,
    type: draft.content.type,
    options: draft.content.options.map(({ option_text, is_correct }) => ({ option_text, is_correct })),
    attempts: draft.review?.attempts ?? 0,
    force: true,
  });

  const validateDraft = async (draft: Draft) => {
    setReviewing(draft.key);
    try {
      const response = await aiReviewQuestion(reviewInput(draft));
      const question = response.body.question;
      updateDraft(draft.key, {
        review: response.body,
        manualApproved: false,
        errors: {},
        content: question?.options?.length
          ? {
              ...draft.content,
              question_text: question.question_text || draft.content.question_text,
              explanation: question.explanation ?? draft.content.explanation,
              options: contentFromSuggestion({ ...question, type: draft.content.type }).options,
            }
          : draft.content,
      });
    } catch (err) {
      setError(describeAiError(err, "Não foi possível validar a questão"));
    } finally {
      setReviewing(null);
    }
  };

  const correctDraft = async (draft: Draft) => {
    setReviewing(draft.key);
    try {
      const response = await aiCorrectQuestion(reviewInput(draft));
      const question = response.body.question;
      updateDraft(draft.key, {
        review: response.body,
        manualApproved: false,
        errors: {},
        content: question
          ? {
              ...draft.content,
              question_text: question.question_text,
              explanation: question.explanation ?? "",
              options: question.options?.length
                ? contentFromSuggestion({ ...question, type: draft.content.type }).options
                : draft.content.options,
            }
          : draft.content,
      });
    } catch (err) {
      setError(describeAiError(err, "Não foi possível corrigir a questão"));
    } finally {
      setReviewing(null);
    }
  };

  /** Salva as marcadas uma a uma; as salvas saem da lista e as com erro ficam para correção. */
  const includeQuestions = async () => {
    let hasClientErrors = false;
    const checked = drafts.map((d) => {
      if (!d.include) return d;
      const classificationErrors = validateClassification(d.classification, catalogs.taxonomy);
      const errors = { ...validateContent(d.content), ...classificationErrors };
      if (d.review && !d.review.aprovada && !d.manualApproved) {
        errors.review = "A revisão não aprovou esta questão. Corrija com IA ou aprove manualmente.";
      }
      const imageIssue = imageReviewIssue(d.content, d.image, d.imageSignature);
      if (imageIssue || d.imageLoadError) errors.image = imageIssue || "Não foi possível visualizar a imagem. Regenere antes de aprovar.";
      if (Object.keys(errors).length) hasClientErrors = true;
      return { ...d, errors, showClassification: d.showClassification || Object.keys(classificationErrors).length > 0 };
    });
    setDrafts(checked);
    if (hasClientErrors) {
      setToast({ visible: true, type: "error", message: "Corrija as questões destacadas antes de incluir." });
      return;
    }

    setSaving(true);
    let saved = 0;
    const remaining: Draft[] = [];
    for (const draft of checked) {
      if (!draft.include) {
        remaining.push(draft);
        continue;
      }
      try {
        await createStandaloneQuestion({
          ...contentPayload(draft.content),
          ...diffClassification(EMPTY_CLASSIFICATION_FORM, draft.classification),
          ...(draft.image ? { generation_id: draft.image.generation_id } : {}),
        });
        saved++;
      } catch (err) {
        remaining.push({ ...draft, errors: { form: getApiErrorMessage(err, "Não foi possível salvar esta questão.") } });
      }
    }
    setSaving(false);

    if (remaining.some((d) => d.include)) {
      setDrafts(remaining);
      if (saved > 0) onCreated(saved);
      setToast({ visible: true, type: "error", message: `${saved} questão(ões) incluída(s); corrija as que ficaram com erro.` });
      return;
    }
    onCreated(saved);
    onClose();
  };

  const footer =
    step === "config" ? (
      <>
        <Button label="Cancelar" onPress={onClose} disabled={generating} />
        <Button variant="ai" icon={Sparkles} label="Gerar questões" onPress={() => void generate()} loading={generating} />
      </>
    ) : (
      <>
        <Button variant="ai" icon={Sparkles} label="Gerar de novo" onPress={() => setStep("config")} disabled={busy} />
        <Button
          variant="primary"
          icon={Check}
          label={included.length === 1 ? "Incluir 1 questão" : `Incluir ${included.length} questões`}
          onPress={() => void includeQuestions()}
          loading={saving}
          disabled={busy || included.length === 0 || included.some((draft) => reviewBlocks(draft) || imageReviewIssue(draft.content, draft.image, draft.imageSignature) !== null || draft.imageLoadError)}
        />
      </>
    );

  return (
    <>
    <Modal
      visible={visible}
      title={step === "config" ? `Criar questões semelhantes à #${source?.id ?? ""}` : "Revisar questões geradas"}
      onClose={() => !busy && onClose()}
      size={step === "config" ? "sm" : "lg"}
      compact
      maxHeight="92%"
      showScrollIndicator
      footer={<View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>{footer}</View>}
    >
      {step === "config" ? (
        <View style={{ gap: 4 }}>
          <Text className="text-sm text-ink-muted" style={{ marginBottom: 12 }}>
            A IA cria questões inéditas sobre o mesmo conteúdo, já com gabarito, explicação e classificação. Você revisa
            tudo antes de incluir.
          </Text>
          {source?.imageUrl ? (
            <Text className="text-sm text-warning" style={{ marginBottom: 12 }}>
              A referência possui imagem: a IA fará análise visual, recriação, geração e validação.
              O modelo principal pode gerar cobrança no OpenRouter. No MVP síncrono, prefira uma questão por vez:
              lotes maiores podem exceder o timeout do servidor, mesmo com o painel aguardando.
            </Text>
          ) : null}
          <FormSelect label="Quantidade de questões" value={quantity} options={QUANTITY_OPTIONS} onChange={(v) => setQuantity(Number(v))} />
          <FormSelect label="Dificuldade" value={difficulty} options={difficultyOptions} onChange={setDifficulty} />
          {!isEssay && (
            <FormSelect
              label="Número de alternativas"
              value={optionsCount}
              options={OPTIONS_COUNT}
              onChange={(v) => setOptionsCount(Number(v))}
            />
          )}
          <SearchableSelect
            dense
            showSelectedPreview={false}
            label="Disciplina"
            placeholder="Selecione a disciplina"
            modalTitle="Selecionar disciplina"
            options={catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }))}
            value={subjectId ? String(subjectId) : ""}
            onChange={(value) => {
              const next = value ? Number(value) : null;
              setSubjectId(next);
              setTopicIds((ids) => ids.filter((id) => next !== null && topicSubjectById.get(id) === next));
            }}
          />
          <TopicMultiSelect
            topics={topicsForSubject}
            value={topicIds}
            onChange={(ids) => {
              if (subjectId || ids.length === 0) {
                setTopicIds(ids);
                return;
              }
              const nextSubject = topicSubjectById.get(ids[0]) ?? null;
              setSubjectId(nextSubject);
              setTopicIds(ids.filter((id) => topicSubjectById.get(id) === nextSubject));
            }}
            required={!subjectWithoutTopics}
            disabled={subjectWithoutTopics}
            disabledHint="Esta disciplina não tem assuntos cadastrados. Cadastre em Banco de questões › Taxonomia."
          />
          <FormInput
            dense
            label="Observações para a IA (opcional)"
            value={instructions}
            onChangeText={(v) => {
              setInstructions(v.slice(0, MAX_INSTRUCTIONS));
              setInstructionsError(undefined);
            }}
            error={instructionsError}
            multiline
            numberOfLines={3}
            maxLength={MAX_INSTRUCTIONS}
            placeholder="Ex.: use contextos do agronegócio; foque em frações; evite números negativos."
            style={{ minHeight: 80, paddingVertical: 10, textAlignVertical: "top" }}
          />
          <Text className="text-xs text-ink-subtle" style={{ marginBottom: 12 }}>
            Só ajusta o conteúdo das questões (tema, contexto, estilo, foco). {instructions.length}/{MAX_INSTRUCTIONS}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Text className="text-sm text-ink-muted">
            Revise e ajuste cada questão — confira principalmente o gabarito, a IA pode errar. Desmarque as que não quiser incluir.
          </Text>
          {drafts.map((draft, index) => (
            <View
              key={draft.key}
              className={`border rounded-ds-md ${draft.errors.form || Object.keys(draft.errors).length ? "border-danger" : "border-border"}`}
              style={{ opacity: draft.include ? 1 : 0.6 }}
            >
              <View
                className="flex-row items-center justify-between border-b border-border bg-surface-sunken"
                style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}
              >
                <TouchableOpacity
                  role="checkbox"
                  aria-checked={draft.include}
                  onPress={() => updateDraft(draft.key, { include: !draft.include })}
                  disabled={busy}
                  className="flex-row items-center"
                  style={{ gap: 8 }}
                >
                  <View
                    className="items-center justify-center rounded-ds-sm"
                    style={{
                      width: 16,
                      height: 16,
                      borderWidth: 1.5,
                      borderColor: draft.include ? color.brand : color["border-strong"],
                      backgroundColor: draft.include ? color.brand : "transparent",
                    }}
                  >
                    {draft.include && <Check size={12} color={color["on-brand"]} strokeWidth={2.5} />}
                  </View>
                  <Text className="text-sm font-medium text-ink">
                    Questão {index + 1} de {drafts.length}
                  </Text>
                </TouchableOpacity>
                <DeleteIconButton
                  label={`Descartar questão ${index + 1}`}
                  onPress={() => setDrafts((prev) => prev.filter((d) => d.key !== draft.key))}
                  disabled={busy}
                />
              </View>

              {draft.include && (
                <View style={{ padding: 14 }}>
                  {draft.errors.form ? (
                    <Text className="text-xs font-medium text-danger" style={{ marginBottom: 8 }}>
                      {draft.errors.form}
                    </Text>
                  ) : null}
                  <RichTextInput
                    label="Enunciado"
                    value={draft.content.question_text}
                    onChange={(v) => updateDraft(draft.key, { content: { ...draft.content, question_text: v } })}
                    error={draft.errors.question_text}
                    disabled={busy}
                    minHeight={100}
                  />
                  {draft.image ? (
                    <View style={{ gap: 8, marginBottom: 14 }}>
                      {draft.content.image_url ? (
                        <Image
                          source={{ uri: draft.content.image_url }}
                          accessibilityLabel={`Imagem gerada para a questão ${index + 1}`}
                          resizeMode="contain"
                          style={{ width: "100%", height: 240 }}
                          onError={() => updateDraft(draft.key, { imageLoadError: true })}
                        />
                      ) : null}
                      <Text className="text-xs text-ink-muted">
                        Modelo: {draft.image.image_generation.model ?? "—"} · Tentativas: {draft.image.image_generation.attempts}
                      </Text>
                      {imageReviewIssue(draft.content, draft.image, draft.imageSignature) || draft.imageLoadError ? (
                        <Text className="text-sm text-danger" aria-live="polite">
                          {imageReviewIssue(draft.content, draft.image, draft.imageSignature) || "Não foi possível visualizar a imagem."}
                        </Text>
                      ) : (
                        <Text className="text-xs text-ink-muted">
                          {draft.image.image_generation.validation
                            ? `IA: imagem validada — ${Math.round(draft.image.image_generation.validation.confidence * 100)}%. Avaliação auxiliar; confira os dados.`
                            : "Sem validação automática. Confira todos os dados da imagem antes de aprovar."}
                        </Text>
                      )}
                      <FormInput
                        label="Preferência de estilo para regenerar"
                        value={draft.imageInstructions}
                        onChangeText={(value) => updateDraft(draft.key, { imageInstructions: value })}
                        maxLength={500}
                        placeholder="Ex.: fundo simples e labels maiores"
                        editable={!busy}
                      />
                      <Button variant="ai"
                        icon={Sparkles}
                        label="Regenerar imagem com IA"
                        onPress={() => void regenerateImage(draft)}
                        loading={regenerating === draft.key}
                        disabled={busy}
                      />
                      {draft.errors.image ? <Text className="text-xs text-danger">{draft.errors.image}</Text> : null}
                    </View>
                  ) : null}
                  {draft.content.type === "multiple_choice" && (
                    <OptionsEditor
                      labelId={`${draft.key}-alternativas`}
                      options={draft.content.options}
                      onChange={(options) => updateDraft(draft.key, { content: { ...draft.content, options } })}
                      error={draft.errors.options}
                      disabled={busy}
                    />
                  )}
                  {draft.errors.review ? (
                    <Text className="text-xs font-medium text-danger" style={{ marginBottom: 8 }}>
                      {draft.errors.review}
                    </Text>
                  ) : null}
                  <QuestionReviewPanel
                    review={draft.review ?? null}
                    busy={reviewing === draft.key}
                    onValidate={() => void validateDraft(draft)}
                    onCorrect={() => void correctDraft(draft)}
                    onApprove={() => updateDraft(draft.key, {
                      manualApproved: true,
                      errors: {},
                      review: draft.review ? { ...draft.review, aprovada: true, status: "aprovada_manual" } : draft.review,
                    })}
                  />
                  <RichTextInput
                    label="Explicação"
                    value={draft.content.explanation}
                    onChange={(v) => updateDraft(draft.key, { content: { ...draft.content, explanation: v } })}
                    minHeight={72}
                    disabled={busy}
                  />
                  <FormSelect
                    dense
                    label="Dificuldade"
                    value={draft.classification.difficulty_id ?? ""}
                    placeholder="Sem dificuldade"
                    options={catalogs.difficulties.map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(v) =>
                      updateDraft(draft.key, { classification: { ...draft.classification, difficulty_id: v ? Number(v) : null } })
                    }
                  />
                  <TouchableOpacity
                    onPress={() => updateDraft(draft.key, { showClassification: !draft.showClassification })}
                    className="flex-row items-center"
                    style={{ gap: 6, marginTop: 4, alignSelf: "flex-start" }}
                    aria-expanded={draft.showClassification}
                  >
                    <Text className="text-sm font-medium text-brand">
                      {draft.showClassification ? "Ocultar classificação" : "Editar classificação completa"}
                    </Text>
                    <Icon icon={draft.showClassification ? ChevronUp : ChevronDown} color={color.brand} />
                  </TouchableOpacity>
                  {draft.showClassification && (
                    <View style={{ marginTop: 12 }}>
                      <ClassificationFields
                        form={draft.classification}
                        onChange={(classification) => {
                          const { subject_id, topic_ids, ...errors } = draft.errors;
                          updateDraft(draft.key, { classification, errors });
                        }}
                        catalogs={catalogs}
                        errors={draft.errors}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
          {drafts.length === 0 && (
            <Text className="text-sm text-ink-muted text-center" style={{ paddingVertical: 24 }}>
              Nenhuma questão para incluir. Use “Gerar de novo”.
            </Text>
          )}
        </View>
      )}
    </Modal>

    <ProgressDialog
      visible={generating}
      title={quantity === 1 ? "Gerando 1 questão semelhante" : `Gerando ${quantity} questões semelhantes`}
      message="A IA está criando enunciado, alternativas, gabarito, explicação e classificação."
      expectedSeconds={source?.imageUrl ? 180 : 60}
      stages={
        source?.imageUrl
          ? [
              { after: 0, label: "Analisando a imagem da questão…" },
              { after: 20, label: "Criando as questões…" },
              { after: 60, label: "Gerando as novas imagens…" },
              { after: 150, label: "Conferindo as imagens geradas…" },
            ]
          : [
              { after: 0, label: "Lendo a questão de referência…" },
              { after: 5, label: "Criando as questões…" },
              { after: 30, label: "Conferindo gabaritos e classificação…" },
            ]
      }
    />

    <ProgressDialog
      visible={regenerating !== null}
      title="Regenerando a imagem"
      message="A IA está desenhando uma nova imagem para esta questão."
      expectedSeconds={90}
      stages={[
        { after: 0, label: "Gerando a imagem…" },
        { after: 45, label: "Conferindo a imagem gerada…" },
      ]}
    />

    <MessageModal
      visible={error !== null}
      type="error"
      title={error?.title ?? ""}
      message={error?.message ?? ""}
      onClose={() => setError(null)}
    />
    </>
  );
}
