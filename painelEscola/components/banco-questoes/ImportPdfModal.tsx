import React, { useEffect, useRef, useState } from "react";
import { Image, Switch, Text, View } from "react-native";
import { Check, ImagePlus, Sparkles, Trash2 } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import RichTextInput from "../ui/RichTextInput";
import FormInput from "../ui/FormInput";
import ProgressDialog from "../ui/ProgressDialog";
import MessageModal from "../ui/MessageModal";
import ClassificationFields from "./ClassificationFields";
import OptionsEditor from "./OptionsEditor";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { aiSeparatePdfText } from "../../services/questionAi";
import { createStandaloneQuestion, uploadQuestionBankImage } from "../../services/questionBank";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../utils/apiErrors";
import { describeAiError } from "../../utils/aiErrors";
import { type ContentForm, contentFromSuggestion, contentPayload, validateContent } from "../../utils/questionContent";
import {
  type ClassificationForm, EMPTY_CLASSIFICATION_FORM, classificationFromSuggestion, diffClassification,
} from "../../utils/questionClassification";
import { extractPdfPages, pdfDocumentText, MAX_PDF_BYTES } from "../../utils/pdfQuestionImport";
import { prepareImageForUpload } from "../../utils/imageCompression";

type Draft = {
  key: string;
  include: boolean;
  sourceNumber: string;
  content: ContentForm;
  classification: ClassificationForm;
  needsImage: boolean;
  imageLoadError: boolean;
  answerFromPdf: boolean;
  errors: Record<string, string>;
};
type Props = {
  visible: boolean;
  catalogs: QuestionBankCatalogs;
  onClose: () => void;
  onCreated: (count: number) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
};
export default function ImportPdfModal({ visible, catalogs, onClose, onCreated, setToast }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const imageTarget = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceExamName, setSourceExamName] = useState("");
  const [noTextPages, setNoTextPages] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setSourceExamName("");
    setNoTextPages([]);
    setDrafts([]);
    setError(null);
  }, [visible]);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((draft) => draft.key === key ? { ...draft, ...patch } : draft));

  const uploadImage = async (key: string, selected: File) => {
    const draft = drafts.find((item) => item.key === key);
    if (!draft || busy) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(selected.type) || selected.size > 5 * 1024 * 1024) {
      update(key, { errors: { ...draft.errors, image: "Selecione uma imagem JPG, PNG, WEBP ou GIF de até 5 MB." } });
      return;
    }
    setProgress(`Enviando a imagem da questão ${draft.sourceNumber}…`);
    try {
      const optimized = await prepareImageForUpload(selected, 5000);
      const upload = optimized instanceof File ? optimized : new File([optimized], selected.name, { type: optimized.type });
      const response = await uploadQuestionBankImage(upload);
      update(key, {
        content: { ...draft.content, image_url: response.body.image_url ?? "" },
        needsImage: true, imageLoadError: false, errors: {},
      });
      showApiToast(setToast, response, "Imagem enviada com sucesso.");
    } catch (cause) {
      update(key, { errors: { ...draft.errors, image: getApiErrorMessage(cause, "Não foi possível enviar a imagem.") } });
    } finally {
      setProgress(null);
    }
  };

  const extract = async () => {
    if (!file || !sourceExamName.trim() || busy) return;
    setProgress("Extraindo o texto do PDF no navegador…");
    try {
      const pages = await extractPdfPages(file);
      const text = pdfDocumentText(pages);
      setNoTextPages(pages.flatMap((page, index) => page.trim() ? [] : [index + 1]));
      setProgress("Enviando o texto à IA para separar e classificar as questões…");
      const response = await aiSeparatePdfText(text, sourceExamName.trim());
      const converted: Draft[] = response.body.questions.map((question, index) => {
        const content = contentFromSuggestion(question);
        return {
          key: `pdf-${index}`, include: true, sourceNumber: question.source_number ?? String(index + 1),
          content, classification: classificationFromSuggestion(question),
          needsImage: question.needs_image === true, imageLoadError: false,
          answerFromPdf: question.answer_from_pdf === true, errors: {},
        };
      });
      setDrafts(converted);
      showApiToast(setToast, response, "Questões separadas. Revise e anexe as imagens necessárias.");
    } catch (cause) {
      setError(cause instanceof Error && !("response" in cause)
        ? { title: "Não foi possível ler o PDF", message: cause.message }
        : describeAiError(cause, "Não foi possível separar as questões"));
    } finally {
      setProgress(null);
    }
  };

  const includeAll = async () => {
    if (busy || !sourceExamName.trim()) return;
    const checked = drafts.map((draft) => {
      if (!draft.include) return draft;
      const errors = validateContent(draft.content);
      if (draft.needsImage && !draft.content.image_url) {
        errors.image = "Anexe manualmente a imagem necessária antes de incluir a questão.";
      } else if (draft.imageLoadError || draft.errors.image) {
        errors.image = draft.errors.image || "Não foi possível carregar a imagem. Envie novamente antes de incluir.";
      }
      return { ...draft, errors };
    });
    setDrafts(checked);
    if (checked.some((draft) => draft.include && Object.keys(draft.errors).length > 0)) {
      setToast({ visible: true, type: "error", message: "Corrija as questões e anexe as imagens destacadas antes de incluir." });
      return;
    }
    let saved = 0;
    let lastResponse: Awaited<ReturnType<typeof createStandaloneQuestion>> | undefined;
    const remaining = checked.filter((draft) => !draft.include);
    try {
      for (const draft of checked.filter((item) => item.include)) {
        setProgress(`Incluindo a questão ${draft.sourceNumber} no banco…`);
        try {
          lastResponse = await createStandaloneQuestion({
            ...contentPayload(draft.content),
            ...diffClassification(EMPTY_CLASSIFICATION_FORM, draft.classification),
            source_exam_name: sourceExamName.trim(),
            needs_image: draft.needsImage,
          });
          saved++;
        } catch (cause) {
          remaining.push({ ...draft, errors: { form: getApiErrorMessage(cause, "Não foi possível salvar esta questão.") } });
        }
      }
      if (saved) onCreated(saved);
      setDrafts(remaining);
      if (remaining.some((draft) => draft.include)) {
        setToast({ visible: true, type: "error", message: `${saved} questão(ões) incluída(s). Confira os erros nas restantes.` });
      } else {
        if (lastResponse) showApiToast(setToast, lastResponse, `${saved} questão(ões) incluída(s).`);
        onClose();
      }
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        title={drafts.length ? "Revisar questões convertidas pela IA" : "Importar PDF com IA"}
        onClose={() => !busy && onClose()}
        size={drafts.length ? "xl" : "md"}
        compact
        maxHeight="94%"
        footer={
          <View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>
            <Button label={drafts.length ? "Fechar" : "Cancelar"} onPress={onClose} disabled={busy} />
            {drafts.length ? (
              <Button variant="primary" icon={Check} label={`Incluir ${drafts.filter((draft) => draft.include).length} questões`}
                onPress={() => void includeAll()} disabled={busy || !sourceExamName.trim() || !drafts.some((draft) => draft.include)} />
            ) : (
              <Button variant="primary" icon={Sparkles} label="Separar questões com IA" onPress={() => void extract()} disabled={!file || !sourceExamName.trim() || busy} />
            )}
          </View>
        }
      >
        <FormInput label="Nome da prova/simulado de origem" value={sourceExamName} onChangeText={setSourceExamName}
          maxLength={255} required editable={!busy} />
        {!drafts.length ? (
          <View style={{ gap: 14 }}>
            <Text className="text-sm text-ink-muted">
              O texto será extraído do PDF no navegador e enviado à IA para separar as questões.
              As questões que dependem de imagens serão sinalizadas para anexar manualmente antes de incluir.
            </Text>
            <Text className="text-xs text-warning">
              Até 20 MB, 80 páginas, 120 mil caracteres e 50 questões por importação. PDFs escaneados precisam de OCR prévio.
              A identificação de imagens pelo texto é uma sugestão: confira o PDF original e ajuste as marcações.
              Apenas o texto será enviado ao provedor; nenhuma imagem será gerada pela IA.
            </Text>
            <Button label="Selecionar arquivo PDF" onPress={() => fileRef.current?.click()} disabled={busy} />
            {file && <Text className="text-sm text-ink">{file.name}</Text>}
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (!selected) return;
                if (!selected.name.toLowerCase().endsWith(".pdf") || selected.size > MAX_PDF_BYTES) {
                  setError({ title: "Arquivo inválido", message: "Selecione um PDF de até 20 MB." });
                  setFile(null);
                } else setFile(selected);
                event.target.value = "";
              }} />
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <Text className="text-sm text-ink-muted">Confira a separação, classificação e gabarito. Anexe as imagens manualmente e confira as marcações no PDF original.</Text>
            {noTextPages.length > 0 && <Text className="text-xs text-warning">
              Páginas sem texto extraível: {noTextPages.join(", ")}. Se contiverem questões escaneadas, elas não puderam ser lidas; aplique OCR e importe novamente.
            </Text>}
            {drafts.map((draft) => (
              <View key={draft.key} className="border border-border rounded-ds-md p-4" style={{ gap: 12 }}>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Button label={`${draft.include ? "Desmarcar" : "Selecionar"} questão ${draft.sourceNumber}`}
                    onPress={() => update(draft.key, { include: !draft.include })} disabled={busy} />
                  <Badge tone={draft.answerFromPdf ? "success" : "warning"} label={
                    draft.content.type === "multiple_choice" && !draft.content.options.some((option) => option.is_correct)
                      ? "Gabarito pendente — revisar"
                      : draft.answerFromPdf ? "Gabarito do PDF" : "Gabarito sugerido pela IA"
                  } />
                </View>
                {Object.values(draft.errors).map((message, index) => <Text key={index} className="text-xs text-danger">{message}</Text>)}
                <RichTextInput label="Enunciado" value={draft.content.question_text} minHeight={100} disabled={busy}
                  onChange={(question_text) => update(draft.key, { content: { ...draft.content, question_text } })} />
                <View style={{ gap: 8 }}>
                  <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                    <Switch accessibilityLabel={`Questão ${draft.sourceNumber} precisa de imagem`} value={draft.needsImage}
                      disabled={busy} onValueChange={(needsImage) => update(draft.key, { needsImage, errors: {} })} />
                    <Text className="text-sm text-ink">Precisa de imagem</Text>
                    {draft.needsImage && <Badge tone={draft.content.image_url ? "success" : "warning"}
                      label={draft.content.image_url ? "Imagem anexada manualmente" : "Imagem pendente — anexar manualmente"} />}
                  </View>
                  {draft.content.image_url && <Image source={{ uri: draft.content.image_url }} accessibilityLabel={`Imagem da questão ${draft.sourceNumber}`}
                    style={{ width: "100%", height: 240 }} resizeMode="contain" onError={() => update(draft.key, { imageLoadError: true })} />}
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    <Button icon={ImagePlus} label={draft.content.image_url ? "Trocar imagem" : "Anexar imagem manualmente"} disabled={busy}
                      onPress={() => { imageTarget.current = draft.key; imageRef.current?.click(); }} />
                    {draft.content.image_url && <Button icon={Trash2} variant="danger" label="Remover imagem" disabled={busy}
                      onPress={() => update(draft.key, { content: { ...draft.content, image_url: "" }, imageLoadError: false, errors: {} })} />}
                  </View>
                  <Text className="text-xs text-ink-muted">JPG, PNG, WEBP ou GIF, até 5 MB. Para alternativas visuais, anexe uma imagem com todas as figuras identificadas.</Text>
                </View>
                {draft.content.type === "multiple_choice" && <OptionsEditor labelId={`${draft.key}-options`} options={draft.content.options}
                  disabled={busy} onChange={(options) => update(draft.key, { content: { ...draft.content, options } })} />}
                <RichTextInput label="Explicação" value={draft.content.explanation} minHeight={72} disabled={busy}
                  onChange={(explanation) => update(draft.key, { content: { ...draft.content, explanation } })} />
                <ClassificationFields form={draft.classification} catalogs={catalogs}
                  onChange={(classification) => !busy && update(draft.key, { classification })} />
              </View>
            ))}
          </View>
        )}
        <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Arquivo de imagem da questão"
          style={{ display: "none" }} onChange={(event) => {
            const selected = event.target.files?.[0];
            const key = imageTarget.current;
            event.target.value = "";
            if (selected && key) void uploadImage(key, selected);
          }} />
      </Modal>
      <ProgressDialog visible={busy} title="Importação com IA" message={progress ?? ""} />
      <MessageModal visible={error !== null} type="error" title={error?.title ?? ""} message={error?.message ?? ""} onClose={() => setError(null)} />
    </>
  );
}
