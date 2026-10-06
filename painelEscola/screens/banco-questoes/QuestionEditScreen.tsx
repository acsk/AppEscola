import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import RichTextInput from "../../components/ui/RichTextInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import SegmentedControl from "../../components/banco-questoes/SegmentedControl";
import ClassificationFields from "../../components/banco-questoes/ClassificationFields";
import OptionsEditor from "../../components/banco-questoes/OptionsEditor";
import SimilarQuestionsModal, { type SimilarSource } from "../../components/banco-questoes/SimilarQuestionsModal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import {
  createStandaloneQuestion,
  fetchQuestionBankQuestion,
  updateStandaloneQuestion,
  uploadQuestionBankImage,
} from "../../services/questionBank";
import { aiAutofillQuestion, fetchAiStatus } from "../../services/questionAi";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import { prepareImageForUpload } from "../../utils/imageCompression";
import {
  type ContentForm,
  type QuestionType,
  EMPTY_CONTENT_FORM,
  contentFromQuestion,
  contentPayload,
  mergeContentSuggestion,
  validateContent,
} from "../../utils/questionContent";
import {
  type ClassificationForm,
  EMPTY_CLASSIFICATION_FORM,
  diffClassification,
  mergeClassificationSuggestion,
} from "../../utils/questionClassification";
import { plainRichText } from "../../utils/richText";
import { color } from "../../constants/theme";

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

/** Criação e edição do conteúdo de questões avulsas do banco de questões. */
export default function QuestionEditScreen({ navigate, questionId, listQuery = "" }: Props) {
  const isEdit = questionId !== null;
  const { isMobile, contentPadding } = useResponsiveLayout();
  const catalogs = useQuestionBankCatalogs();

  const [initialContent, setInitialContent] = useState<ContentForm>(EMPTY_CONTENT_FORM);
  const [content, setContent] = useState<ContentForm>(initialContent);
  const [classification, setClassification] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
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
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [aiStatusError, setAiStatusError] = useState<string | null>(null);
  const [aiFilling, setAiFilling] = useState(false);
  const [aiHintDismissed, setAiHintDismissed] = useState(false);
  const [similarSource, setSimilarSource] = useState<SimilarSource | null>(null);
  const [sourceDifficultyId, setSourceDifficultyId] = useState<number | null>(null);

  const loadAiStatus = useCallback(async () => {
    setAiStatusLoading(true);
    setAiStatusError(null);
    try {
      const status = await fetchAiStatus();
      setAiAvailable(status.available);
    } catch (error) {
      setAiAvailable(false);
      setAiStatusError(getApiErrorMessage(error, "Não foi possível verificar a configuração de IA."));
    } finally {
      setAiStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAiStatus();
  }, [loadAiStatus]);

  const load = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    try {
      const q = await fetchQuestionBankQuestion(questionId);
      if (q.origin !== "avulsa") {
        setLoadError("Esta questão pertence a um simulado. Edite o conteúdo pelo simulado.");
        return;
      }
      const form = contentFromQuestion(q);
      setSourceDifficultyId(q.difficulty_id);
      setInitialContent(form);
      setContent(form);
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
      (!isEdit && Object.keys(diffClassification(EMPTY_CLASSIFICATION_FORM, classification)).length > 0),
    [classification, content, initialContent, isEdit]
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

  /** Preenche alternativas, gabarito, explicação e (na criação) a classificação, sem apagar o que já foi digitado. */
  const autofill = async () => {
    if (aiFilling || saving !== null || uploading || !aiAvailable) return;
    if (statementChars < AI_MIN_CHARS) {
      setErrors((prev) => ({ ...prev, question_text: `Escreva um enunciado com pelo menos ${AI_MIN_CHARS} caracteres para usar a IA.` }));
      return;
    }
    setAiFilling(true);
    try {
      const response = await aiAutofillQuestion({
        question_text: content.question_text,
        // "Objetiva" é o padrão da tela: só envia o tipo quando o usuário escolheu "Dissertativa".
        type: content.type === "essay" ? "essay" : undefined,
        options: content.options.map((o) => ({ option_text: o.option_text })),
      });
      const merged = mergeContentSuggestion(content, response.body);
      setContent(merged.form);
      if (!isEdit) {
        const classified = mergeClassificationSuggestion(classification, response.body);
        if (classified.changed) {
          setClassification(classified.form);
        }
      }
      setErrors({});
      setAiHintDismissed(true);
      showApiToast(setToast, response, "Campos sugeridos pela IA. Revise antes de salvar.");
    } catch (error) {
      setErrors((prev) => ({ ...prev, ...getApiValidationErrors(error) }));
      showApiErrorToast(setToast, error, "Não foi possível preencher com IA.");
    } finally {
      setAiFilling(false);
    }
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

  const save = async (mode: "save" | "another") => {
    if (aiFilling || uploading || saving !== null) return;
    const clientErrors = validateContent(content);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setToast({ visible: true, type: "error", message: Object.values(clientErrors)[0] });
      return;
    }

    setSaving(mode);
    try {
      const payload = isEdit
        ? contentPayload(content)
        : { ...contentPayload(content), ...diffClassification(EMPTY_CLASSIFICATION_FORM, classification) };
      const response = isEdit
        ? await updateStandaloneQuestion(questionId, payload)
        : await createStandaloneQuestion(payload);
      showApiToast(setToast, response, "Questão salva com sucesso.");

      if (mode === "another") {
        // Mantém a classificação (útil ao cadastrar várias questões do mesmo assunto/banca).
        const blank = EMPTY_CONTENT_FORM();
        setInitialContent(blank);
        setContent(blank);
        setErrors({});
        return;
      }
      setInitialContent(content);
      navigate("questoes-classificar", { questionId: response.body.id, query: listQuery });
    } catch (error) {
      setErrors(getApiValidationErrors(error));
      showApiErrorToast(setToast, error, "Não foi possível salvar a questão.");
    } finally {
      setSaving(null);
    }
  };

  const title = isEdit ? `Editar questão #${questionId}` : "Nova questão";

  const contentPanel = (
    <Panel
      title="Conteúdo"
      description="Enunciado, alternativas e gabarito da questão avulsa."
      actions={
        isEdit && aiAvailable ? (
          <Button
            size="sm"
            icon={Sparkles}
            label={aiFilling ? "Preenchendo…" : "Preencher com IA"}
            onPress={() => void autofill()}
            loading={aiFilling}
            disabled={statementChars < AI_MIN_CHARS || saving !== null}
          />
        ) : undefined
      }
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

      <RichTextInput
        label="Enunciado"
        value={content.question_text}
        onChange={(v) => setField("question_text", v)}
        error={errors.question_text}
        minHeight={140}
        disabled={aiFilling}
        placeholder="Texto do enunciado (opcional se houver imagem). Pode colar a questão inteira, com as alternativas."
      />

      {!isEdit && (
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
      )}

      {showAiHint && (
        <View
          className="flex-row flex-wrap items-center border border-brand bg-brand-tint rounded-ds-md"
          style={{ gap: 12, padding: 12, marginBottom: 16 }}
          aria-live="polite"
        >
          <Text className="text-sm text-ink" style={{ flex: 1, minWidth: 220 }}>
            Enunciado pronto. A IA pode preencher alternativas, gabarito, explicação{isEdit ? "" : " e classificação"} para você revisar.
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" label="Agora não" onPress={() => setAiHintDismissed(true)} />
            <Button size="sm" variant="primary" icon={Sparkles} label="Autocompletar com IA" onPress={() => void autofill()} disabled={saving !== null || uploading} />
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
            <View className="flex-row" style={{ gap: 8 }}>
              <Button size="sm" icon={ImagePlus} label="Trocar imagem" onPress={() => fileInputRef.current?.click()} loading={uploading} disabled={aiFilling || saving !== null} />
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
            description={isEdit ? "Conteúdo da questão avulsa. A classificação fica na tela da questão." : "Questão avulsa, sem vínculo com simulado."}
            actions={
              !isEdit ? (
                <Button
                  icon={Sparkles}
                  label="Autocompletar com IA"
                  onPress={() => void autofill()}
                  loading={aiFilling}
                  disabled={aiStatusLoading || !aiAvailable || statementChars < AI_MIN_CHARS || saving !== null || uploading}
                />
              ) : aiAvailable && !loading && !loadError ? (
                <Button
                  icon={Sparkles}
                  label="Criar semelhantes com IA"
                  onPress={() =>
                    setSimilarSource({
                      id: questionId,
                      type: initialContent.type,
                      optionsCount: initialContent.options.filter((o) => plainRichText(o.option_text).trim()).length,
                      difficultyId: sourceDifficultyId,
                      imageUrl: initialContent.image_url,
                    })
                  }
                />
              ) : undefined
            }
          />
        </View>

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
              <View style={{ flex: 3, width: isMobile ? "100%" : undefined }}>{contentPanel}</View>
              <View style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320 }}>
                {isEdit ? (
                  <Panel title="Classificação">
                    <Text className="text-sm text-ink-muted" style={{ marginBottom: 12 }}>
                      Disciplina, assuntos, dificuldade, banca e tags ficam na tela da questão.
                    </Text>
                    <Button
                      label="Abrir classificação"
                      onPress={() => leave(() => navigate("questoes-classificar", { questionId, query: listQuery }))}
                    />
                  </Panel>
                ) : (
                  <Panel title="Classificação" description="Opcional; pode ser feita depois.">
                    <ClassificationFields form={classification} onChange={(form) => !aiFilling && setClassification(form)} catalogs={catalogs} />
                  </Panel>
                )}
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

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
