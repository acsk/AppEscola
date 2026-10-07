import React, { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Image, Switch, Text, View } from "react-native";
import { Check, ImagePlus, Save, Sparkles, Trash2 } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import RichTextInput from "../ui/RichTextInput";
import FormInput from "../ui/FormInput";
import ProgressDialog from "../ui/ProgressDialog";
import MessageModal from "../ui/MessageModal";
import ConfirmModal from "../ui/ConfirmModal";
import Tabs from "../ui/Tabs";
import ClassificationFields from "./ClassificationFields";
import OptionsEditor from "./OptionsEditor";
import TopicMultiSelect from "./TopicMultiSelect";
import SearchableSelect from "../ui/SearchableSelect";
import ExamTypeLogo from "../ui/ExamTypeLogo";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { aiAutofillQuestion, aiSeparatePdfText } from "../../services/questionAi";
import {
  deleteImportDraft, fetchImportDraft, includeImportDraftQuestion, listImportDrafts, saveImportDraft,
  type ImportDraftPayload, type ImportDraftSummary, type ImportDraftQuestion,
} from "../../services/questionImportDrafts";
import { createExamFromQuestions, createStandaloneQuestion, uploadQuestionBankImage } from "../../services/questionBank";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../utils/apiErrors";
import { describeAiError } from "../../utils/aiErrors";
import { contentFromSuggestion, contentPayload, mergeContentSuggestion, validateContent } from "../../utils/questionContent";
import {
  EMPTY_CLASSIFICATION_FORM, applyClassificationSuggestion, classificationFromSuggestion, diffClassification,
} from "../../utils/questionClassification";
import { extractPdfPages, pageBlocks, pdfDocumentText, questionFingerprint, MAX_PDF_BYTES } from "../../utils/pdfQuestionImport";
import { prepareImageForUpload } from "../../utils/imageCompression";
import { plainRichText } from "../../utils/richText";
import { useQuestionAiStatus } from "../../hooks/useQuestionAiStatus";

type Draft = ImportDraftQuestion & {
  imageLoadError: boolean;
  errors: Record<string, string>;
};
/** Nome da prova a partir do arquivo: "ifal_2024-1a-fase.pdf" → "IFAL 2024 1A FASE". */
export function examNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR")
    .slice(0, 255);
}

/** Dados mínimos que faltam para incluir a questão (sinalizados na aba e no topo da questão). */
function pendingItems(draft: Draft): string[] {
  const items: string[] = [];
  const content = validateContent(draft.content);
  if (content.question_text) items.push("enunciado");
  if (content.options) items.push(content.options.includes("correta") ? "gabarito" : "alternativas");
  if (draft.needsImage && !draft.content.image_url) items.push("imagem");
  else if (draft.imageLoadError) items.push("imagem com erro");
  if (!draft.classification.subject_id) items.push("disciplina");
  return items;
}

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
  /** Disciplinas da prova: a IA classifica cada questão em uma delas e busca o assunto. */
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  /** Ao incluir tudo, agrupa as questões num simulado (rascunho) da modalidade escolhida — IFAL, CPM, ENEM… */
  const [createExam, setCreateExam] = useState(true);
  const [examTypeSlug, setExamTypeSlug] = useState("");
  /** Ids das questões já incluídas nesta sessão (na ordem do PDF), inclusive de tentativas parciais. */
  const includedIds = useRef<number[]>([]);
  const selectedExamType = catalogs.examTypes.find((t) => t.slug === examTypeSlug) ?? null;
  /** Com "Criar simulado", a modalidade escolhida vale para todas as questões (campo bloqueado na revisão). */
  const lockedExamTypeId = createExam ? selectedExamType?.id ?? null : null;
  const [noTextPages, setNoTextPages] = useState<number[]>([]);
  /** Blocos de páginas que a IA não conseguiu separar (as demais questões seguem para revisão). */
  const [failedBlocks, setFailedBlocks] = useState<{ pages: string; message: string }[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [savedDraft, setSavedDraft] = useState<{ id: string; revision: number } | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [draftNeedsReload, setDraftNeedsReload] = useState(false);
  const [savedImports, setSavedImports] = useState<ImportDraftSummary[]>([]);
  const [draftPage, setDraftPage] = useState(1);
  const [lastDraftPage, setLastDraftPage] = useState(1);
  const [draftListError, setDraftListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [deleteDraft, setDeleteDraft] = useState<ImportDraftSummary | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const { ensureAvailable } = useQuestionAiStatus();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setSourceExamName("");
    setCreateExam(true);
    setExamTypeSlug("");
    includedIds.current = [];
    setNoTextPages([]);
    setFailedBlocks([]);
    setDrafts([]);
    setActiveKey("");
    setSavedDraft(null);
    setSavedSnapshot("");
    setDraftNeedsReload(false);
    setConfirmClose(false);
    setError(null);
    let cancelled = false;
    setListLoading(true);
    setDraftListError("");
    setSavedImports([]);
    setDraftPage(1);
    setLastDraftPage(1);
    void listImportDrafts().then((response) => {
      if (cancelled) return;
      setSavedImports(response.body.items);
      setLastDraftPage(response.body.last_page);
    }).catch((cause) => {
      if (!cancelled) setDraftListError(getApiErrorMessage(cause, "Não foi possível carregar os rascunhos."));
    }).finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  const snapshot = (items = drafts): ImportDraftPayload => ({
    source_exam_name: sourceExamName.trim(), no_text_pages: noTextPages,
    active_question_key: items.some((item) => item.key === activeKey) ? activeKey : items[0]?.key ?? null,
    questions: items.map(({ imageLoadError, errors, ...question }) => question),
  });
  const dirty = drafts.length > 0 && JSON.stringify(snapshot()) !== savedSnapshot;
  const close = () => {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((draft) => draft.key === key ? { ...draft, ...patch } : draft));

  const saveDraft = async () => {
    if (busy || draftNeedsReload || !drafts.length || !sourceExamName.trim()) return;
    setProgress("Salvando rascunho da importação…");
    try {
      const payload = snapshot();
      const response = await saveImportDraft(payload, savedDraft);
      setSavedDraft({ id: response.body.id, revision: response.body.revision });
      setSavedSnapshot(JSON.stringify(payload));
      showApiToast(setToast, response, "Rascunho salvo.");
    } catch (cause) {
      if (isAxiosError(cause) && cause.response?.status === 409) setDraftNeedsReload(true);
      setError({ title: "Não foi possível salvar o rascunho", message: getApiErrorMessage(cause, "Tente novamente.") });
    } finally { setProgress(null); }
  };

  const resumeDraft = async (id: string) => {
    if (busy) return;
    setProgress("Carregando rascunho da importação…");
    try {
      const { body } = await fetchImportDraft(id);
      const restored: Draft[] = body.questions.map((question) => ({
        ...question, imageLoadError: false, errors: {},
        content: {
          ...question.content, question_text: question.content.question_text ?? "",
          image_url: question.content.image_url ?? "", explanation: question.content.explanation ?? "",
          options: question.content.options.map((option) => ({ ...option, option_text: option.option_text ?? "" })),
        },
      }));
      setDrafts(restored);
      setSourceExamName(body.source_exam_name);
      setNoTextPages(body.no_text_pages);
      setActiveKey(body.active_question_key ?? restored[0]?.key ?? "");
      setSavedDraft({ id: body.id, revision: body.revision });
      setDraftNeedsReload(false);
      setSavedSnapshot(JSON.stringify({
        source_exam_name: body.source_exam_name, no_text_pages: body.no_text_pages,
        active_question_key: body.active_question_key ?? restored[0]?.key ?? null,
        questions: restored.map(({ imageLoadError, errors, ...question }) => question),
      }));
    } catch (cause) {
      setError({ title: "Não foi possível retomar o rascunho", message: getApiErrorMessage(cause, "Tente novamente.") });
    } finally { setProgress(null); }
  };

  const removeDraft = async () => {
    if (!deleteDraft) return;
    setDeletingDraft(true);
    try {
      const response = await deleteImportDraft(deleteDraft.id);
      setSavedImports((prev) => prev.filter((item) => item.id !== deleteDraft.id));
      showApiToast(setToast, response, "Rascunho excluído.");
      setDeleteDraft(null);
    } catch (cause) {
      setDeleteDraft(null);
      setError({ title: "Não foi possível excluir o rascunho", message: getApiErrorMessage(cause, "Tente novamente.") });
    } finally {
      setDeletingDraft(false);
    }
  };

  const loadMoreDrafts = async () => {
    if (listLoading) return;
    setListLoading(true);
    setDraftListError("");
    try {
      const response = await listImportDrafts(draftPage + 1);
      setSavedImports((prev) => [...prev, ...response.body.items]);
      setDraftPage(response.body.current_page);
      setLastDraftPage(response.body.last_page);
    } catch (cause) {
      setDraftListError(getApiErrorMessage(cause, "Não foi possível carregar os rascunhos."));
    } finally { setListLoading(false); }
  };

  const autofill = async (draft: Draft) => {
    if (busy) return;
    if (plainRichText(draft.content.question_text).trim().length < 15) {
      update(draft.key, { errors: { question_text: "Escreva um enunciado com pelo menos 15 caracteres para usar a IA." } });
      return;
    }
    setProgress(`Autocompletando a questão ${draft.sourceNumber} com IA…`);
    try {
      const unavailable = await ensureAvailable();
      if (unavailable) {
        setError({ title: "IA indisponível", message: unavailable });
        return;
      }
      const response = await aiAutofillQuestion({
        question_text: draft.content.question_text, type: draft.content.type,
        options: draft.content.options.map(({ option_text }) => ({ option_text })),
        subject_ids: subjectIds.length ? subjectIds : undefined,
      });
      update(draft.key, {
        content: mergeContentSuggestion(draft.content, response.body).form,
        classification: applyClassificationSuggestion(draft.classification, response.body),
        answerFromPdf: false, errors: {},
      });
      showApiToast(setToast, response, "Campos sugeridos pela IA. Revise antes de incluir.");
    } catch (cause) { setError(describeAiError(cause, "Não foi possível autocompletar esta questão")); }
    finally { setProgress(null); }
  };

  const pasteImage = (key: string, event: React.ClipboardEvent<HTMLDivElement>) => {
    const image = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!image) {
      update(key, { errors: { image: "Copie uma imagem e cole aqui; textos e links não são imagens." } });
      return;
    }
    event.preventDefault();
    const file = image.getAsFile();
    if (file) void uploadImage(key, file);
    else update(key, { errors: { image: "Não foi possível ler a imagem copiada. Copie novamente ou selecione o arquivo." } });
  };

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
    if (!file || !sourceExamName.trim() || !subjectIds.length || (createExam && !examTypeSlug) || busy) return;
    setProgress("Extraindo o texto do PDF no navegador…");
    try {
      const pages = await extractPdfPages(file);
      const text = pdfDocumentText(pages);
      setNoTextPages(pages.flatMap((page, index) => page.trim() ? [] : [index + 1]));
      // Em blocos de páginas, na ordem: cada bloco vê as páginas vizinhas como contexto.
      const blocks = pageBlocks(pages.length);
      const questions: Awaited<ReturnType<typeof aiSeparatePdfText>>["body"]["questions"] = [];
      const seen = new Map<string, number>();
      const failed: { pages: string; message: string }[] = [];
      let lastCause: unknown = null;
      for (const [index, block] of blocks.entries()) {
        const label = block.from === block.to ? `página ${block.from}` : `páginas ${block.from}–${block.to}`;
        setProgress(`Separando e classificando as questões com IA: ${label} (${index + 1} de ${blocks.length})…`);
        try {
          const response = await aiSeparatePdfText(text, sourceExamName.trim(), subjectIds, blocks.length > 1 ? block : undefined);
          for (const question of response.body.questions) {
            const fingerprint = questionFingerprint(question);
            const previous = seen.get(fingerprint);
            if (previous === undefined) {
              seen.set(fingerprint, questions.length);
              questions.push(question);
            } else if ((question.question_text ?? "").length > (questions[previous].question_text ?? "").length) {
              questions[previous] = question; // repetida: fica a versão com texto de apoio
            }
          }
        } catch (cause) {
          lastCause = cause;
          failed.push({ pages: label, message: describeAiError(cause, "Falha na separação").message });
        }
      }
      if (!questions.length) throw lastCause ?? new Error("Nenhuma questão foi encontrada no PDF.");
      setFailedBlocks(failed);
      const response = {
        type: failed.length ? "warning" : "success",
        message: failed.length
          ? `${questions.length} questão(ões) separada(s). Não foi possível ler: ${failed.map((f) => f.pages).join(", ")}.`
          : `${questions.length} questão(ões) separada(s) pela IA. Revise e anexe as imagens necessárias antes de incluir.`,
        body: { questions },
      };
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
      setActiveKey(converted[0]?.key ?? "");
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
    if (busy || draftNeedsReload || !sourceExamName.trim()) return;
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
    const invalid = checked.find((draft) => draft.include && Object.keys(draft.errors).length > 0);
    if (createExam && !examTypeSlug) {
      setToast({ visible: true, type: "error", message: "Escolha a modalidade do simulado ou desmarque \"Criar simulado\"." });
      return;
    }
    if (invalid) {
      setActiveKey(invalid.key);
      setToast({ visible: true, type: "error", message: "Corrija as questões e anexe as imagens destacadas antes de incluir." });
      return;
    }
    let saved = 0;
    let lastResponse: { type: string; message: string; body: unknown } | undefined;
    const remaining = checked.filter((draft) => !draft.include);
    const selected = checked.filter((draft) => draft.include);
    let inclusionFailed = false;
    try {
      let persisted = savedDraft;
      if (persisted) {
        setProgress("Atualizando o rascunho antes da inclusão…");
        const response = await saveImportDraft(snapshot(checked), persisted);
        persisted = { id: response.body.id, revision: response.body.revision };
        setSavedDraft(persisted);
        setSavedSnapshot(JSON.stringify(snapshot(checked)));
      }
      for (const [index, draft] of selected.entries()) {
        setProgress(`Incluindo a questão ${draft.sourceNumber} no banco…`);
        try {
          const payload = {
            ...contentPayload(draft.content),
            ...diffClassification(EMPTY_CLASSIFICATION_FORM, {
              ...draft.classification,
              exam_type_id: lockedExamTypeId ?? draft.classification.exam_type_id,
            }),
            source_exam_name: sourceExamName.trim(),
            needs_image: draft.needsImage,
          };
          if (persisted) {
            const response = await includeImportDraftQuestion(persisted.id, draft.key, persisted.revision, payload);
            persisted = { id: response.body.draft.id, revision: response.body.draft.revision };
            setSavedDraft(persisted);
            lastResponse = response;
            includedIds.current.push(response.body.question.id);
          } else {
            const response = await createStandaloneQuestion(payload);
            lastResponse = response;
            includedIds.current.push(response.body.id);
          }
          saved++;
        } catch (cause) {
          remaining.push({ ...draft, errors: { form: getApiErrorMessage(cause, "Não foi possível salvar esta questão.") } });
          if (persisted) {
            // Não prossiga com uma revisão possivelmente obsoleta após conflito ou falha de conexão.
            inclusionFailed = true;
            setDraftNeedsReload(true);
            remaining.push(...selected.slice(index + 1));
            break;
          }
        }
      }
      if (saved) onCreated(saved);
      setDrafts(remaining);
      const remainingSnapshot = snapshot(remaining);
      setActiveKey(remainingSnapshot.active_question_key ?? "");
      if (persisted && !inclusionFailed) setSavedSnapshot(JSON.stringify(remainingSnapshot));
      if (remaining.some((draft) => draft.include)) {
        setToast({ visible: true, type: "error", message: `${saved} questão(ões) incluída(s). Confira os erros nas restantes.` });
      } else {
        if (createExam && examTypeSlug && includedIds.current.length) {
          setProgress("Criando o simulado com as questões incluídas…");
          try {
            lastResponse = await createExamFromQuestions({
              title: sourceExamName.trim(),
              exam_type: examTypeSlug,
              question_ids: includedIds.current,
              description: "Importado de PDF pelo banco de questões.",
            });
            includedIds.current = [];
          } catch (cause) {
            // As questões já estão no banco; só o agrupamento falhou.
            setError({
              title: "Questões incluídas, mas o simulado não foi criado",
              message: getApiErrorMessage(cause, "Crie o simulado manualmente em Simulados."),
            });
            return;
          }
        }
        if (lastResponse) showApiToast(setToast, lastResponse, `${saved} questão(ões) incluída(s).`);
        onClose();
      }
    } catch (cause) {
      setDraftNeedsReload(true);
      setError({ title: "Não foi possível atualizar o rascunho", message: getApiErrorMessage(cause, "Nenhuma nova questão foi incluída. Tente novamente.") });
    } finally {
      setProgress(null);
    }
  };

  // Etapa inicial: a prova vira simulado (padrão) e a modalidade é escolhida antes da separação.
  const examBlock = (
    <View className="border border-border rounded-ds-md p-3 bg-surface-sunken" style={{ gap: 10 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Switch accessibilityLabel="Criar simulado com estas questões" value={createExam} disabled={busy}
          onValueChange={setCreateExam} />
        <Text className="text-sm font-medium text-ink flex-1">Criar simulado com estas questões</Text>
      </View>
      {createExam && (
        <View className="flex-row items-end" style={{ gap: 10 }}>
          <ExamTypeLogo size={38} label={selectedExamType?.label} logoUrl={selectedExamType?.logo_url} />
          <View className="flex-1">
            <SearchableSelect label="Modalidade" required modalTitle="Selecionar modalidade"
              placeholder="IFAL, CPM, ENEM…" value={examTypeSlug} disabled={busy} showSelectedPreview={false}
              options={catalogs.examTypes.filter((t) => t.slug).map((t) => ({ value: t.slug!, label: t.label }))}
              onChange={setExamTypeSlug} />
          </View>
        </View>
      )}
      <Text className="text-xs text-ink-subtle">
        {createExam
          ? `O simulado "${sourceExamName.trim() || "…"}" fica como rascunho em Simulados, com o ícone da modalidade. A modalidade vale para todas as questões e fica bloqueada na revisão.`
          : "As questões entram apenas no banco, como avulsas."}
      </Text>
    </View>
  );

  return (
    <>
      <Modal
        visible={visible}
        title={drafts.length ? "Revisar questões convertidas pela IA" : "Importar PDF com IA"}
        onClose={close}
        size={drafts.length ? "xl" : "md"}
        compact
        maxHeight="94%"
        footer={
          <View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>
            <Button label={drafts.length ? "Fechar" : "Cancelar"} onPress={close} disabled={busy} />
            {drafts.length > 0 && <Button icon={Save} label="Salvar rascunho" onPress={() => void saveDraft()}
              disabled={busy || draftNeedsReload || !sourceExamName.trim()} />}
            {drafts.length ? (
              <Button variant="primary" icon={Check} label={`Incluir ${drafts.filter((draft) => draft.include).length} questões`}
                onPress={() => void includeAll()} disabled={busy || draftNeedsReload || !sourceExamName.trim() || !drafts.some((draft) => draft.include)} />
            ) : (
              <Button variant="primary" icon={Sparkles} label="Separar questões com IA" onPress={() => void extract()} disabled={!file || !sourceExamName.trim() || !subjectIds.length || (createExam && !examTypeSlug) || busy} />
            )}
          </View>
        }
      >
        <FormInput label="Nome da prova/simulado de origem" value={sourceExamName} onChangeText={setSourceExamName}
          maxLength={255} required editable={!busy} />
        {!drafts.length ? (
          <View style={{ gap: 14 }}>
            {examBlock}
            <TopicMultiSelect
              label="Disciplinas da prova *"
              searchPlaceholder="Buscar disciplina (ex.: Português, Matemática)..."
              topics={catalogs.subjects.map((s) => ({ id: s.id, name: s.name, subject_id: s.id }))}
              value={subjectIds}
              onChange={setSubjectIds}
              disabled={busy}
              disabledHint="Aguarde…"
            />
            <Text className="text-xs text-ink-subtle">
              Escolha as disciplinas cobradas no PDF. A IA classifica cada questão em uma delas e escolhe o assunto.
            </Text>
            <Text className="text-sm font-medium text-ink">Rascunhos de importação salvos</Text>
            {listLoading && <Text className="text-sm text-ink-muted">Carregando rascunhos…</Text>}
            {!!draftListError && <Text className="text-sm text-danger">{draftListError}</Text>}
            {savedImports.map((item) => (
              <View key={item.id} className="flex-row items-center" style={{ gap: 8 }}>
                <View className="flex-1">
                  <Button label={`Retomar ${item.source_exam_name} (${item.question_count} questões)`}
                    disabled={busy || listLoading} onPress={() => void resumeDraft(item.id)} />
                </View>
                <Button icon={Trash2} variant="danger" label="Excluir" accessibilityLabel={`Excluir rascunho ${item.source_exam_name}`}
                  disabled={busy || listLoading} onPress={() => setDeleteDraft(item)} />
              </View>
            ))}
            {!listLoading && !draftListError && !savedImports.length &&
              <Text className="text-sm text-ink-muted">Nenhum rascunho salvo para seu usuário nesta escola.</Text>}
            {draftPage < lastDraftPage && <Button label="Carregar mais rascunhos" disabled={busy || listLoading}
              onPress={() => void loadMoreDrafts()} />}
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
                } else {
                  setFile(selected);
                  // Preenche o nome com o do arquivo; não sobrescreve um nome digitado pelo usuário.
                  setSourceExamName((current) =>
                    !current.trim() || current === (file ? examNameFromFile(file.name) : "")
                      ? examNameFromFile(selected.name)
                      : current);
                }
                event.target.value = "";
              }} />
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            {createExam && selectedExamType ? (
              <View className="flex-row items-center border border-border rounded-ds-md p-3 bg-surface-sunken" style={{ gap: 10 }}>
                <ExamTypeLogo size={34} label={selectedExamType.label} logoUrl={selectedExamType.logo_url} />
                <Text className="text-sm text-ink flex-1">
                  Vai virar o simulado <Text className="font-semibold">{sourceExamName.trim() || "…"}</Text> · modalidade{" "}
                  <Text className="font-semibold">{selectedExamType.label}</Text>, aplicada a todas as questões.
                </Text>
              </View>
            ) : examBlock}
            <Text className="text-sm text-ink-muted">Confira a separação, classificação e gabarito. Anexe as imagens manualmente e confira as marcações no PDF original.</Text>
            {draftNeedsReload && savedDraft && <View style={{ gap: 8 }}>
              <Text className="text-sm text-danger">Confira a versão salva antes de continuar. Ao reabrir, alterações locais não salvas serão descartadas.</Text>
              <Button label="Reabrir versão salva" disabled={busy} onPress={() => void resumeDraft(savedDraft.id)} />
            </View>}
            {failedBlocks.length > 0 && (
              <View className="rounded-ds-md border border-warning bg-warning-tint px-3 py-2" style={{ gap: 4 }}>
                <Text className="text-xs font-semibold text-warning">
                  A IA não conseguiu separar {failedBlocks.map((f) => f.pages).join(", ")}. Confira o PDF: as questões dessas páginas não estão na lista.
                </Text>
                {failedBlocks.map((f) => <Text key={f.pages} className="text-xs text-warning">{f.pages}: {f.message}</Text>)}
              </View>
            )}
            {noTextPages.length > 0 && <Text className="text-xs text-warning">
              Páginas sem texto extraível: {noTextPages.join(", ")}. Se contiverem questões escaneadas, elas não puderam ser lidas; aplique OCR e importe novamente.
            </Text>}
            <Tabs items={drafts.map((draft, index) => {
              const pending = draft.include ? pendingItems(draft) : [];
              const failed = Object.keys(draft.errors).length > 0;
              return {
                id: draft.key,
                label: `${String(index + 1).padStart(2, "0")}${failed ? " · Erro" : ""}`,
                alert: pending.length || failed ? `pendente: ${pending.join(", ") || "corrigir erros"}` : null,
              };
            })} value={activeKey} onChange={(key) => !busy && setActiveKey(key)} accessibilityLabel="Questões importadas" />
            {drafts.filter((draft) => draft.key === activeKey).map((draft) => (
              <View key={draft.key} className="border border-border rounded-ds-md p-4" style={{ gap: 12 }}>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Button icon={Sparkles} label="Autocompletar questão com IA" disabled={busy}
                    onPress={() => void autofill(draft)} />
                  <Button label={`${draft.include ? "Desmarcar" : "Selecionar"} questão ${draft.sourceNumber}`}
                    onPress={() => update(draft.key, { include: !draft.include })} disabled={busy} />
                  <Badge tone={draft.answerFromPdf && !pendingItems(draft).includes("gabarito") ? "success" : "warning"} label={
                    draft.content.type === "multiple_choice" && !draft.content.options.some((option) => option.is_correct)
                      ? "Gabarito pendente — revisar"
                      : draft.answerFromPdf ? "Gabarito do PDF" : "Gabarito sugerido pela IA"
                  } />
                </View>
                {draft.include && pendingItems(draft).length > 0 && (
                  <View className="rounded-ds-md border border-warning bg-warning-tint px-3 py-2">
                    <Text className="text-xs font-semibold text-warning">
                      Falta preencher: {pendingItems(draft).join(", ")}.
                    </Text>
                  </View>
                )}
                {Object.values(draft.errors).map((message, index) => <Text key={index} className="text-xs text-danger">{message}</Text>)}
                <RichTextInput label="Enunciado" value={draft.content.question_text} minHeight={100} disabled={busy}
                  onChange={(question_text) => update(draft.key, { content: { ...draft.content, question_text } })} />
                <View style={{ gap: 8 }}>
                  <div role="textbox" aria-label={`Colar imagem da questão ${draft.sourceNumber}`}
                    aria-disabled={busy} tabIndex={busy ? -1 : 0}
                    className="border border-border rounded-ds-md p-3 text-sm text-ink-muted"
                    onPaste={(event) => { if (!busy) pasteImage(draft.key, event); }}>
                    Clique aqui e cole uma imagem (Ctrl+V ou ⌘V).
                  </div>
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
                <ClassificationFields form={draft.classification} catalogs={catalogs} lockedExamTypeId={lockedExamTypeId}
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
      <ConfirmModal visible={deleteDraft !== null} title="Excluir rascunho da importação?"
        message={`O rascunho "${deleteDraft?.source_exam_name ?? ""}" (${deleteDraft?.question_count ?? 0} questões em revisão) será excluído. Questões já incluídas no banco não são afetadas.`}
        loading={deletingDraft} onCancel={() => setDeleteDraft(null)} onConfirm={() => void removeDraft()} />
      <ConfirmModal visible={confirmClose} title="Fechar sem salvar as alterações?"
        message="Há alterações não salvas nesta importação. Cancele e use Salvar rascunho para retomar depois."
        confirmLabel="Fechar sem salvar" cancelLabel="Continuar revisão"
        onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }} />
    </>
  );
}
