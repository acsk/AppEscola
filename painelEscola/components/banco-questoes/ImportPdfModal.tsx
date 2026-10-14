import React, { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import { Check, ChevronRight, FileText, Sparkles, Upload } from "lucide-react-native";
import { color } from "../../constants/theme";
import TokenSelect from "./TokenSelect";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import ProgressDialog from "../ui/ProgressDialog";
import MessageModal from "../ui/MessageModal";
import ConfirmModal from "../ui/ConfirmModal";
import SearchableSelect from "../ui/SearchableSelect";
import ExamTypeLogo from "../ui/ExamTypeLogo";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { aiAutofillQuestion, aiSeparatePdfText } from "../../services/questionAi";
import {
  deleteImportDraft, fetchImportDraft, includeImportDraftQuestion, listImportDrafts, saveImportDraft,
  type ImportDraftPayload, type ImportDraftSettings, type ImportDraftSummary, type ImportDraftQuestion,
} from "../../services/questionImportDrafts";
import { appendToImportedExam, createExamFromQuestions, createStandaloneQuestion, fetchTopics, uploadQuestionBankImage } from "../../services/questionBank";
import type { SubjectTopic } from "../../types/questionBank";
import { addQuestionsToSet } from "../../services/questionSets";
import ImportReviewWorkspace, { type SaveStatus } from "./import-review/ImportReviewWorkspace";
import type { ConcludeChoice } from "./import-review/ConcludeImportDialog";
import { findSourcePage } from "../../utils/importReview";
import { type ApiToastState, getApiErrorMessage, showApiToast } from "../../utils/apiErrors";
import { describeAiError } from "../../utils/aiErrors";
import { contentFromSuggestion, contentPayload, mergeContentSuggestion, objectiveFromSuggestion } from "../../utils/questionContent";
import {
  EMPTY_CLASSIFICATION_FORM, applyClassificationSuggestion, classificationFromSuggestion, diffClassification,
  type ClassificationForm,
} from "../../utils/questionClassification";
import { applyPdfSections, extractPdfPages, matchAnswerKey, pageBlocks, parseAnswerKey, pdfDocumentText, questionFingerprint, unwrapImportedText, MAX_PDF_BYTES } from "../../utils/pdfQuestionImport";
import { prepareImageForUpload } from "../../utils/imageCompression";
import { plainRichText } from "../../utils/richText";
import { useQuestionAiStatus } from "../../hooks/useQuestionAiStatus";

type FailedBlock = { from: number; to: number; pages: string; message: string };
type SeparatedQuestion = Awaited<ReturnType<typeof aiSeparatePdfText>>["body"]["questions"][number];

const blockLabel = ({ from, to }: { from: number; to: number }) => (from === to ? `página ${from}` : `páginas ${from}–${to}`);

/** O simulado oficial aceita 120 questões por chamada. O restante entra em seguida, na mesma ordem. */
async function createOfficialImportExam(title: string, examType: string, questionIds: number[]) {
  const first = questionIds.slice(0, 120);
  const response = await createExamFromQuestions({
    title, exam_type: examType, question_ids: first, description: "Importado de PDF pelo banco de questões.",
  });
  let created = { id: response.body.id, title: response.body.title };
  for (let offset = 120; offset < questionIds.length; offset += 120) {
    const appended = await appendToImportedExam(created.id, questionIds.slice(offset, offset + 120));
    created = { id: appended.body.id, title: appended.body.title };
  }
  return created;
}

function toDraft(question: SeparatedQuestion, key: string, fallbackNumber: string): ImportDraftQuestion & { imageLoadError: boolean; errors: Record<string, string> } {
  const content = contentFromSuggestion(question);
  return {
    key, include: true, sourceNumber: question.source_number ?? fallbackNumber,
    content: {
      ...content,
      question_text: unwrapImportedText(content.question_text),
      options: content.options.map((option) => ({ ...option, option_text: unwrapImportedText(option.option_text) })),
    },
    classification: classificationFromSuggestion(question),
    needsImage: question.needs_image === true, imageLoadError: false,
    answerFromPdf: question.answer_from_pdf === true, errors: {},
  };
}

type Draft = ImportDraftQuestion & {
  imageLoadError: boolean;
  errors: Record<string, string>;
};

function withPdfAnswers(items: Draft[], pages: string[], subjectName: (id: number | null) => string | null): { drafts: Draft[]; marked: number } {
  const sections = parseAnswerKey(pages.join("\n"));
  if (!sections.length) return { drafts: items, marked: 0 };
  const marks = matchAnswerKey(items.map((draft) => ({
    sourceNumber: draft.sourceNumber,
    type: draft.content.type,
    subjectName: subjectName(draft.classification.subject_id),
    optionCount: draft.content.options.length,
  })), sections);
  let marked = 0;
  const drafts = items.map((draft, index) => {
    const correct = marks[index];
    if (correct < 0 || draft.content.type !== "multiple_choice") return draft;
    marked += 1;
    return {
      ...draft,
      answerFromPdf: true,
      content: { ...draft.content, options: draft.content.options.map((option, n) => ({ ...option, is_correct: n === correct })) },
    };
  });
  return { drafts, marked };
}
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** "hoje às 18:42", "ontem às 18:42", "12/10 às 18:42". */
function savedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff === 0) return `hoje às ${time}`;
  if (diff === 1) return `ontem às ${time}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}

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

type Props = {
  visible: boolean;
  catalogs: QuestionBankCatalogs;
  onClose: () => void;
  onCreated: (count: number) => void;
  setToast: React.Dispatch<React.SetStateAction<ApiToastState>>;
  /** Abre já retomando este rascunho de importação (ex.: "Continuar revisão" em Simulados importados). */
  resumeDraftId?: string | null;
};
export default function ImportPdfModal({ visible, catalogs, onClose, onCreated, setToast, resumeDraftId = null }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceExamName, setSourceExamName] = useState("");
  /** Disciplinas da prova: a IA classifica cada questão em uma delas e busca o assunto. */
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  /** Assuntos escolhidos no formulário: valem para as questões da disciplina de cada um (no lugar da sugestão da IA). */
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [subjectTopics, setSubjectTopics] = useState<SubjectTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [convertDraft, setConvertDraft] = useState<Draft | null>(null);
  /** Ao incluir tudo, agrupa as questões num simulado (rascunho) da modalidade escolhida — IFAL, CPM, ENEM… */
  const [createExam, setCreateExam] = useState(true);
  const [examTypeSlug, setExamTypeSlug] = useState("");
  /** Nome do simulado (padrão: nome da prova). */
  const [examTitle, setExamTitle] = useState("");
  /** Importação antiga que já criou um simulado do banco: as questões seguintes continuam nele. */
  const [questionSet, setQuestionSet] = useState<{ id: number; title: string } | null>(null);
  /** Simulado oficial desta importação. As questões seguintes entram nele. */
  const [exam, setExam] = useState<{ id: number; title: string } | null>(null);
  const target = exam ?? questionSet;
  /** Texto de cada página do PDF desta sessão (página de origem de cada questão). */
  const pdfPages = useRef<string[]>([]);
  const [extractedPdfText, setExtractedPdfText] = useState("");
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle", at: null });
  const autosave = useRef<Promise<void> | null>(null);
  const [concluding, setConcluding] = useState(false);
  const selectedExamType = catalogs.examTypes.find((t) => t.slug === examTypeSlug) ?? null;
  const [noTextPages, setNoTextPages] = useState<number[]>([]);
  /** Blocos de páginas que a IA não conseguiu separar (as demais questões seguem para revisão). */
  const [failedBlocks, setFailedBlocks] = useState<FailedBlock[]>([]);
  /** Texto do PDF desta sessão (reprocessar blocos com erro sem reenviar o arquivo) e página inicial de cada questão. */
  const pdfText = useRef<string | null>(null);
  const draftBlock = useRef(new Map<string, number>());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [savedDraft, setSavedDraft] = useState<{ id: string; revision: number } | null>(null);
  /** Última revisão salva (o autossalvamento a atualiza durante a conclusão). */
  const savedDraftRef = useRef<{ id: string; revision: number } | null>(null);
  savedDraftRef.current = savedDraft;
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
  const [showOtherDrafts, setShowOtherDrafts] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
    setExamTitle("");
    setExam(null);
    setQuestionSet(null);
    pdfPages.current = [];
    setExtractedPdfText("");
    setPdfFileName(null);
    setSaveStatus({ state: "idle", at: null });
    setSubjectIds([]);
    setTopicIds([]);
    setConvertDraft(null);
    setNoTextPages([]);
    setFailedBlocks([]);
    pdfText.current = null;
    draftBlock.current = new Map();
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

  // Assuntos das disciplinas da prova; ao tirar uma disciplina, os assuntos dela saem da escolha.
  const subjectKey = subjectIds.join(",");
  useEffect(() => {
    if (!visible || !subjectIds.length) {
      setSubjectTopics([]);
      return;
    }
    let cancelled = false;
    setTopicsLoading(true);
    void fetchTopics(subjectIds)
      .then((items) => {
        if (cancelled) return;
        setSubjectTopics(items);
        const valid = new Set(items.map((t) => t.id));
        setTopicIds((prev) => prev.filter((id) => valid.has(id)));
      })
      .catch(() => { if (!cancelled) setSubjectTopics([]); })
      .finally(() => { if (!cancelled) setTopicsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega só quando as disciplinas mudam
  }, [visible, subjectKey]);

  /**
   * Disciplina e assuntos do formulário nas questões extraídas: uma única disciplina vale para todas;
   * os assuntos escolhidos substituem os da IA nas questões da disciplina deles.
   */
  /** Disciplinas escolhidas primeiro: o título do PDF ("POTUGUÊS") casa com elas antes do resto do catálogo. */
  const sectionSubjects = () => {
    const chosen = subjectIds.flatMap((id) => {
      const subject = catalogs.subjects.find((item) => item.id === id);
      return subject ? [subject] : [];
    });
    return [...chosen, ...catalogs.subjects.filter((subject) => !subjectIds.includes(subject.id))];
  };

  const withChosenClassification = (c: ClassificationForm): ClassificationForm => {
    const subjectId = subjectIds.length === 1 ? subjectIds[0] : c.subject_id;
    const chosen = subjectTopics.filter((t) => topicIds.includes(t.id) && t.subject_id === subjectId).map((t) => t.id);
    if (chosen.length) return { ...c, subject_id: subjectId, topic_ids: chosen };
    return subjectId === c.subject_id ? c : { ...c, subject_id: subjectId, topic_ids: [] };
  };

  const settings: ImportDraftSettings = {
    create_exam: createExam, exam_type_slug: examTypeSlug || null, exam_title: examTitle.trim() || null,
    exam_id: exam?.id ?? null, question_set_id: questionSet?.id ?? null, subject_ids: subjectIds, topic_ids: topicIds,
    pdf_file_name: file?.name ?? pdfFileName,
  };
  const snapshot = (items = drafts, overrides: Partial<ImportDraftSettings> = {}): ImportDraftPayload => ({
    source_exam_name: sourceExamName.trim(), no_text_pages: noTextPages,
    active_question_key: items.some((item) => item.key === activeKey) ? activeKey : items[0]?.key ?? null,
    questions: items.map(({ imageLoadError, errors, ...question }) => question),
    settings: { ...settings, ...overrides },
  });
  const dirty = drafts.length > 0 && JSON.stringify(snapshot()) !== savedSnapshot;
  const close = () => {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  // Editar uma questão revisada não desfaz a revisão; só "reviewed" muda pelo botão Confirmar.
  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((draft) => draft.key === key ? { ...draft, ...patch } : draft));

  /** "Remover da importação": a questão sai da revisão (o autossalvamento grava a remoção). */
  const removeQuestion = (key: string) => {
    const index = drafts.findIndex((d) => d.key === key);
    const remaining = drafts.filter((d) => d.key !== key);
    if (!remaining.length) {
      setToast({ visible: true, type: "error", message: "A importação precisa de ao menos uma questão. Feche e exclua o rascunho, se quiser descartá-la." });
      return;
    }
    setDrafts(remaining);
    if (key === activeKey) setActiveKey(remaining[Math.min(index, remaining.length - 1)].key);
  };

  // Autossalvamento da revisão (2 s depois da última alteração), sem bloquear a tela.
  const snapshotJson = drafts.length && sourceExamName.trim() ? JSON.stringify(snapshot()) : "";
  useEffect(() => {
    if (!visible || !snapshotJson || busy || concluding || draftNeedsReload || snapshotJson === savedSnapshot) return;
    const timer = setTimeout(() => {
      if (autosave.current) return;
      const payload = JSON.parse(snapshotJson) as ImportDraftPayload;
      setSaveStatus((prev) => ({ ...prev, state: "saving" }));
      autosave.current = saveImportDraft(payload, savedDraft)
        .then((response) => {
          savedDraftRef.current = { id: response.body.id, revision: response.body.revision };
          setSavedDraft(savedDraftRef.current);
          setSavedSnapshot(snapshotJson);
          setSaveStatus({ state: "saved", at: new Date() });
        })
        .catch((cause) => {
          if (isAxiosError(cause) && cause.response?.status === 409) setDraftNeedsReload(true);
          setSaveStatus({ state: "error", at: null });
        })
        .finally(() => { autosave.current = null; });
    }, 2000);
    return () => clearTimeout(timer);
  }, [visible, snapshotJson, savedSnapshot, savedDraft, busy, concluding, draftNeedsReload]);

  /** Salva agora (Salvar e sair / antes de concluir): espera um autossalvamento em curso. */
  const flushSave = async (): Promise<boolean> => {
    if (autosave.current) await autosave.current;
    if (!drafts.length || !sourceExamName.trim()) return true;
    const payload = snapshot();
    const json = JSON.stringify(payload);
    if (json === savedSnapshot && savedDraftRef.current) return true;
    try {
      setSaveStatus((prev) => ({ ...prev, state: "saving" }));
      const response = await saveImportDraft(payload, savedDraftRef.current);
      savedDraftRef.current = { id: response.body.id, revision: response.body.revision };
      setSavedDraft(savedDraftRef.current);
      setSavedSnapshot(json);
      setSaveStatus({ state: "saved", at: new Date() });
      return true;
    } catch (cause) {
      if (isAxiosError(cause) && cause.response?.status === 409) setDraftNeedsReload(true);
      setSaveStatus({ state: "error", at: null });
      setError({ title: "Não foi possível salvar o rascunho", message: getApiErrorMessage(cause, "Tente novamente.") });
      return false;
    }
  };

  useEffect(() => {
    if (visible && resumeDraftId) void resumeDraft(resumeDraftId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir com um rascunho escolhido
  }, [visible, resumeDraftId]);

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
      const saved = body.settings ?? {};
      setCreateExam(saved.create_exam ?? true);
      if (saved.exam_type_slug) setExamTypeSlug(saved.exam_type_slug);
      setExamTitle(saved.exam_title ?? body.source_exam_name);
      setExam(saved.exam_id ? { id: saved.exam_id, title: saved.exam_title ?? body.source_exam_name } : null);
      setQuestionSet(saved.question_set_id ? { id: saved.question_set_id, title: saved.exam_title ?? body.source_exam_name } : null);
      if (saved.subject_ids?.length) setSubjectIds(saved.subject_ids);
      setTopicIds(saved.topic_ids ?? []);
      setPdfFileName(saved.pdf_file_name ?? null);
      // Igual ao snapshot() (mesma ordem de chaves) para o "há alterações" comparar certo.
      setSavedSnapshot(JSON.stringify({
        source_exam_name: body.source_exam_name, no_text_pages: body.no_text_pages,
        active_question_key: body.active_question_key ?? restored[0]?.key ?? null,
        questions: restored.map(({ imageLoadError, errors, ...question }) => question),
        settings: {
          create_exam: saved.create_exam ?? true, exam_type_slug: saved.exam_type_slug || null,
          exam_title: (saved.exam_title ?? body.source_exam_name).trim() || null, exam_id: saved.exam_id ?? null,
          question_set_id: saved.question_set_id ?? null,
          subject_ids: saved.subject_ids?.length ? saved.subject_ids : subjectIds, topic_ids: saved.topic_ids ?? [],
          pdf_file_name: saved.pdf_file_name ?? null,
        },
      }));
      setSaveStatus({ state: "saved", at: new Date(body.updated_at) });
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
        subject_id: draft.classification.subject_id ?? undefined,
        source_exam_name: sourceExamName.trim() || undefined,
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

  /** Dissertativa → objetiva: a IA reescreve o comando e cria as alternativas (a resolução vira a resposta esperada). */
  const convertToObjective = async (draft: Draft) => {
    setConvertDraft(null);
    if (busy) return;
    if (plainRichText(draft.content.question_text).trim().length < 15) {
      update(draft.key, { errors: { question_text: "Escreva um enunciado com pelo menos 15 caracteres para usar a IA." } });
      return;
    }
    setProgress(`Transformando a questão ${draft.sourceNumber} em objetiva com IA…`);
    try {
      const unavailable = await ensureAvailable();
      if (unavailable) {
        setError({ title: "IA indisponível", message: unavailable });
        return;
      }
      const response = await aiAutofillQuestion({
        question_text: draft.content.question_text,
        convert_to_objective: true,
        explanation: draft.content.explanation.trim() || undefined,
        subject_ids: subjectIds.length ? subjectIds : undefined,
        subject_id: draft.classification.subject_id ?? undefined,
        source_exam_name: sourceExamName.trim() || undefined,
      });
      update(draft.key, {
        content: objectiveFromSuggestion(draft.content, response.body),
        classification: applyClassificationSuggestion(draft.classification, response.body),
        answerFromPdf: false, errors: {},
      });
      setToast({ visible: true, type: "success", message: "Questão transformada em objetiva. Revise o enunciado e as alternativas antes de confirmar." });
    } catch (cause) { setError(describeAiError(cause, "Não foi possível transformar em objetiva")); }
    finally { setProgress(null); }
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

  /** Separa um bloco de páginas; uma nova tentativa automática antes de dar erro (a resposta da IA varia). */
  const separateBlock = async (text: string, block: { from: number; to: number }, totalBlocks: number, counter = "") => {
    const label = blockLabel(block);
    for (let attempt = 1; ; attempt += 1) {
      setProgress(`Separando e classificando as questões com IA: ${label} ${counter}${attempt > 1 ? " — nova tentativa" : ""}…`);
      try {
        const response = await aiSeparatePdfText(text, sourceExamName.trim(), subjectIds, totalBlocks > 1 ? block : undefined);
        return response.body.questions;
      } catch (cause) {
        if (attempt >= 2) throw cause;
      }
    }
  };

  /** Reprocessa só o bloco que falhou e encaixa as questões novas na ordem do PDF, sem duplicar. */
  const reprocessBlock = async (failedBlock: FailedBlock) => {
    const text = pdfText.current;
    if (busy || !text) return;
    try {
      const found = applyPdfSections(pdfPages.current, await separateBlock(text, failedBlock, Number.MAX_SAFE_INTEGER), sectionSubjects());
      const existing = new Set(drafts.map((d) => questionFingerprint({ question_text: d.content.question_text, options: d.content.options })));
      const stamp = Date.now();
      const added: Draft[] = found
        .filter((question) => !existing.has(questionFingerprint(question)))
        .map((question, index) => {
          const draft = toDraft(question, `pdf-p${failedBlock.from}-${stamp}-${index}`, String(index + 1));
          return {
            ...draft, classification: withChosenClassification(draft.classification),
            sourcePage: findSourcePage(pdfPages.current, question.question_text ?? "") ?? failedBlock.from,
          };
        });
      added.forEach((draft) => draftBlock.current.set(draft.key, failedBlock.from));
      setDrafts((prev) => {
        // Depois da última questão de páginas anteriores ao bloco (questões retomadas de rascunho vão ao fim).
        let at = prev.length;
        const firstAfter = prev.findIndex((d) => (draftBlock.current.get(d.key) ?? 0) > failedBlock.from);
        if (firstAfter >= 0) at = firstAfter;
        return [...prev.slice(0, at), ...added, ...prev.slice(at)];
      });
      setFailedBlocks((prev) => prev.filter((b) => b.from !== failedBlock.from));
      if (added[0]) setActiveKey(added[0].key);
      setToast({
        visible: true, type: added.length ? "success" : "error",
        message: added.length
          ? `${added.length} questão(ões) de ${failedBlock.pages} adicionada(s). Revise antes de incluir.`
          : `Nenhuma questão nova encontrada em ${failedBlock.pages}.`,
      });
    } catch (cause) {
      const message = describeAiError(cause, "Falha na separação").message;
      setFailedBlocks((prev) => prev.map((b) => (b.from === failedBlock.from ? { ...b, message } : b)));
      setToast({ visible: true, type: "error", message: `Ainda não foi possível separar ${failedBlock.pages}. Tente de novo.` });
    } finally {
      setProgress(null);
    }
  };

  const extract = async () => {
    if (!file || !sourceExamName.trim() || !subjectIds.length || (createExam && !examTypeSlug) || topicsLoading || busy) return;
    setProgress("Extraindo o texto do PDF no navegador…");
    try {
      const pages = await extractPdfPages(file);
      const text = pdfDocumentText(pages);
      setNoTextPages(pages.flatMap((page, index) => page.trim() ? [] : [index + 1]));
      pdfText.current = text;
      // Em blocos de páginas, na ordem: cada bloco vê as páginas vizinhas como contexto.
      const blocks = pageBlocks(pages.length);
      const questions: SeparatedQuestion[] = [];
      const fromPage: number[] = [];
      const seen = new Map<string, number>();
      const failed: FailedBlock[] = [];
      let lastCause: unknown = null;
      for (const [index, block] of blocks.entries()) {
        try {
          const found = await separateBlock(text, block, blocks.length, `(${index + 1} de ${blocks.length})`);
          for (const question of found) {
            const fingerprint = questionFingerprint(question);
            const previous = seen.get(fingerprint);
            if (previous === undefined) {
              seen.set(fingerprint, questions.length);
              questions.push(question);
              fromPage.push(block.from);
            } else if ((question.question_text ?? "").length > (questions[previous].question_text ?? "").length) {
              questions[previous] = question; // repetida: fica a versão com texto de apoio
            }
          }
        } catch (cause) {
          lastCause = cause;
          failed.push({ ...block, pages: blockLabel(block), message: describeAiError(cause, "Falha na separação").message });
        }
      }
      if (!questions.length) throw lastCause ?? new Error("Nenhuma questão foi encontrada no PDF.");
      const numbered = applyPdfSections(pages, questions, sectionSubjects());
      setFailedBlocks(failed);
      const response = {
        type: failed.length ? "warning" : "success",
        message: failed.length
          ? `${questions.length} questão(ões) separada(s). Não foi possível ler: ${failed.map((f) => f.pages).join(", ")}.`
          : `${questions.length} questão(ões) separada(s) pela IA. Revise e anexe as imagens necessárias antes de incluir.`,
        body: { questions: numbered },
      };
      pdfPages.current = pages;
      setExtractedPdfText(pages.join("\n"));
      setPdfFileName(file.name);
      setExamTitle((current) => current || sourceExamName.trim());
      const subjectName = (id: number | null) => (id ? catalogs.subjects.find((subject) => subject.id === id)?.name ?? null : null);
      const answered = withPdfAnswers(response.body.questions.map((question, index) => {
        const draft = toDraft(question, `pdf-${index}`, String(index + 1));
        return {
          ...draft, classification: withChosenClassification(draft.classification),
          sourcePage: findSourcePage(pages, question.question_text ?? ""),
        };
      }), pages, subjectName);
      const converted = answered.drafts;
      draftBlock.current = new Map(converted.map((draft, index) => [draft.key, fromPage[index]]));
      setDrafts(converted);
      setActiveKey(converted[0]?.key ?? "");
      const withKey = answered.marked
        ? { ...response, message: `${response.message} Gabarito do PDF aplicado em ${answered.marked} ${answered.marked === 1 ? "questão" : "questões"}.` }
        : response;
      showApiToast(setToast, withKey, "Questões separadas. Revise e anexe as imagens necessárias.");
    } catch (cause) {
      setError(cause instanceof Error && !("response" in cause)
        ? { title: "Não foi possível ler o PDF", message: cause.message }
        : describeAiError(cause, "Não foi possível separar as questões"));
    } finally {
      setProgress(null);
    }
  };

  /**
   * Conclusão (diálogo "Concluir importação"): inclui no banco só as questões escolhidas; as demais
   * continuam no rascunho. Com "Criar simulado", as incluídas viram um simulado do banco (rascunho) — ou entram
   * no fim do simulado criado numa conclusão anterior desta importação.
   */
  const conclude = async (choice: ConcludeChoice, keys: string[]): Promise<boolean> => {
    if (busy || concluding || draftNeedsReload || !sourceExamName.trim() || !keys.length) return false;
    if (choice.createExam && !target && (!choice.examTitle || !choice.examTypeSlug)) return false;
    const chosen = new Set(keys);
    setCreateExam(choice.createExam);
    if (choice.examTypeSlug) setExamTypeSlug(choice.examTypeSlug);
    if (choice.examTitle) setExamTitle(choice.examTitle);
    const examTypeId = choice.createExam
      ? catalogs.examTypes.find((t) => t.slug === (target ? examTypeSlug : choice.examTypeSlug))?.id ?? null
      : null;
    setConcluding(true);
    const selected = drafts.filter((draft) => chosen.has(draft.key));
    let remaining = drafts.filter((draft) => !chosen.has(draft.key));
    const ids: number[] = [];
    let failed = false;
    try {
      if (!(await flushSave())) return false;
      let persisted = savedDraftRef.current;
      for (const [index, draft] of selected.entries()) {
        setProgress(`Incluindo a questão ${index + 1} de ${selected.length} no banco…`);
        try {
          const payload = {
            ...contentPayload(draft.content),
            ...diffClassification(EMPTY_CLASSIFICATION_FORM, { ...draft.classification, exam_type_id: examTypeId ?? draft.classification.exam_type_id }),
            source_exam_name: sourceExamName.trim(),
            needs_image: draft.needsImage,
          };
          if (persisted) {
            const response = await includeImportDraftQuestion(persisted.id, draft.key, persisted.revision, payload);
            persisted = { id: response.body.draft.id, revision: response.body.draft.revision };
            setSavedDraft(persisted);
            ids.push(response.body.question.id);
          } else {
            const response = await createStandaloneQuestion(payload);
            ids.push(response.body.id);
          }
        } catch (cause) {
          failed = true;
          // Esta e as seguintes voltam para a revisão; não prossiga com uma revisão possivelmente obsoleta.
          remaining = [...remaining, { ...draft, errors: { form: getApiErrorMessage(cause, "Não foi possível salvar esta questão.") } },
            ...selected.slice(index + 1)];
          if (persisted) setDraftNeedsReload(true);
          break;
        }
      }
      // A ordem do PDF vale também para o que volta à revisão.
      const order = new Map(drafts.map((d, i) => [d.key, i]));
      remaining.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));

      let examMessage = "";
      if (choice.createExam && ids.length) {
        setProgress(target ? "Adicionando as questões ao simulado…" : "Criando o simulado com as questões incluídas…");
        try {
          let title: string;
          if (exam) {
            await appendToImportedExam(exam.id, ids);
            title = exam.title;
          } else if (questionSet) {
            title = (await addQuestionsToSet(questionSet.id, ids)).body.title;
          } else {
            const created = await createOfficialImportExam(choice.examTitle, choice.examTypeSlug, ids);
            title = created.title;
            setExam(created);
          }
          examMessage = ` no simulado "${title}"`;
        } catch (cause) {
          setError({
            title: "Questões incluídas, mas o simulado não foi atualizado",
            message: getApiErrorMessage(cause, questionSet
              ? "Abra Simulados do banco e adicione as questões manualmente."
              : "Abra Simulados e adicione as questões manualmente."),
          });
        }
      }
      if (ids.length) onCreated(ids.length);
      setDrafts(remaining);
      setActiveKey(remaining.find((d) => d.key === activeKey)?.key ?? remaining[0]?.key ?? "");
      if (!remaining.length) {
        setToast({ visible: true, type: "success", message: `${ids.length} questão(ões) incluída(s)${examMessage}. Importação concluída.` });
        onClose();
        return true;
      }
      setToast({
        visible: true, type: failed ? "error" : "success",
        message: failed
          ? `${ids.length} questão(ões) incluída(s)${examMessage}. Houve erro numa questão: confira na revisão.`
          : `${ids.length} questão(ões) incluída(s)${examMessage}. As outras ${remaining.length} continuam no rascunho.`,
      });
      return !failed;
    } catch (cause) {
      setError({ title: "Não foi possível concluir a importação", message: getApiErrorMessage(cause, "Nenhuma nova questão foi incluída. Tente novamente.") });
      return false;
    } finally {
      setConcluding(false);
      setProgress(null);
    }
  };

  /** Valida e guarda o PDF escolhido (clique ou arrastar). O nome da prova vem do arquivo, sem sobrescrever o digitado. */
  const pickFile = (selected: File | undefined | null) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".pdf") || selected.size > MAX_PDF_BYTES) {
      setError({ title: "Arquivo inválido", message: "Selecione um PDF de até 20 MB." });
      setFile(null);
      return;
    }
    setFile(selected);
    setSourceExamName((current) =>
      !current.trim() || current === (file ? examNameFromFile(file.name) : "") ? examNameFromFile(selected.name) : current);
  };

  // Etapa inicial (protótipo "TelaImportarPDF"): 1. Arquivo · 2. Origem · 3. Classificação.
  const missing = [!file && "arquivo", !sourceExamName.trim() && "nome", createExam && !examTypeSlug && "modalidade", !subjectIds.length && "disciplina"]
    .filter(Boolean) as string[];
  const latestDraft = savedImports[0] ?? null;
  const otherDrafts = savedImports.slice(1);
  const topicOptions = subjectTopics.map((t) => ({
    id: t.id, name: t.name,
    meta: subjectIds.length > 1 ? catalogs.subjects.find((x) => x.id === t.subject_id)?.name : t.questions_count ? `${t.questions_count} questões` : undefined,
  }));
  const topicSuggestions = [...subjectTopics].sort((a, b) => (b.questions_count ?? 0) - (a.questions_count ?? 0)).map((t) => ({ id: t.id, name: t.name }));

  const stepHead = (n: number, done: boolean, title: string, note?: string) => (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <View className="rounded-ds-sm items-center justify-center" style={{ width: 20, height: 20, backgroundColor: done ? color.success : color.brand }}>
        {done ? <Check size={12} color={color["on-brand"]} strokeWidth={2.5} />
          : <Text className="font-mono font-semibold" style={{ fontSize: 11, color: color["on-brand"] }}>{n}</Text>}
      </View>
      <Text className="text-ink font-semibold" style={{ fontSize: 15, lineHeight: 22 }}>{title}</Text>
      {note ? <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{note}</Text> : null}
    </View>
  );

  const draftBanner = latestDraft ? (
    <View style={{ gap: 6 }}>
      <View className="flex-row items-center flex-wrap border border-border rounded-ds-md bg-surface-sunken" style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
        <FileText size={20} color={color["ink-muted"]} strokeWidth={1.5} />
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text className="text-ink font-medium" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>Rascunho em andamento: {latestDraft.source_exam_name}</Text>
          <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
            {latestDraft.question_count} {latestDraft.question_count === 1 ? "questão" : "questões"} em revisão · salvo {savedAtLabel(latestDraft.updated_at)}
          </Text>
        </View>
        <View className="flex-row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" label="Descartar" disabled={busy || listLoading} onPress={() => setDeleteDraft(latestDraft)} />
          <Button size="sm" label="Continuar revisão" disabled={busy || listLoading} onPress={() => void resumeDraft(latestDraft.id)} />
        </View>
      </View>
      {otherDrafts.length || draftPage < lastDraftPage ? (
        <TouchableOpacity onPress={() => setShowOtherDrafts((v) => !v)} style={{ alignSelf: "flex-start" }}>
          <Text className="text-brand font-medium" style={{ fontSize: 13 }}>
            {showOtherDrafts ? "Ocultar outros rascunhos" : `Outros rascunhos (${otherDrafts.length}${draftPage < lastDraftPage ? "+" : ""})`}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showOtherDrafts ? (
        <View className="border border-border rounded-ds-md" style={{ paddingHorizontal: 12 }}>
          {otherDrafts.map((item, i) => (
            <View key={item.id} className="flex-row items-center" style={{ gap: 8, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: color.border }}>
              <View style={{ flex: 1 }}>
                <Text className="text-ink" style={{ fontSize: 13 }} numberOfLines={1}>{item.source_exam_name}</Text>
                <Text className="text-ink-subtle" style={{ fontSize: 12 }}>{item.question_count} questões · salvo {savedAtLabel(item.updated_at)}</Text>
              </View>
              <Button size="sm" variant="ghost" label="Excluir" accessibilityLabel={`Excluir rascunho ${item.source_exam_name}`} disabled={busy || listLoading} onPress={() => setDeleteDraft(item)} />
              <Button size="sm" label="Continuar" disabled={busy || listLoading} onPress={() => void resumeDraft(item.id)} />
            </View>
          ))}
          {draftPage < lastDraftPage ? (
            <View style={{ paddingVertical: 8 }}><Button size="sm" variant="ghost" label="Carregar mais rascunhos" disabled={busy || listLoading} onPress={() => void loadMoreDrafts()} /></View>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const fileStep = (
    <View style={{ gap: 12 }}>
      {stepHead(1, !!file, "Arquivo")}
      {file ? (
        <View className="flex-row items-center border border-border-strong rounded-ds-md" style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
          <View className="bg-surface items-center justify-end" style={{ width: 30, height: 36, borderWidth: 1, borderColor: color["border-strong"], paddingBottom: 4 }}>
            <Text className="font-mono font-semibold" style={{ fontSize: 8, color: color.danger }}>PDF</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-ink font-medium" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>{file.name}</Text>
            <Text className="font-mono text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
              {formatBytes(file.size)} · <Text style={{ color: color.success, fontFamily: undefined }}>pronto para separar</Text>
            </Text>
          </View>
          <Button size="sm" variant="ghost" label="Trocar" disabled={busy} onPress={() => fileRef.current?.click()} />
        </View>
      ) : (
        // Área de soltar o PDF (web): clique ou arraste.
        <div
          role="button"
          tabIndex={0}
          aria-label="Selecionar arquivo PDF"
          onClick={() => !busy && fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 16px", textAlign: "center", cursor: "pointer",
            border: `1.5px dashed ${dragOver ? color.brand : color["border-strong"]}`, borderRadius: 4, background: color["surface-sunken"],
          }}
        >
          <Upload size={28} color={color["ink-subtle"]} strokeWidth={1.5} />
          <Text className="text-ink font-medium" style={{ fontSize: 15, lineHeight: 22 }}>Arraste o PDF aqui ou clique para selecionar</Text>
          <View className="flex-row flex-wrap justify-center" style={{ gap: 6, marginTop: 4 }}>
            {["até 20 MB", "80 páginas", "50 questões", "texto selecionável"].map((l) => (
              <View key={l} className="bg-surface border border-border rounded-ds-sm" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                <Text className="font-mono text-ink-muted" style={{ fontSize: 12, lineHeight: 12 }}>{l}</Text>
              </View>
            ))}
          </View>
        </div>
      )}
    </View>
  );

  const originStep = (
    <View style={{ gap: 12 }}>
      {stepHead(2, !!sourceExamName.trim() && (!createExam || !!examTypeSlug), "Origem")}
      <FormInput label="Nome da prova ou simulado" value={sourceExamName} onChangeText={setSourceExamName} maxLength={255} required
        editable={!busy} placeholder="Ex.: Simulado CPM 2025 – 1ª aplicação" />
      <View className="border border-border rounded-ds-md" style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Switch accessibilityLabel="Criar simulado com estas questões" value={createExam} disabled={busy} onValueChange={setCreateExam} />
          <Text className="text-ink font-medium flex-1" style={{ fontSize: 14 }}>Criar simulado com estas questões</Text>
        </View>
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16, marginTop: -6, marginLeft: 52 }}>
          {createExam
            ? "Fica como rascunho em Simulados. Arquive-o quando quiser liberar as questões para os alunos praticarem no app."
            : "As questões entram apenas no banco, como avulsas."}
        </Text>
        {createExam ? (
          <View style={{ marginLeft: 52 }}>
            <View className="flex-row items-end" style={{ gap: 10 }}>
              <View className="flex-1">
                <SearchableSelect label="Modalidade" required modalTitle="Selecionar modalidade" placeholder="IFAL, CPM, ENEM…" value={examTypeSlug}
                  disabled={busy} showSelectedPreview={false}
                  options={catalogs.examTypes.filter((t) => t.slug).map((t) => ({ value: t.slug!, label: t.label }))} onChange={setExamTypeSlug} />
              </View>
              {selectedExamType ? (
                <View style={{ marginBottom: 16 }}>
                  <ExamTypeLogo size={38} label={selectedExamType.label} logoUrl={selectedExamType.logo_url} />
                </View>
              ) : null}
            </View>
            <Text className="text-ink-subtle" style={{ fontSize: 12, marginTop: -8 }}>Vale para todas as questões importadas.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const classificationStep = (
    <View style={{ gap: 12 }}>
      {stepHead(3, subjectIds.length > 0, "Classificação", "A IA usa para classificar cada questão")}
      <TokenSelect label="Disciplinas cobradas no PDF" required options={catalogs.subjects.map((x) => ({ id: x.id, name: x.name }))}
        value={subjectIds} onChange={setSubjectIds} disabled={busy} placeholder="Buscar disciplina (ex.: Matemática)" morePlaceholder="Adicionar outra…" />
      <TokenSelect label="Assuntos" labelNote="(opcional)" options={topicOptions} value={topicIds} onChange={setTopicIds} loading={topicsLoading}
        disabled={busy || !subjectIds.length || (!topicsLoading && !subjectTopics.length)}
        disabledPlaceholder={!subjectIds.length ? "Escolha uma disciplina primeiro" : "As disciplinas escolhidas não têm assuntos cadastrados"}
        placeholder="Buscar assunto…" morePlaceholder="Adicionar outro…" suggestions={topicSuggestions}
        hint={subjectIds.length === 1
          ? "Todas as questões ficam nesta disciplina. Os assuntos escolhidos valem para todas; sem escolha, a IA sugere. Tudo pode ser ajustado na revisão."
          : "Assuntos escolhidos valem para as questões da sua disciplina; nas demais, a IA sugere. Tudo pode ser ajustado na revisão."} />
    </View>
  );

  const howItWorks = (
    <View className="border border-border rounded-ds-md">
      <TouchableOpacity onPress={() => setShowHowItWorks((v) => !v)} className="flex-row items-center" style={{ gap: 8, paddingVertical: 10, paddingHorizontal: 16 }}
        aria-expanded={showHowItWorks}>
        <ChevronRight size={16} color={color["ink-muted"]} style={{ transform: [{ rotate: showHowItWorks ? "90deg" : "0deg" }] }} />
        <Text className="text-ink-muted font-medium" style={{ fontSize: 13 }}>Como a importação funciona</Text>
      </TouchableOpacity>
      {showHowItWorks ? (
        <View style={{ paddingLeft: 40, paddingRight: 16, paddingBottom: 12, gap: 4 }}>
          {[
            "O texto é extraído no seu navegador; só o texto vai para a IA — nenhuma imagem é enviada ou gerada.",
            "Questões que dependem de figura ficam marcadas para você recortar a imagem do PDF na revisão.",
            "PDFs escaneados precisam de OCR antes da importação. Limite de 120 mil caracteres por importação.",
          ].map((t) => <Text key={t} className="text-ink-muted" style={{ fontSize: 13, lineHeight: 20 }}>•  {t}</Text>)}
        </View>
      ) : null}
    </View>
  );

  const listNotice = failedBlocks.length > 0 || noTextPages.length > 0 ? (
    <View className="border-b border-border bg-warning-tint px-3 py-2" style={{ gap: 6 }}>
      {failedBlocks.map((f) => (
        <View key={f.pages} style={{ gap: 4 }}>
          <Text className="text-xs font-semibold text-warning">A IA não separou {f.pages}: as questões dessas páginas não estão na lista.</Text>
          <Text className="text-xs text-warning" numberOfLines={2}>{f.message}</Text>
          {pdfText.current ? (
            <View className="self-start"><Button variant="ai" size="sm" icon={Sparkles} label={`Reprocessar ${f.pages}`} disabled={busy} onPress={() => void reprocessBlock(f)} /></View>
          ) : null}
        </View>
      ))}
      {noTextPages.length > 0 && (
        <Text className="text-xs text-warning">Páginas sem texto extraível: {noTextPages.join(", ")} (PDF escaneado precisa de OCR).</Text>
      )}
    </View>
  ) : null;

  const editorNotice = draftNeedsReload && savedDraft ? (
    <View className="flex-row flex-wrap items-center border border-danger bg-danger-tint rounded-ds-md px-4 py-3 mb-4" style={{ gap: 12 }}>
      <Text className="text-[13px] text-danger flex-1" style={{ minWidth: 220 }}>
        Este rascunho foi alterado em outro lugar. Reabra a versão salva antes de continuar; alterações locais não salvas serão descartadas.
      </Text>
      <Button size="sm" label="Reabrir versão salva" disabled={busy} onPress={() => void resumeDraft(savedDraft.id)} />
    </View>
  ) : null;

  return (
    <>
      <Modal
        visible={visible && !drafts.length}
        title="Importar PDF com IA"
        onClose={close}
        size="md"
        maxHeight="94%"
        headerContent={
          <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}>
            A IA separa as questões do PDF. Você revisa cada uma antes de entrar no banco.
          </Text>
        }
        footer={
          <View className="flex-row flex-wrap items-center" style={{ gap: 12 }}>
            <Text className="text-ink-subtle" style={{ fontSize: 12, flex: 1, minWidth: 160 }}>
              {missing.length ? <>Falta: <Text className="font-medium" style={{ color: color.warning }}>{missing.join(", ")}</Text></>
                : "Leva cerca de 1 minuto para 40 questões."}
            </Text>
            <View className="flex-row" style={{ gap: 8 }}>
              <Button label="Cancelar" onPress={close} disabled={busy} />
              <Button variant="primary" icon={Sparkles} label="Separar questões com IA" onPress={() => void extract()}
                disabled={missing.length > 0 || topicsLoading || busy} />
            </View>
          </View>
        }
      >
        <View style={{ gap: 20 }}>
          {listLoading && !savedImports.length ? <Text className="text-ink-subtle" style={{ fontSize: 13 }}>Procurando rascunhos…</Text> : null}
          {draftListError ? <Text className="text-danger" style={{ fontSize: 13 }}>{draftListError}</Text> : null}
          {draftBanner}
          {fileStep}
          {originStep}
          {classificationStep}
          {howItWorks}
        </View>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
          onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
      </Modal>
      {visible && drafts.length > 0 && (
        <ImportReviewWorkspace
          sourceExamName={sourceExamName}
          drafts={drafts}
          activeKey={activeKey}
          onActiveKey={setActiveKey}
          onChangeDraft={update}
          busy={busy || concluding}
          catalogs={catalogs}
          subjectIds={subjectIds}
          pdfFile={file}
          pdfFileName={pdfFileName}
          pdfText={extractedPdfText}
          onPickPdf={(picked) => { setFile(picked); setPdfFileName(picked.name); }}
          saveStatus={saveStatus}
          onClose={close}
          onSaveAndExit={() => void flushSave().then((ok) => { if (ok) onClose(); })}
          onAutofill={(draft) => void autofill(draft)}
          onConvertToObjective={(draft) => setConvertDraft(drafts.find((d) => d.key === draft.key) ?? null)}
          onRemove={removeQuestion}
          onUploadImage={(key, picked) => void uploadImage(key, picked)}
          exam={{ createExam, examTitle: examTitle || sourceExamName, examTypeSlug, existingExamTitle: target?.title ?? null }}
          concluding={concluding}
          onConclude={conclude}
          listNotice={listNotice}
          editorNotice={editorNotice}
        />
      )}
      <ProgressDialog visible={busy} title="Importação com IA" message={progress ?? ""} />
      <MessageModal visible={error !== null} type="error" title={error?.title ?? ""} message={error?.message ?? ""} onClose={() => setError(null)} />
      <ConfirmModal visible={deleteDraft !== null} title="Excluir rascunho da importação?"
        message={`O rascunho "${deleteDraft?.source_exam_name ?? ""}" (${deleteDraft?.question_count ?? 0} questões em revisão) será excluído. Questões já incluídas no banco não são afetadas.`}
        loading={deletingDraft} onCancel={() => setDeleteDraft(null)} onConfirm={() => void removeDraft()} />
      <ConfirmModal visible={convertDraft !== null} title="Transformar em objetiva com IA?"
        message={`A IA reescreve o comando da questão ${convertDraft?.sourceNumber ?? ""}, cria as alternativas com o gabarito e atualiza a resolução. Revise antes de confirmar a questão.`}
        confirmLabel="Transformar" cancelLabel="Cancelar"
        onCancel={() => setConvertDraft(null)} onConfirm={() => { if (convertDraft) void convertToObjective(convertDraft); }} />
      <ConfirmModal visible={confirmClose} title="Fechar sem salvar as alterações?"
        message="Há alterações ainda não salvas nesta importação. Cancele e use Salvar e sair para retomar depois."
        confirmLabel="Fechar sem salvar" cancelLabel="Continuar revisão"
        onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }} />
    </>
  );
}
