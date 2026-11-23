import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { ImagePlus, Trash2 } from "lucide-react-native";
import Button from "../../components/ui/Button";
import SegmentedControl from "../../components/banco-questoes/SegmentedControl";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import {
  getApiValidationErrors,
  showApiErrorToast,
  showApiToast,
} from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import { type SelectOption } from "../../components/ui/FormSelect";
import SearchableSelect, { SearchableOption } from "../../components/ui/SearchableSelect";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import ExamBankReleaseModal from "../../components/banco-questoes/ExamBankReleaseModal";
import { fetchExamTopicRelease } from "../../services/questionBank";
import { fetchExamDeliveryReport } from "../../services/examDeliveryReport";
import { useExamStatuses, useExamTypes, domainToOptions } from "../../hooks/useDomains";
import DateTimePickerInput from "../../components/ui/DateTimePickerInput";
import {
  displayDateTimeToISO,
  displayDateTimeToMs,
  isoToDisplayDateTime,
  isValidDisplayDateTime,
} from "../../utils/masks";
import { prepareImageForUpload } from "../../utils/imageCompression";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import ExamPreviewPlayer from "../../components/simulados/ExamPreviewPlayer";
import ExamQuestionErrorsReportModal from "../../components/simulados/ExamQuestionErrorsReportModal";
import ExamAnswerKeyDialog from "../../components/simulados/ExamAnswerKeyDialog";
import { mapExamQuestionToPreview } from "../../components/simulados/examPreviewUtils";
import type {
  ExamForm,
  ExamFormScreenProps,
  ExamOptionForm,
  ExamQuestion,
  ExamQuestionForm,
  ExamSupportMaterial,
  ExamSupportMaterialForm,
} from "../../types/simulados";
import RichTextInput from "../../components/ui/RichTextInput";
import ClassificationFields from "../../components/banco-questoes/ClassificationFields";
import { useQuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import { type ClassificationForm, EMPTY_CLASSIFICATION_FORM, validateClassification } from "../../utils/questionClassification";
import { plainRichText } from "../../utils/richText";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_EXAM: ExamForm = {
  title: "",
  exam_type: "",
  status: "draft",
  course_ids: [],
  subject_id: "",
  description: "",
  duration_minutes: "",
  passing_score: "",
  starts_at: "",
  ends_at: "",
  release_results_after_end: "false",
  allow_retake: "false",
  max_attempts: "",
  min_score_to_retake: "",
};

const EMPTY_QUESTION: ExamQuestionForm = {
  type: "multiple_choice",
  exam_type: "",
  question_text: "",
  subject_id: "",
  points: "1.0",
  order: "",
  image_url: "",
  video_url: "",
  explanation: "",
  options: [
    { option_text: "", is_correct: false, order: 1, triggers_text_input: false },
    { option_text: "", is_correct: false, order: 2, triggers_text_input: false },
    { option_text: "", is_correct: false, order: 3, triggers_text_input: false },
    { option_text: "", is_correct: false, order: 4, triggers_text_input: false },
  ],
};

const EMPTY_SUPPORT_MATERIAL: ExamSupportMaterialForm = {
  title: "",
  description: "",
  type: "link",
  content: "",
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateExam(form: ExamForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.title.trim()) errs.title = "Título é obrigatório.";
  if (!form.exam_type) errs.exam_type = "Selecione a modalidade do simulado.";
  if (!form.status) errs.status = "Selecione o status do simulado.";
  if (form.duration_minutes) {
    const dur = Number(form.duration_minutes);
    if (!Number.isInteger(dur) || dur < 1)
      errs.duration_minutes = "Duração deve ser um número inteiro maior que 0.";
  }
  if (form.passing_score) {
    const score = Number(form.passing_score);
    if (Number.isNaN(score)) errs.passing_score = "Nota mínima deve ser um número.";
    else if (score < 0 || score > 100) errs.passing_score = "Nota mínima deve estar entre 0 e 100.";
  }
  if (form.starts_at.trim() && !isValidDisplayDateTime(form.starts_at.trim())) {
    errs.starts_at = "Data de início inválida. Use DD/MM/AAAA HH:MM.";
  }
  if (form.ends_at.trim() && !isValidDisplayDateTime(form.ends_at.trim())) {
    errs.ends_at = "Data de encerramento inválida. Use DD/MM/AAAA HH:MM.";
  }
  if (
    form.starts_at.trim() &&
    form.ends_at.trim() &&
    isValidDisplayDateTime(form.starts_at.trim()) &&
    isValidDisplayDateTime(form.ends_at.trim())
  ) {
    const startMs = displayDateTimeToMs(form.starts_at);
    const endMs = displayDateTimeToMs(form.ends_at);
    if (startMs != null && endMs != null && endMs <= startMs) {
      errs.ends_at = "A data de encerramento deve ser posterior à data de início.";
    }
  }
  if (form.release_results_after_end === "true" && !form.ends_at.trim()) {
    errs.ends_at = "Informe a data final para liberar o resultado só após o fechamento do período.";
  }
  if (form.allow_retake === "true") {
    if (form.max_attempts) {
      const max = Number(form.max_attempts);
      if (!Number.isInteger(max) || max < 1)
        errs.max_attempts = "Máximo de tentativas deve ser um inteiro maior que 0.";
    }
    if (form.min_score_to_retake) {
      const minScore = Number(form.min_score_to_retake);
      if (Number.isNaN(minScore) || minScore < 0 || minScore > 100)
        errs.min_score_to_retake = "Nota para nova tentativa deve estar entre 0 e 100.";
    }
  }
  return errs;
}

function validateQuestionEnunciado(form: ExamQuestionForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.exam_type) errs.exam_type = "Defina a modalidade do simulado em Dados gerais.";
  if (!plainRichText(form.question_text).trim() && !form.image_url.trim()) {
    errs.enunciado = "Informe o enunciado em texto, imagem, ou ambos.";
  }
  if (form.points) {
    const pts = Number(form.points);
    if (Number.isNaN(pts) || pts <= 0) errs.points = "Pontuação deve ser um número maior que 0.";
  }
  if (form.order) {
    const ord = Number(form.order);
    if (!Number.isInteger(ord) || ord < 1) errs.order = "Ordem deve ser um número inteiro maior que 0.";
  }
  if (form.video_url.trim() && !/^https?:\/\//i.test(form.video_url.trim())) {
    errs.video_url = "Informe uma URL de vídeo válida (http:// ou https://).";
  }
  return errs;
}

function validateQuestionAlternatives(form: ExamQuestionForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (form.type !== "multiple_choice") return errs;
  const filled = form.options.filter((o) => plainRichText(o.option_text).trim());
  if (filled.length < 2) errs.options = "Informe pelo menos 2 opções.";
  const hasCorrect = form.options.some((o) => o.is_correct && plainRichText(o.option_text).trim());
  if (!hasCorrect) errs.options = "Marque pelo menos uma opção como correta.";
  return errs;
}

function validateQuestion(form: ExamQuestionForm): Record<string, string> {
  return { ...validateQuestionEnunciado(form), ...validateQuestionAlternatives(form) };
}

const DURATION_CHIPS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "60 min" },
  { value: "90", label: "90 min" },
  { value: "120", label: "2 h" },
  { value: "", label: "Sem limite" },
] as const;

function formSnapshot(form: ExamForm): string {
  return JSON.stringify({ ...form, course_ids: [...form.course_ids].sort((a, b) => a - b) });
}

function examWindowLabel(starts: string, ends: string): string | null {
  if (!isValidDisplayDateTime(starts.trim()) || !isValidDisplayDateTime(ends.trim())) return null;
  const startMs = displayDateTimeToMs(starts);
  const endMs = displayDateTimeToMs(ends);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  const hours = Math.round((endMs - startMs) / 36e5);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const parts = [
    days ? `${days} ${days === 1 ? "dia" : "dias"}` : "",
    rest ? `${rest} h` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" e ") : "menos de 1 h";
}

function shortPeriod(starts: string, ends: string): string {
  if (!starts.trim() && !ends.trim()) return "Sem prazo definido";
  const day = (value: string) => (value.length >= 5 ? value.slice(0, 5) : value);
  const time = ends.length >= 16 ? ends.slice(11, 16) : "";
  if (starts.trim() && ends.trim()) return `${day(starts)} a ${day(ends)}${time ? ` · até ${time}` : ""}`;
  return starts.trim() ? `A partir de ${day(starts)}` : `Até ${day(ends)}${time ? ` · ${time}` : ""}`;
}

function resolveExamId(data: unknown): number | null {
  const root = data as Record<string, unknown> | null | undefined;
  if (!root) return null;
  const body = (root.body ?? root.data ?? root) as Record<string, unknown>;
  const id = body.id;
  return typeof id === "number" ? id : null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExamFormScreen({ examId, navigate, listQuery = "" }: ExamFormScreenProps) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const stacked = width < 1180;
  const [savedExamId, setSavedExamId] = useState<number | null>(null);
  const [postCreatePrompt, setPostCreatePrompt] = useState(false);
  const effectiveExamId = examId ?? savedExamId;
  const canManageContent = effectiveExamId != null;
  const scrollRef = useRef<ScrollView>(null);
  const supportMaterialFileInputRef = useRef<HTMLInputElement | null>(null);
  const questionImageInputRef = useRef<HTMLInputElement | null>(null);

  // Domain hooks
  const examStatuses = useExamStatuses();
  const examTypes = useExamTypes();
  // Listas com busca (SearchableSelect): valores em string.
  const toSearchable = (items: SelectOption[]): SearchableOption[] => items.map((o) => ({ value: String(o.value), label: o.label }));
  const examTypeOptions = toSearchable(domainToOptions(examTypes));
  const examStatusOptions = toSearchable(domainToOptions(examStatuses));
  const retakeOptions: SearchableOption[] = [
    { value: "false", label: "Não" },
    { value: "true", label: "Sim" },
  ];
  const releaseOptions: SearchableOption[] = [
    { value: "false", label: "Liberar assim que corrigir" },
    { value: "true", label: "Liberar só após o fim do período" },
  ];
  const supportMaterialTypeOptions: SearchableOption[] = [
    { value: "link", label: "Link" },
    { value: "file", label: "Arquivo" },
  ];

  // Exam form state
  const [loading, setLoading] = useState(examId !== null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ExamForm>(EMPTY_EXAM);
  const [savedForm, setSavedForm] = useState<ExamForm>(EMPTY_EXAM);
  const [progress, setProgress] = useState<{ eligible: number; delivered: number; average: number | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Select options loaded from API
  const [courseOptions, setCourseOptions] = useState<{ id: number; name: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SearchableOption[]>([]);

  // Questions state
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionModal, setQuestionModal] = useState(false);
  const [questionModalStep, setQuestionModalStep] = useState<1 | 2>(1);
  const [editQuestionId, setEditQuestionId] = useState<number | null>(null);
  const [qForm, setQForm] = useState<ExamQuestionForm>(EMPTY_QUESTION);
  /** Classificação completa da questão (mesmo detalhamento do banco de questões). */
  const [qClass, setQClass] = useState<ClassificationForm>(EMPTY_CLASSIFICATION_FORM);
  const questionCatalogs = useQuestionBankCatalogs();
  const [qErrors, setQErrors] = useState<Record<string, string>>({});
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  // Support materials state
  const [supportMaterials, setSupportMaterials] = useState<ExamSupportMaterial[]>([]);
  const [loadingSupportMaterials, setLoadingSupportMaterials] = useState(false);
  const [supportMaterialModal, setSupportMaterialModal] = useState(false);
  const [supportMaterialForm, setSupportMaterialForm] = useState<ExamSupportMaterialForm>(
    EMPTY_SUPPORT_MATERIAL
  );
  const [supportMaterialErrors, setSupportMaterialErrors] = useState<Record<string, string>>({});
  const [savingSupportMaterial, setSavingSupportMaterial] = useState(false);
  const [editSupportMaterialId, setEditSupportMaterialId] = useState<number | null>(null);
  const [deleteSupportMaterialId, setDeleteSupportMaterialId] = useState<number | null>(null);
  const [deletingSupportMaterial, setDeletingSupportMaterial] = useState(false);
  const [supportMaterialFile, setSupportMaterialFile] = useState<File | null>(null);
  const [uploadingSupportMaterialFile, setUploadingSupportMaterialFile] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error";
    message: string;
  }>({
    visible: false,
    type: "success",
    message: "",
  });
  const [errorsReportOpen, setErrorsReportOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"duplicate" | "reset" | null>(null);
  const [acting, setActing] = useState(false);
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseMode, setReleaseMode] = useState<"ask" | "edit">("ask");
  const statusOnServerRef = useRef("draft");

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          api.get("/courses", { params: { per_page: 200 } }),
          api.get("/subjects", { params: { status: "active", per_page: 200 } }),
        ]);
        setCourseOptions(
          (cRes.data.data ?? cRes.data).map((c: { id: number; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        );
        setSubjectOptions([
          { value: "", label: "Nenhuma" },
          ...(sRes.data.data ?? sRes.data).map((s: any) => ({ value: String(s.id), label: s.name })),
        ] as SearchableOption[]);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!examId) return;
    if (savedExamId === examId) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/exams/${examId}`);
        const exam = data.body ?? data;
        const loaded: ExamForm = {
          title: exam.title ?? "",
          exam_type: exam.exam_type ?? "custom",
          status: exam.status ?? "draft",
          course_ids: Array.isArray(exam.courses)
            ? exam.courses.map((c: { id: number }) => c.id)
            : Array.isArray(exam.course_ids)
              ? exam.course_ids
              : exam.course?.id
                ? [exam.course.id]
                : [],
          subject_id: exam.subject?.id ? String(exam.subject.id) : "",
          description: exam.description ?? "",
          duration_minutes: exam.duration_minutes != null ? String(exam.duration_minutes) : "",
          passing_score: exam.passing_score != null ? String(exam.passing_score) : "",
          starts_at: exam.starts_at ? isoToDisplayDateTime(exam.starts_at) : "",
          ends_at: exam.ends_at ? isoToDisplayDateTime(exam.ends_at) : "",
          release_results_after_end: String(Boolean(exam.release_results_after_end)),
          allow_retake: String(Boolean(exam.allow_retake)),
          max_attempts: exam.max_attempts != null ? String(exam.max_attempts) : "",
          min_score_to_retake:
            exam.min_score_to_retake != null ? String(exam.min_score_to_retake) : "",
        };
        setForm(loaded);
        setSavedForm(loaded);
        setQuestions(exam.questions ?? []);
        statusOnServerRef.current = exam.status ?? "draft";
      } catch {}
      setLoading(false);
    })();
  }, [examId, savedExamId]);

  const fetchQuestions = useCallback(async () => {
    if (!effectiveExamId) return;
    setLoadingQuestions(true);
    try {
      const { data } = await api.get(`/exams/${effectiveExamId}`);
      setQuestions((data.body ?? data).questions ?? []);
    } catch {}
    setLoadingQuestions(false);
  }, [effectiveExamId]);

  const fetchSupportMaterials = useCallback(async () => {
    if (!effectiveExamId) return;
    setLoadingSupportMaterials(true);
    try {
      const { data } = await api.get(`/exams/${effectiveExamId}/support-materials`);
      const rows = data?.body ?? data?.data ?? data;
      setSupportMaterials(Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : []);
    } catch {
      setSupportMaterials([]);
    }
    setLoadingSupportMaterials(false);
  }, [effectiveExamId]);

  useEffect(() => {
    if (!effectiveExamId) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [report, statsRes] = await Promise.all([
          fetchExamDeliveryReport(effectiveExamId),
          api.get(`/exams/${effectiveExamId}/stats`),
        ]);
        if (cancelled) return;
        const stats = statsRes.data?.body ?? statsRes.data ?? {};
        const average = stats.avg_percentage;
        setProgress({
          eligible: report.summary.eligible_students_count,
          delivered: report.summary.delivered_students_count,
          average: typeof average === "number" ? average : null,
        });
      } catch {
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveExamId]);

  // ── Exam Save ────────────────────────────────────────────────────────────────

  const setField = (k: keyof ExamForm, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const toggleCourse = (courseId: number) => {
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(courseId)
        ? prev.course_ids.filter((id) => id !== courseId)
        : [...prev.course_ids, courseId],
    }));
  };

  const showFormErrors = (errs: Record<string, string>, scroll = true) => {
    setErrors(errs);
    const first = Object.values(errs).find((msg) => msg?.trim());
    if (first) {
      setToast({ visible: true, type: "error", message: first });
    }
    if (scroll) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const maybeAskBankRelease = async (id: number) => {
    try {
      const release = await fetchExamTopicRelease(id);
      if (!release.subjects.some((subject) => subject.topics.length > 0)) return;
      setReleaseMode("ask");
      setReleaseOpen(true);
    } catch (err: unknown) {
      showApiErrorToast(setToast, err, "O simulado foi salvo, mas não foi possível abrir a liberação do banco.");
    }
  };

  const saveExam = async (): Promise<boolean> => {
    const errs = validateExam(form);
    if (Object.keys(errs).length > 0) {
      showFormErrors(errs);
      return false;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        exam_type: form.exam_type,
        status: form.status,
        description: form.description.trim() || null,
        course_ids: form.course_ids,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        passing_score: form.passing_score ? Number(form.passing_score) : null,
        starts_at: displayDateTimeToISO(form.starts_at) || null,
        ends_at: displayDateTimeToISO(form.ends_at) || null,
        release_results_after_end: form.release_results_after_end === "true",
        allow_retake: form.allow_retake === "true",
        max_attempts:
          form.allow_retake === "true" && form.max_attempts
            ? Number(form.max_attempts)
            : null,
        min_score_to_retake:
          form.allow_retake === "true" && form.min_score_to_retake
            ? Number(form.min_score_to_retake)
            : null,
      };

      if (canManageContent && effectiveExamId) {
        const wasPublished = statusOnServerRef.current === "published";
        const { data } = await api.put(`/exams/${effectiveExamId}`, payload);
        statusOnServerRef.current = form.status;
        showApiToast(setToast, data, "Operação realizada com sucesso.");
        if (form.status === "published" && !wasPublished) {
          void maybeAskBankRelease(effectiveExamId);
        }
      } else {
        const { data } = await api.post("/exams", payload);
        const newId = resolveExamId(data);
        if (!newId) {
          throw new Error("Resposta da API sem identificador do simulado.");
        }
        setSavedExamId(newId);
        navigate("simulados-form", { examId: newId, ...(listQuery ? { query: listQuery } : {}) });
        setPostCreatePrompt(true);
        showApiToast(setToast, data, "Simulado criado com sucesso.");
      }
      setSavedForm({ ...form, course_ids: [...form.course_ids] });
      setErrors({});
      return true;
    } catch (err: unknown) {
      const apiErrs = getApiValidationErrors(err);
      if (Object.keys(apiErrs).length > 0) {
        if (apiErrs.exam_type) {
          setForm((prev) => ({ ...prev, exam_type: "" }));
        }
        showFormErrors(apiErrs);
      } else {
        showApiErrorToast(setToast, err, "Não foi possível salvar o simulado.");
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Question Modal ────────────────────────────────────────────────────────────

  const closeQuestionModal = () => {
    setQuestionModal(false);
    setQuestionModalStep(1);
    setQErrors({});
  };

  const openNewQuestion = (event?: any) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setEditQuestionId(null);
    setQForm({
      ...EMPTY_QUESTION,
      exam_type: form.exam_type || "",
      options: EMPTY_QUESTION.options.map((o) => ({ ...o })),
    });
    // Nova questão herda a disciplina do simulado (pode trocar na classificação).
    setQClass({ ...EMPTY_CLASSIFICATION_FORM, subject_id: form.subject_id ? Number(form.subject_id) : null });
    setQErrors({});
    setQuestionModalStep(1);
    setQuestionModal(true);
  };

  const openEditQuestion = (q: ExamQuestion) => {
    setEditQuestionId(q.id);
    setQClass({
      subject_id: q.subject?.id ?? null,
      topic_ids: [...(q.topic_ids ?? [])],
      difficulty_id: q.difficulty_id ?? null,
      board_id: q.board_id ?? null,
      year: q.year ?? null,
      exam_type_id: null,
      is_annulled: !!q.is_annulled,
      is_outdated: !!q.is_outdated,
      tags: [...(q.tags ?? [])],
    });
    setQForm({
      type: q.type,
      exam_type: form.exam_type || q.exam_type || "", // segue a modalidade do simulado
      question_text: q.question_text ?? "",
      subject_id: q.subject?.id ? String(q.subject.id) : "",
      points: String(q.points),
      order: String(q.order),
      image_url: q.image_url ?? "",
      video_url: q.video_url ?? "",
      explanation: q.explanation ?? "",
      options:
        q.type === "multiple_choice" && q.options.length > 0
          ? q.options.map((o) => ({
              option_text: o.option_text,
              is_correct: o.is_correct,
              order: o.order,
              triggers_text_input: o.triggers_text_input,
            }))
          : EMPTY_QUESTION.options.map((o) => ({ ...o })),
    });
    setQErrors({});
    setQuestionModalStep(1);
    setQuestionModal(true);
  };

  const goToQuestionStep2 = () => {
    const errs = validateQuestionEnunciado({ ...qForm, exam_type: form.exam_type || qForm.exam_type });
    setQErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setQuestionModalStep(2);
  };

  const questionStep2Label =
    qForm.type === "multiple_choice" ? "Alternativas" : "Gabarito";

  const setQField = (k: keyof ExamQuestionForm, v: any) =>
    setQForm((prev) => ({ ...prev, [k]: v }));

  const setOptionField = (idx: number, k: keyof ExamOptionForm, v: any) => {
    setQForm((prev) => {
      const opts = prev.options.map((o, i) => (i === idx ? { ...o, [k]: v } : o));
      return { ...prev, options: opts };
    });
  };

  const markCorrect = (idx: number) => {
    setQForm((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => ({ ...o, is_correct: i === idx })),
    }));
  };

  const markTriggerText = (idx: number) => {
    setQForm((prev) => {
      const already = prev.options[idx].triggers_text_input;
      return {
        ...prev,
        options: prev.options.map((o, i) => ({
          ...o,
          triggers_text_input: !already && i === idx,
        })),
      };
    });
  };

  const addOption = () => {
    setQForm((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { option_text: "", is_correct: false, order: prev.options.length + 1, triggers_text_input: false },
      ],
    }));
  };

  const removeOption = (idx: number) => {
    setQForm((prev) => ({
      ...prev,
      options: prev.options
        .filter((_, i) => i !== idx)
        .map((o, i) => ({ ...o, order: i + 1 })),
    }));
  };

  const saveQuestion = async () => {
    if (!effectiveExamId) return;
    const enunciadoErrs = validateQuestionEnunciado({ ...qForm, exam_type: form.exam_type || qForm.exam_type });
    const altErrs = validateQuestionAlternatives(qForm);
    const classErrs = validateClassification(qClass, questionCatalogs.taxonomy);
    const errs = { ...enunciadoErrs, ...altErrs, ...classErrs };
    setQErrors(errs);
    if (Object.keys(errs).length > 0) {
      setQuestionModalStep(Object.keys(enunciadoErrs).length > 0 ? 1 : 2);
      const first = Object.values(errs).find(Boolean);
      if (first) setToast({ visible: true, type: "error", message: first });
      return;
    }

    setSavingQuestion(true);
    try {
      const payload: Record<string, any> = {
        type: qForm.type,
        exam_type: form.exam_type || qForm.exam_type, // modalidade do simulado
        question_text: qForm.question_text.trim() || null,
        // Classificação completa (a API valida tenant e coerência disciplina/assuntos).
        subject_id: qClass.subject_id,
        topic_ids: qClass.topic_ids,
        difficulty_id: qClass.difficulty_id,
        board_id: qClass.board_id,
        year: qClass.year,
        is_annulled: qClass.is_annulled,
        is_outdated: qClass.is_outdated,
        tags: qClass.tags,
        points: qForm.points ? Number(qForm.points) : 1.0,
        order: qForm.order ? Number(qForm.order) : undefined,
        image_url: qForm.image_url.trim() || null,
        video_url: qForm.video_url.trim() || null,
        explanation: qForm.explanation.trim() || null,
      };
      if (qForm.type === "multiple_choice") {
        payload.options = qForm.options
          .filter((o) => plainRichText(o.option_text).trim())
          .map((o, i) => ({
            option_text: o.option_text.trim(),
            is_correct: o.is_correct,
            order: i + 1,
            triggers_text_input: o.triggers_text_input,
          }));
      }

      if (editQuestionId) {
        const { data } = await api.put(`/exams/${effectiveExamId}/questions/${editQuestionId}`, payload);
        showApiToast(setToast, data, "Questão atualizada com sucesso.");
      } else {
        const { data } = await api.post(`/exams/${effectiveExamId}/questions`, payload);
        showApiToast(setToast, data, "Questão adicionada com sucesso.");
      }
      closeQuestionModal();
      fetchQuestions();
    } catch (err: unknown) {
      const apiErrs = getApiValidationErrors(err);
      if (Object.keys(apiErrs).length > 0) setQErrors(apiErrs);
      showApiErrorToast(setToast, err, "Não foi possível salvar a questão.");
    } finally {
      setSavingQuestion(false);
    }
  };

  const uploadQuestionImage = async (file: File) => {
    if (!effectiveExamId) return;

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setQErrors((prev) => ({
        ...prev,
        image_url: "A imagem deve ter no máximo 5MB.",
      }));
      return;
    }

    setUploadingQuestionImage(true);
    try {
      const optimized = await prepareImageForUpload(file, 5000);
      const formData = new FormData();
      formData.append("image", optimized as File);

      const { data } = await api.post(
        `/exams/${effectiveExamId}/questions/upload-image`,
        formData
      );

      const imageUrl = data?.image_url;
      if (!imageUrl) throw new Error("Resposta sem image_url.");

      setQField("image_url", imageUrl);
      setQErrors((prev) => {
        const next = { ...prev };
        delete next.image_url;
        delete next.enunciado;
        return next;
      });
      showApiToast(setToast, data, "Imagem do enunciado enviada com sucesso.");
    } catch (err: unknown) {
      const apiErrs = getApiValidationErrors(err);
      if (Object.keys(apiErrs).length > 0) {
        setQErrors((prev) => ({ ...prev, ...apiErrs }));
      }
      showApiErrorToast(setToast, err, "Não foi possível enviar a imagem da questão.");
    } finally {
      setUploadingQuestionImage(false);
    }
  };

  const deleteQuestion = async () => {
    if (!deleteQuestionId || !effectiveExamId) return;
    setDeletingQuestion(true);
    try {
      await api.delete(`/exams/${effectiveExamId}/questions/${deleteQuestionId}`);
      setDeleteQuestionId(null);
      fetchQuestions();
    } catch {}
    setDeletingQuestion(false);
  };

  const setSupportMaterialField = (key: keyof ExamSupportMaterialForm, value: string) => {
    setSupportMaterialForm((prev) => ({ ...prev, [key]: value }));
  };

  const openNewSupportMaterial = () => {
    setEditSupportMaterialId(null);
    setSupportMaterialForm(EMPTY_SUPPORT_MATERIAL);
    setSupportMaterialErrors({});
    setSupportMaterialFile(null);
    setUploadingSupportMaterialFile(false);
    setSupportMaterialModal(true);
  };

  const openEditSupportMaterial = (material: ExamSupportMaterial) => {
    setEditSupportMaterialId(material.id);
    setSupportMaterialForm({
      title: material.title ?? "",
      description: material.description ?? "",
      type: material.type,
      content: material.content ?? "",
    });
    setSupportMaterialErrors({});
    setSupportMaterialFile(null);
    setUploadingSupportMaterialFile(false);
    setSupportMaterialModal(true);
  };

  const saveSupportMaterial = async () => {
    if (!effectiveExamId) return;

    const errs: Record<string, string> = {};
    if (!supportMaterialForm.title.trim()) errs.title = "Título é obrigatório.";

    if (supportMaterialForm.type === "link") {
      if (!supportMaterialForm.content.trim()) {
        errs.content = "URL é obrigatória para material do tipo link.";
      } else if (!/^https?:\/\//i.test(supportMaterialForm.content.trim())) {
        errs.content = "Informe uma URL válida começando com http:// ou https://";
      }
    } else if (!editSupportMaterialId && !supportMaterialFile) {
      errs.file = "Selecione um arquivo para enviar.";
    }

    setSupportMaterialErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingSupportMaterial(true);
    try {
      if (supportMaterialForm.type === "file" && !editSupportMaterialId) {
        setUploadingSupportMaterialFile(true);
        const formData = new FormData();
        formData.append("title", supportMaterialForm.title.trim());
        if (supportMaterialForm.description.trim()) {
          formData.append("description", supportMaterialForm.description.trim());
        }
        formData.append("file", supportMaterialFile as File);
        const { data } = await api.post(
          `/exams/${effectiveExamId}/support-materials/upload`,
          formData
        );
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Material de apoio enviado com sucesso.",
        });
      } else {
        const payload: Record<string, any> = {
          title: supportMaterialForm.title.trim(),
          description: supportMaterialForm.description.trim() || null,
        };

        if (supportMaterialForm.type === "link") {
          payload.type = "link";
          payload.content = supportMaterialForm.content.trim();
        } else if (!editSupportMaterialId) {
          payload.type = "file";
        }

        if (editSupportMaterialId) {
          const { data } = await api.put(
            `/exams/${effectiveExamId}/support-materials/${editSupportMaterialId}`,
            payload
          );
          showApiToast(setToast, data, "Material de apoio atualizado com sucesso.");
        } else {
          const { data } = await api.post(`/exams/${effectiveExamId}/support-materials`, payload);
          showApiToast(setToast, data, "Material de apoio criado com sucesso.");
        }
      }

      setSupportMaterialModal(false);
      setSupportMaterialForm(EMPTY_SUPPORT_MATERIAL);
      setSupportMaterialFile(null);
      fetchSupportMaterials();
    } catch (err: unknown) {
      const apiErrs = getApiValidationErrors(err);
      if (Object.keys(apiErrs).length > 0) setSupportMaterialErrors(apiErrs);
      showApiErrorToast(setToast, err, "Não foi possível salvar o material de apoio.");
    } finally {
      setSavingSupportMaterial(false);
      setUploadingSupportMaterialFile(false);
    }
  };

  const deleteSupportMaterial = async () => {
    if (!effectiveExamId || !deleteSupportMaterialId) return;
    setDeletingSupportMaterial(true);
    try {
      const { data } = await api.delete(
        `/exams/${effectiveExamId}/support-materials/${deleteSupportMaterialId}`
      );
      setToast({
        visible: true,
        type: "success",
        message: data?.message || "Material removido com sucesso.",
      });
      setDeleteSupportMaterialId(null);
      fetchSupportMaterials();
    } catch (err: any) {
      setToast({
        visible: true,
        type: "error",
        message: err?.response?.data?.message || "Não foi possível remover o material.",
      });
    } finally {
      setDeletingSupportMaterial(false);
    }
  };

  const prevExamIdRef = useRef<number | null>(examId);
  useEffect(() => {
    if (
      examId != null &&
      prevExamIdRef.current != null &&
      examId !== prevExamIdRef.current
    ) {
      setActiveStep(1);
    }
    prevExamIdRef.current = examId;
  }, [examId]);

  useEffect(() => {
    if (canManageContent) fetchSupportMaterials();
  }, [canManageContent, fetchSupportMaterials]);

  const goToList = () => navigate("simulados", listQuery ? { query: listQuery } : undefined);

  const runExamAction = async () => {
    if (!confirmAction || !effectiveExamId) return;
    setActing(true);
    try {
      if (confirmAction === "duplicate") {
        const { data } = await api.post(`/exams/${effectiveExamId}/duplicate`);
        const newId = resolveExamId(data);
        showApiToast(setToast, data, "Simulado duplicado como rascunho.");
        setConfirmAction(null);
        if (newId) {
          navigate("simulados-form", { examId: newId, ...(listQuery ? { query: listQuery } : {}) });
        }
      } else {
        const { data } = await api.post(`/exams/${effectiveExamId}/reset-deliveries`);
        showApiToast(setToast, data, "Entregas redefinidas.");
        setConfirmAction(null);
      }
    } catch (error) {
      showApiErrorToast(
        setToast,
        error,
        confirmAction === "duplicate" ? "Não foi possível duplicar o simulado." : "Não foi possível redefinir as entregas."
      );
    } finally {
      setActing(false);
    }
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePostCreateContinue = () => {
    setPostCreatePrompt(false);
    setActiveStep(2);
    fetchQuestions();
    scrollToTop();
  };

  const handlePostCreateLater = () => {
    setPostCreatePrompt(false);
    goToList();
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="var(--ds-brand)" />
      </View>
    );
  }

  const inputStyle = {
    border: "1px solid #D9DDE3",
    borderRadius: 4,
    padding: "10px 14px",
    fontSize: 14,
    color: "var(--ds-ink)",
    backgroundColor: "var(--ds-surface-sunken)",
    width: "100%",
    resize: "vertical" as const,
    minHeight: 80,
    fontFamily: "inherit",
  };

  const totalPoints = questions.reduce((acc, q) => acc + q.points, 0);

  const formatFileSize = (sizeInBytes: number | null) => {
    if (!sizeInBytes || sizeInBytes <= 0) return "-";
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const topicNames = Array.from(new Set(questions.flatMap((q) => (q.topics ?? []).map((t) => t.name))));
  const subjectTally = new Map<string, number>();
  for (const question of questions) {
    const name = question.subject?.name;
    if (name) subjectTally.set(name, (subjectTally.get(name) ?? 0) + 1);
  }
  const suggestedSubject = [...subjectTally.entries()].sort((a, b) => b[1] - a[1])[0];
  const choiceQuestions = questions.filter((q) => q.type === "multiple_choice");
  const keyedQuestions = choiceQuestions.filter((q) => q.options.some((o) => o.is_correct));
  const questionsReady = questions.length > 0 && keyedQuestions.length === choiceQuestions.length;
  const windowHours = examWindowLabel(form.starts_at, form.ends_at);
  const datesOk =
    !errors.starts_at &&
    !errors.ends_at &&
    ((!form.starts_at.trim() && !form.ends_at.trim()) || windowHours != null);
  const passingNumber = Number(form.passing_score);
  const passingHint =
    questions.length > 0 && form.passing_score.trim() && !Number.isNaN(passingNumber)
      ? `Com ${questions.length} questões: acertar ${Math.ceil((questions.length * passingNumber) / 100)} ou mais`
      : null;
  const statusLabel = examStatuses.find((s) => s.slug === form.status)?.label ?? (form.status || "Rascunho");
  const coursesMatchSaved =
    [...form.course_ids].sort((a, b) => a - b).join(",") ===
    [...savedForm.course_ids].sort((a, b) => a - b).join(",");
  const eligibleNow = coursesMatchSaved ? progress?.eligible : null;
  const dirty = formSnapshot(form) !== formSnapshot(savedForm);
  const durationLabel = form.duration_minutes.trim() ? `${form.duration_minutes} minutos` : "Sem limite";
  const attemptsLabel = form.allow_retake !== "true" ? "1" : form.max_attempts.trim() || "Sem limite";
  const resultLabel = form.release_results_after_end === "true" ? "Depois do encerramento" : "Logo após enviar";
  const resultHint =
    form.release_results_after_end === "true"
      ? "Nota e gabarito aparecem só depois do encerramento."
      : "Nota e gabarito aparecem assim que o aluno envia.";
  const allCoursesSelected = courseOptions.length > 0 && courseOptions.every((course) => form.course_ids.includes(course.id));
  const approvalLabel = form.passing_score.trim()
    ? `${form.passing_score}%${questions.length ? ` (${Math.ceil((questions.length * (Number(form.passing_score) || 0)) / 100)} de ${questions.length})` : ""}`
    : "Sem nota mínima";
  const visibleTopics = topicNames.slice(0, 2);
  const hiddenTopicCount = Math.max(0, topicNames.length - visibleTopics.length);

  const stepItems = canManageContent
    ? [
        { id: 1 as const, title: "Dados gerais", description: "configuração e prazos", done: Boolean(form.title.trim() && form.exam_type) },
        { id: 2 as const, title: "Questões", description: `${questions.length} ${questions.length === 1 ? "questão" : "questões"} · ${topicNames.length} ${topicNames.length === 1 ? "assunto" : "assuntos"}`, done: questions.length > 0 },
        { id: 3 as const, title: "Materiais", description: `${supportMaterials.length} ${supportMaterials.length === 1 ? "arquivo de apoio" : "arquivos de apoio"}`, done: supportMaterials.length > 0 },
        { id: 4 as const, title: "Testar", description: "responder como aluno", done: false },
      ]
    : [];

  const saveAndGoQuestions = async () => {
    const ok = await saveExam();
    if (!ok) return;
    setActiveStep(2);
    fetchQuestions();
    scrollToTop();
  };

  const discardChanges = () => {
    setForm({ ...savedForm, course_ids: [...savedForm.course_ids] });
    setErrors({});
  };

  const bumpAttempts = (delta: number) => {
    const current = Number(form.max_attempts) || (delta > 0 ? 0 : 1);
    const next = Math.max(1, current + delta);
    setField("max_attempts", String(next));
  };

  return (
    <View className="flex-1">
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-xs text-ink-subtle mb-1">
        <Text className="text-ink-muted" onPress={goToList}>Simulados</Text>
        {" / "}
        {canManageContent ? "Editar" : "Novo"}
      </Text>
      <View className="flex-row items-start flex-wrap gap-3 mb-4">
        <View className="flex-row items-start gap-3" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 360 }}>
          <TouchableOpacity
            onPress={goToList}
            accessibilityLabel="Voltar para simulados"
            className="items-center justify-center rounded-ds-md border border-border-strong bg-surface"
            style={{ width: 34, height: 34 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={16} color="var(--ds-ink)" />
          </TouchableOpacity>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 240 }}>
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-[22px] leading-7 font-semibold text-ink" style={{ letterSpacing: -0.2 }}>
                {form.title.trim() || (canManageContent ? "Editar simulado" : "Novo simulado")}
              </Text>
              {canManageContent ? <Badge label={statusLabel} slug={form.status} dot /> : null}
            </View>
            <Text className="text-[13px] text-ink-muted mt-0.5">
              {canManageContent
                ? [
                    `Visível para ${form.course_ids.length} ${form.course_ids.length === 1 ? "curso" : "cursos"}`,
                    eligibleNow != null ? `${eligibleNow} ${eligibleNow === 1 ? "aluno" : "alunos"}` : null,
                    form.starts_at.trim() && form.ends_at.trim() ? `aberto de ${form.starts_at} a ${form.ends_at}` : null,
                  ].filter(Boolean).join(" · ")
                : "Informe o título e, se quiser, os demais dados do formulário"}
            </Text>
          </View>
        </View>
        {canManageContent ? (
          <View className="flex-row items-center gap-2 flex-wrap" style={{ marginLeft: "auto", maxWidth: "100%" }}>
            <TouchableOpacity
              onPress={() => setErrorsReportOpen(true)}
              className="px-3 rounded-ds-md min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-[13px] font-medium text-ink-muted">Questões com mais erros</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setActiveStep(4); scrollToTop(); }}
              className="px-3.5 rounded-ds-md border border-border-strong bg-surface min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-[13px] font-medium text-ink">Ver como aluno</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmAction("duplicate")}
              disabled={acting}
              className="px-3.5 rounded-ds-md border border-border-strong bg-surface min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-[13px] font-medium text-ink">Duplicar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmAction("reset")}
              disabled={acting}
              className="px-3 rounded-ds-md min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-[13px] font-medium text-ink-muted">Redefinir entregas</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {canManageContent ? (
        <View className="flex-row flex-wrap bg-surface border border-border rounded-ds-md overflow-hidden mb-3">
          {stepItems.map((step, index) => {
            const active = activeStep === step.id;
            return (
              <TouchableOpacity
                key={step.id}
                onPress={() => setActiveStep(step.id)}
                className={`flex-row items-center gap-2.5 px-3.5 py-2.5 ${active ? "bg-brand-tint" : "bg-surface"}`}
                style={{
                  width: stacked ? "50%" : "25%",
                  borderLeftWidth: !stacked && index > 0 ? 1 : stacked && index % 2 === 1 ? 1 : 0,
                  borderLeftColor: "var(--ds-border)",
                  borderTopWidth: stacked && index > 1 ? 1 : 0,
                  borderTopColor: "var(--ds-border)",
                  borderBottomWidth: active ? 2 : 0,
                  borderBottomColor: "var(--ds-brand)",
                }}
                activeOpacity={0.85}
              >
                <View
                  className={`items-center justify-center rounded-full ${step.done ? "bg-success" : "bg-surface"}`}
                  style={{
                    width: 24,
                    height: 24,
                    borderWidth: step.done ? 0 : 2,
                    borderColor: active ? "var(--ds-brand)" : "var(--ds-border-strong)",
                  }}
                >
                  <Text className={`text-[11px] font-semibold ${step.done ? "text-white" : active ? "text-brand" : "text-ink-muted"}`}>
                    {step.done ? "✓" : step.id}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="text-[13px] font-semibold text-ink" numberOfLines={1}>{step.title}</Text>
                  <Text className="text-xs text-ink-subtle" numberOfLines={1}>{step.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {(activeStep === 1 || !canManageContent) && (
        <View>
          {progress && progress.delivered > 0 ? (
            <View className="flex-row items-start gap-2.5 rounded-ds-md border border-warning bg-warning-tint px-3.5 py-2.5 mb-3.5">
              <Text className="text-warning font-semibold">!</Text>
              <Text className="text-[13px] text-ink" style={{ flex: 1 }}>
                <Text className="font-semibold">Simulado em andamento: {progress.delivered} {progress.delivered === 1 ? "aluno já entregou" : "alunos já entregaram"}.</Text>
                {" "}Mudar datas, cursos ou retentativa vale para todos; respostas já enviadas não são alteradas.
              </Text>
            </View>
          ) : null}

          {Object.keys(errors).length > 0 ? (
            <View className="mb-3 rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
              {Object.entries(errors).map(([field, message]) => (
                <Text key={field} className="text-sm text-danger">{message}</Text>
              ))}
            </View>
          ) : null}

          <View className={stacked ? "gap-3.5" : "flex-row items-start gap-4"}>
            <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
              <View className="bg-surface border border-border rounded-ds-md">
                <View className="flex-row items-baseline gap-2.5 px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Identificação</Text>
                  <Text className="text-xs text-ink-subtle">como o simulado aparece na lista</Text>
                </View>
                <View className="p-4">
                  <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    <View style={{ width: stacked ? "100%" : "58%", minWidth: stacked ? undefined : 240 }}>
                      <FormInput dense required label="Título" value={form.title} onChangeText={(v) => setField("title", v)} placeholder="Ex.: Simulado ENEM – Matemática" error={errors.title} maxLength={255} />
                      <Text className="text-xs text-ink-subtle -mt-1 mb-2">{form.title.length}/255</Text>
                    </View>
                    <View style={{ width: stacked ? "100%" : "38%", minWidth: stacked ? undefined : 180, flexGrow: 1 }}>
                      <SearchableSelect dense required label="Modalidade" modalTitle="Selecionar modalidade" placeholder="Selecione a modalidade" showSelectedPreview={false} value={form.exam_type} options={examTypeOptions} onChange={(v) => setField("exam_type", v)} error={errors.exam_type} />
                    </View>
                    <View style={{ width: stacked ? "100%" : "58%", minWidth: stacked ? undefined : 240 }}>
                      <SearchableSelect dense label="Matéria" value={form.subject_id} options={subjectOptions} onChange={(v) => setField("subject_id", v)} placeholder="Selecione uma matéria" modalTitle="Selecionar matéria" />
                      {suggestedSubject ? (
                        <Text className="text-xs text-ink-subtle -mt-1 mb-2">
                          Sugerida pelas questões: {suggestedSubject[1]} de {questions.length} {suggestedSubject[1] === 1 ? "é" : "são"} de {suggestedSubject[0]}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ width: stacked ? "100%" : "38%", minWidth: stacked ? undefined : 180, flexGrow: 1 }}>
                      <Text className="text-[13px] font-medium text-ink mb-1.5">Assuntos</Text>
                      <View className="flex-row items-center gap-1.5 flex-wrap" style={{ minHeight: 34 }}>
                        {visibleTopics.map((name) => (
                          <View key={name} className="px-2 py-1 rounded-ds-sm bg-surface-sunken border border-border">
                            <Text className="text-xs font-medium text-ink-muted">{name}</Text>
                          </View>
                        ))}
                        {hiddenTopicCount > 0 ? (
                          <View className="px-2 py-1 rounded-ds-sm bg-surface-sunken border border-border">
                            <Text className="text-xs font-medium text-ink-muted">+{hiddenTopicCount}</Text>
                          </View>
                        ) : null}
                        {topicNames.length === 0 ? <Text className="text-xs text-ink-subtle">Aparecem na classificação das questões</Text> : null}
                        {canManageContent ? (
                          <TouchableOpacity onPress={() => { setReleaseMode("edit"); setReleaseOpen(true); }} activeOpacity={0.7}>
                            <Text className="text-xs text-brand">ver no banco</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ width: stacked ? "100%" : "40%", minWidth: stacked ? undefined : 200 }}>
                      <SearchableSelect dense required label="Status" modalTitle="Selecionar status" showSelectedPreview={false} value={form.status} options={examStatusOptions} onChange={(v) => setField("status", v)} error={errors.status} />
                    </View>
                    <View style={{ width: "100%" }}>
                      <Text className="text-[13px] font-medium text-ink mb-1.5">Descrição para o aluno</Text>
                      <textarea
                        value={form.description}
                        onChange={(e: any) => setField("description", e.target.value)}
                        placeholder="Ex.: Revisão de frações e porcentagem antes da prova."
                        style={{ ...inputStyle, minHeight: 64, backgroundColor: "var(--ds-surface)" }}
                        rows={2}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View className="bg-surface border border-border rounded-ds-md">
                <View className="flex-row items-center gap-2.5 px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Quem pode fazer</Text>
                  <Text className="text-xs text-ink-subtle" style={{ flex: 1 }}>
                    {form.course_ids.length} {form.course_ids.length === 1 ? "curso" : "cursos"}
                    {eligibleNow != null ? ` · ${eligibleNow} ${eligibleNow === 1 ? "aluno" : "alunos"}` : ""}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setForm((prev) => ({ ...prev, course_ids: allCoursesSelected ? [] : courseOptions.map((course) => course.id) }))}
                    disabled={courseOptions.length === 0}
                    activeOpacity={0.7}
                  >
                    <Text className="text-[13px] font-medium text-ink-muted">{allCoursesSelected ? "Limpar seleção" : "Selecionar todos"}</Text>
                  </TouchableOpacity>
                </View>
                <View className="p-4">
                  {courseOptions.length === 0 ? (
                    <Text className="text-sm text-ink-subtle">Nenhum curso disponível</Text>
                  ) : (
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      {courseOptions.map((course) => {
                        const selected = form.course_ids.includes(course.id);
                        return (
                          <TouchableOpacity
                            key={course.id}
                            onPress={() => toggleCourse(course.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            activeOpacity={0.8}
                            className={`flex-row items-center gap-2.5 px-3 py-2 rounded-ds-md border ${selected ? "bg-brand-tint border-brand" : "bg-surface border-border"}`}
                            style={{ width: stacked ? "100%" : "32%", minWidth: stacked ? undefined : 180, flexGrow: 1 }}
                          >
                            <Ionicons name={selected ? "checkbox" : "square-outline"} size={16} color={selected ? "var(--ds-brand)" : "var(--ds-ink-subtle)"} />
                            <Text className={`text-[13px] font-medium ${selected ? "text-brand" : "text-ink"}`} style={{ flex: 1 }} numberOfLines={1}>{course.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <Text className="text-xs text-ink-subtle mt-2.5">
                    Alunos matriculados em qualquer curso marcado veem o simulado. Desmarcar um curso esconde o simulado de quem ainda não começou.
                  </Text>
                </View>
              </View>

              <View className="bg-surface border border-border rounded-ds-md">
                <View className="flex-row items-baseline gap-2.5 px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Prazo e duração</Text>
                  <Text className="text-xs text-ink-subtle">horário de Brasília</Text>
                </View>
                <View className="p-4">
                  <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    <View style={{ width: stacked ? "100%" : "32%", minWidth: stacked ? undefined : 200, flexGrow: 1 }}>
                      <DateTimePickerInput label="Abre em" value={form.starts_at} onChangeText={(v) => setField("starts_at", v)} error={errors.starts_at} />
                    </View>
                    <View style={{ width: stacked ? "100%" : "32%", minWidth: stacked ? undefined : 200, flexGrow: 1 }}>
                      <DateTimePickerInput label="Encerra em" value={form.ends_at} onChangeText={(v) => setField("ends_at", v)} error={errors.ends_at} />
                    </View>
                    <View style={{ width: stacked ? "100%" : "30%", minWidth: stacked ? undefined : 160, flexGrow: 1 }}>
                      <Text className="text-[13px] font-medium text-ink mb-1.5">Janela</Text>
                      <View className="justify-center" style={{ minHeight: 38 }}>
                        <Text className="text-[13px] text-ink-subtle">
                          {windowHours ? <>Aberto por <Text className="font-mono font-medium text-ink-muted">{windowHours}</Text></> : "Informe abertura e encerramento"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text className="text-[13px] font-medium text-ink mb-1.5">Tempo para responder</Text>
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {DURATION_CHIPS.map((chip) => {
                        const pressed = form.duration_minutes.trim() === chip.value;
                        return (
                          <TouchableOpacity
                            key={chip.label}
                            onPress={() => setField("duration_minutes", chip.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: pressed }}
                            className={`px-2.5 rounded-full border min-h-[28px] justify-center ${pressed ? "bg-brand-tint border-brand" : "bg-surface border-border-strong"}`}
                            activeOpacity={0.85}
                          >
                            <Text className={`text-xs font-medium ${pressed ? "text-brand" : "text-ink-muted"}`}>{chip.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={{ width: 130 }}>
                      <FormInput dense label="Minutos" value={form.duration_minutes} onChangeText={(v) => setField("duration_minutes", v)} valueFormat="integer" maxDigits={4} placeholder="90" error={errors.duration_minutes} />
                    </View>
                  </View>
                  <Text className="text-xs text-ink-subtle">
                    {form.duration_minutes.trim()
                      ? `O aluno tem ${form.duration_minutes} minutos depois de começar; se o prazo acabar antes, o envio é automático no encerramento.`
                      : "Sem limite de tempo: o envio acontece quando o aluno termina ou quando o prazo acaba."}
                  </Text>
                </View>
              </View>

              <View className="bg-surface border border-border rounded-ds-md">
                <View className="px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Correção e resultado</Text>
                </View>
                <View className="p-4 gap-3">
                  <View className={stacked ? "gap-3" : "flex-row gap-4"}>
                    <View style={{ width: stacked ? "100%" : 220 }}>
                      <FormInput dense label="Nota mínima para aprovação" value={form.passing_score} onChangeText={(v) => setField("passing_score", v)} valueFormat="decimal" decimalPlaces={2} placeholder="50" error={errors.passing_score} />
                      {passingHint ? <Text className="text-xs text-ink-subtle -mt-1">{passingHint}</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: stacked ? undefined : 280 }}>
                      <Text className="text-[13px] font-medium text-ink mb-1.5">Quando o aluno vê o resultado</Text>
                      <View className="flex-row border border-border-strong rounded-ds-md overflow-hidden">
                        {[
                          { value: "false", label: "Logo após enviar" },
                          { value: "true", label: "Depois do encerramento" },
                        ].map((option, index) => {
                          const selected = form.release_results_after_end === option.value;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              onPress={() => setField("release_results_after_end", option.value)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              className={`flex-1 px-2.5 py-2 items-center justify-center ${selected ? "bg-brand" : "bg-surface"}`}
                              style={{ borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: "var(--ds-border)", minHeight: 34 }}
                              activeOpacity={0.85}
                            >
                              <Text className={`text-[13px] font-medium text-center ${selected ? "text-on-brand" : "text-ink-muted"}`}>{option.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text className="text-xs text-ink-subtle mt-1">{resultHint}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-ds-md border border-border bg-surface-sunken">
                    <TouchableOpacity
                      onPress={() => setForm((prev) => ({
                        ...prev,
                        allow_retake: prev.allow_retake === "true" ? "false" : "true",
                        max_attempts: prev.allow_retake === "true" ? "" : prev.max_attempts,
                        min_score_to_retake: prev.allow_retake === "true" ? "" : prev.min_score_to_retake,
                      }))}
                      accessibilityRole="switch"
                      accessibilityLabel="Permitir nova tentativa"
                      accessibilityState={{ checked: form.allow_retake === "true" }}
                      className={`rounded-full ${form.allow_retake === "true" ? "bg-brand" : "bg-border-strong"}`}
                      style={{ width: 36, height: 20, padding: 3 }}
                      activeOpacity={0.85}
                    >
                      <View className="bg-white rounded-full" style={{ width: 14, height: 14, marginLeft: form.allow_retake === "true" ? 16 : 0 }} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text className="text-[13px] font-medium text-ink">Permitir nova tentativa</Text>
                      <Text className="text-xs text-ink-subtle">
                        {form.allow_retake === "true"
                          ? "Ligado: o aluno pode refazer dentro das regras abaixo."
                          : "Desligado: depois de enviar, o aluno não pode refazer."}
                      </Text>
                    </View>
                  </View>

                  {form.allow_retake === "true" ? (
                    <View className={stacked ? "gap-3" : "flex-row gap-4"}>
                      <View style={{ width: stacked ? "100%" : 220 }}>
                        <Text className="text-[13px] font-medium text-ink mb-1.5">Máximo de tentativas</Text>
                        <View className="flex-row border border-border-strong rounded-ds-md overflow-hidden" style={{ height: 38 }}>
                          <TouchableOpacity onPress={() => bumpAttempts(-1)} accessibilityLabel="Menos uma" className="w-9 items-center justify-center bg-surface-sunken" activeOpacity={0.8}>
                            <Text className="text-base text-ink-muted">−</Text>
                          </TouchableOpacity>
                          <TextInput
                            value={form.max_attempts}
                            onChangeText={(v) => setField("max_attempts", v.replace(/\D/g, "").slice(0, 3))}
                            keyboardType="number-pad"
                            placeholder="∞"
                            accessibilityLabel="Máximo de tentativas"
                            className="flex-1 text-center font-mono text-sm text-ink bg-surface"
                            placeholderTextColor="var(--ds-ink-subtle)"
                            style={{ borderLeftWidth: 1, borderRightWidth: 1, borderColor: "var(--ds-border)" }}
                          />
                          <TouchableOpacity onPress={() => bumpAttempts(1)} accessibilityLabel="Mais uma" className="w-9 items-center justify-center bg-surface-sunken" activeOpacity={0.8}>
                            <Text className="text-base text-ink-muted">+</Text>
                          </TouchableOpacity>
                        </View>
                        {errors.max_attempts ? <Text className="text-xs text-danger mt-1">{errors.max_attempts}</Text> : <Text className="text-xs text-ink-subtle mt-1">Vazio = sem máximo</Text>}
                      </View>
                      <View style={{ flex: 1, minWidth: stacked ? undefined : 220 }}>
                        <FormInput dense label="Só pode refazer quem tirou menos de" value={form.min_score_to_retake} onChangeText={(v) => setField("min_score_to_retake", v)} valueFormat="decimal" decimalPlaces={2} placeholder={form.passing_score || "50"} error={errors.min_score_to_retake} />
                        <Text className="text-xs text-ink-subtle -mt-1">Vazio = usa a nota mínima{form.passing_score.trim() ? ` (${form.passing_score}%)` : ""}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={{ width: stacked ? "100%" : 330, gap: 14 }}>
              <View className="bg-surface border border-border rounded-ds-md p-4">
                <Text className="text-[11px] font-semibold text-ink-subtle" style={{ letterSpacing: 0.8 }}>COMO O ALUNO VÊ</Text>
                <Text className="text-base font-semibold text-ink mt-1.5">{form.title.trim() || "Título do simulado"}</Text>
                <View className="mt-1 self-start">
                  <Badge label={form.status === "published" ? "Disponível" : statusLabel} slug={form.status === "published" ? "published" : form.status} dot />
                </View>
                <View className="mt-3 gap-1.5">
                  {[
                    ["Prazo", shortPeriod(form.starts_at, form.ends_at)],
                    ["Tempo", durationLabel],
                    ["Questões", String(questions.length)],
                    ["Aprovação", approvalLabel],
                    ["Resultado", resultLabel],
                    ["Tentativas", attemptsLabel],
                  ].map(([label, value]) => (
                    <View key={label} className="flex-row items-start justify-between gap-3">
                      <Text className="text-[13px] text-ink-subtle">{label}</Text>
                      <Text className="text-[13px] font-medium text-ink text-right" style={{ flex: 1 }}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="bg-surface border border-border rounded-ds-md">
                <View className="px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Antes de salvar</Text>
                </View>
                <View className="px-4 py-3 gap-2">
                  {[
                    { ok: Boolean(form.title.trim()), label: "Título preenchido" },
                    { ok: form.course_ids.length > 0, label: form.course_ids.length > 0 ? `${form.course_ids.length} ${form.course_ids.length === 1 ? "curso" : "cursos"} com acesso` : "Nenhum curso com acesso" },
                    { ok: datesOk, label: "Datas válidas" },
                    { ok: !canManageContent || questionsReady, label: canManageContent ? `${keyedQuestions.length} ${keyedQuestions.length === 1 ? "questão com gabarito" : "questões com gabarito"}` : "Questões depois de criar", extra: canManageContent },
                    { ok: true, label: "Gabarito protegido" },
                  ].map((item) => (
                    <View key={item.label} className="flex-row items-start gap-2">
                      <Text className={`font-mono text-[13px] font-semibold ${item.ok ? "text-success" : "text-warning"}`}>{item.ok ? "✓" : "!"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text className="text-[13px] text-ink">{item.label}</Text>
                        {item.extra ? (
                          <TouchableOpacity onPress={() => { setActiveStep(2); fetchQuestions(); scrollToTop(); }} activeOpacity={0.7}>
                            <Text className="text-xs text-brand">revisar questões</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View className="bg-surface border border-border rounded-ds-md">
                <View className="px-4 py-3 border-b border-border">
                  <Text className="text-[15px] font-semibold text-ink">Andamento</Text>
                </View>
                <View className="p-4">
                  {progress ? (
                    <>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[13px] text-ink-muted">Entregaram</Text>
                        <Text className="text-[13px] font-mono font-medium text-ink">{progress.delivered} de {progress.eligible}</Text>
                      </View>
                      <View className="mt-1.5 mb-2.5 rounded-ds-sm bg-surface-sunken border border-border overflow-hidden" style={{ height: 6 }}>
                        <View className="bg-brand h-full" style={{ width: `${progress.eligible > 0 ? Math.min(100, (progress.delivered / progress.eligible) * 100) : 0}%` }} />
                      </View>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[13px] text-ink-muted">Média até agora</Text>
                        <Text className="text-[13px] font-mono font-medium text-ink">{progress.average != null ? `${progress.average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</Text>
                      </View>
                      {!coursesMatchSaved ? <Text className="text-xs text-ink-subtle mt-2">Os números de alunos atualizam depois de salvar os cursos.</Text> : null}
                    </>
                  ) : (
                    <Text className="text-[13px] text-ink-subtle">O andamento aparece depois que o simulado existe.</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Seção de Questões – só exibe quando o simulado já existe */}
      {canManageContent && activeStep === 2 && (
        <View
          className="bg-surface rounded-ds-md overflow-hidden border border-border"
          style={{ }}
        >
          {/* Header da seção */}
          <View
            className={`px-6 py-4 border-b border-border gap-3 ${
              isMobile ? "flex-col" : "flex-row items-center justify-between"
            }`}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-base font-semibold text-ink">Questões</Text>
              <Text className="text-xs text-ink-subtle">
                {questions.length} {questions.length === 1 ? "questão" : "questões"} · {totalPoints.toFixed(1)} pontos no total
              </Text>
            </View>
            {questions.length > 0 && (
              <View className={isMobile ? "w-full" : "flex-row"} style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setAnswerKeyOpen(true)}
                  className={`flex-row items-center justify-center border border-border-strong bg-surface px-4 py-2.5 rounded-ds-md ${
                    isMobile ? "w-full" : ""
                  }`}
                  activeOpacity={0.85}
                >
                  <Ionicons name="clipboard-outline" size={16} color="var(--ds-ink)" />
                  <Text className="text-ink text-sm font-medium ml-1">Importar gabarito</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openNewQuestion}
                  className={`flex-row items-center justify-center bg-brand px-4 py-2.5 rounded-ds-md ${
                    isMobile ? "w-full" : ""
                  }`}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="var(--ds-on-brand)" />
                  <Text className="text-on-brand text-sm font-medium ml-1">Nova questão</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Lista de questões */}
          {loadingQuestions ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="var(--ds-brand)" />
            </View>
          ) : questions.length === 0 ? (
            <View className="py-12 items-center gap-3 px-6">
              <Ionicons name="help-circle-outline" size={32} color="var(--ds-border-strong)" />
              <Text className="text-sm text-ink-subtle text-center">Nenhuma questão adicionada ainda</Text>
              <TouchableOpacity
                onPress={openNewQuestion}
                className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="var(--ds-on-brand)" />
                <Text className="text-sm font-medium text-on-brand ml-1">Nova questão</Text>
              </TouchableOpacity>
            </View>
          ) : (
            questions.map((q, i) => (
              <View
                key={q.id}
                className={`px-6 py-4 ${i < questions.length - 1 ? "border-b border-border" : ""}`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className="items-center justify-center rounded-ds-md"
                    style={{ width: 32, height: 32, backgroundColor: "var(--ds-brand-tint)", flexShrink: 0 }}
                  >
                    <Text className="text-xs font-semibold text-brand">{q.order}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-ink font-medium" numberOfLines={2}>
                      {plainRichText(q.question_text).trim() || (q.image_url ? "[Enunciado em imagem]" : "Questão sem texto")}
                    </Text>
                    <View className="flex-row gap-3 mt-1.5 flex-wrap">
                      <View className="flex-row items-center gap-1">
                        <Ionicons
                          name={
                            q.type === "essay"
                              ? "create-outline"
                              : q.options.some((o) => o.triggers_text_input)
                              ? "chatbox-outline"
                              : "radio-button-on-outline"
                          }
                          size={12}
                          color="var(--ds-ink-subtle)"
                        />
                        <Text className="text-xs text-ink-subtle">
                          {q.type === "essay"
                            ? "Discursiva"
                            : q.options.some((o) => o.triggers_text_input)
                            ? 'Objetiva c/ "Outro"'
                            : "Objetiva"}
                        </Text>
                      </View>
                      {q.subject ? (
                        <Text className="text-xs text-ink-subtle" numberOfLines={1}>
                          · {[q.subject.name, (q.topics ?? []).map((t) => t.name).join(", ")].filter(Boolean).join(" › ")}
                        </Text>
                      ) : (
                        <Text className="text-xs text-warning">· Sem classificação</Text>
                      )}
                      {q.difficulty && <Text className="text-xs text-ink-subtle">· {q.difficulty.name}</Text>}
                      <Text className="text-xs text-ink-subtle">· {q.points} pts</Text>
                      {q.type === "multiple_choice" && (
                        <Text className="text-xs text-ink-subtle">· {q.options.length} opções</Text>
                      )}
                    </View>
                  </View>
                  <View className="flex-row gap-1">
                    <TouchableOpacity
                      onPress={() => openEditQuestion(q)}
                      className="p-2 rounded-ds-md bg-brand-tint"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={14} color="var(--ds-brand)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteQuestionId(q.id)}
                      className="p-2 rounded-ds-md bg-danger"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="var(--ds-on-danger)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View
            className={`px-6 py-4 border-t border-border gap-3 ${
              isMobile ? "flex-col" : "flex-row flex-wrap justify-between"
            }`}
          >
            <TouchableOpacity
              onPress={() => setActiveStep(1)}
              className={`px-4 py-2.5 rounded-ds-md border border-border bg-surface items-center ${
                isMobile ? "w-full" : ""
              }`}
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Voltar para dados</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveStep(3)}
              className={`px-4 py-2 min-h-control-md justify-center rounded-ds-md border border-border-strong bg-surface items-center ${
                isMobile ? "w-full" : ""
              }`}
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Materiais de apoio</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openNewQuestion}
              className={`px-4 py-2.5 rounded-ds-md bg-brand flex-row items-center justify-center ${
                isMobile ? "w-full" : ""
              }`}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={16} color="var(--ds-on-brand)" />
              <Text className="text-sm font-medium text-on-brand ml-1">Nova questão</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canManageContent && activeStep === 3 && (
        <View
          className="bg-surface rounded-ds-md overflow-hidden mb-6 border border-border"
          style={{ }}
        >
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
            <View>
              <Text className="text-base font-semibold text-ink">Materiais de apoio</Text>
              <Text className="text-xs text-ink-subtle">
                Links e arquivos para auxiliar os alunos antes ou durante o simulado
              </Text>
            </View>
            <TouchableOpacity
              onPress={openNewSupportMaterial}
              className="flex-row items-center bg-brand px-4 rounded-ds-md py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={16} color="var(--ds-on-brand)" />
              <Text className="text-on-brand text-sm font-medium ml-1">Novo material</Text>
            </TouchableOpacity>
          </View>

          {loadingSupportMaterials ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="var(--ds-brand)" />
            </View>
          ) : supportMaterials.length === 0 ? (
            <View className="py-12 items-center gap-2">
              <Ionicons name="library-outline" size={30} color="var(--ds-border-strong)" />
              <Text className="text-sm text-ink-subtle">Nenhum material de apoio cadastrado.</Text>
              <TouchableOpacity onPress={openNewSupportMaterial} activeOpacity={0.7}>
                <Text className="text-sm text-brand font-semibold">Adicionar primeiro material</Text>
              </TouchableOpacity>
            </View>
          ) : (
            supportMaterials.map((material, idx) => (
              <View
                key={material.id}
                className={`px-6 py-4 ${idx < supportMaterials.length - 1 ? "border-b border-border" : ""}`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className={`w-9 h-9 rounded-ds-md items-center justify-center ${
                      material.type === "link" ? "bg-brand-tint" : "bg-success-tint"
                    }`}
                  >
                    <Ionicons
                      name={material.type === "link" ? "link-outline" : "document-attach-outline"}
                      size={17}
                      color={material.type === "link" ? "var(--ds-brand)" : "var(--ds-success)"}
                    />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-sm font-semibold text-ink">{material.title}</Text>
                      <Badge
                        label={material.type === "link" ? "Link" : "Arquivo"}
                        slug={material.type === "link" ? "active" : "published"}
                      />
                    </View>
                    {!!material.description && (
                      <Text className="text-xs text-ink-muted mb-1">{material.description}</Text>
                    )}
                    <Text className="text-xs text-brand" numberOfLines={1}>
                      {material.content}
                    </Text>
                    {material.type === "file" && (
                      <Text className="text-xs text-ink-subtle mt-1">
                        {material.file_type ? `Tipo: ${material.file_type.toUpperCase()} · ` : ""}
                        Tamanho: {formatFileSize(material.file_size)}
                      </Text>
                    )}
                  </View>
                  <View className="flex-row gap-1">
                    <TouchableOpacity
                      onPress={() => openEditSupportMaterial(material)}
                      className="p-2 rounded-ds-md bg-brand-tint"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={14} color="var(--ds-brand)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteSupportMaterialId(material.id)}
                      className="p-2 rounded-ds-md bg-danger"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="var(--ds-on-danger)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View className="px-6 py-4 border-t border-border flex-row justify-between">
            <TouchableOpacity
              onPress={() => setActiveStep(2)}
              className="px-4 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Voltar para questões</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveStep(4)}
              className="px-4 py-2 rounded-ds-md border border-border-strong bg-surface min-h-control-md"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Ir para teste</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openNewSupportMaterial}
              className="px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-medium text-on-brand">Novo material</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canManageContent && activeStep === 4 && (
        <View
          className="bg-surface rounded-ds-md overflow-hidden border border-border"
          style={{ }}
        >
          <View className="px-6 py-4 border-b border-border flex-row items-center justify-between">
            <View>
              <Text className="text-base font-semibold text-ink">Testar simulado</Text>
              <Text className="text-xs text-ink-subtle">
                Responda como o aluno e confira gabarito e comportamento
              </Text>
            </View>
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-ds-md bg-surface-sunken border border-border">
              <Ionicons name="eye-outline" size={16} color="var(--ds-ink-muted)" />
              <Text className="text-xs font-semibold text-ink-muted">
                {questions.length} questões · {totalPoints.toFixed(1)} pontos
              </Text>
            </View>
          </View>

          <View className="px-6 py-5">
            <ExamPreviewPlayer
              key={questions.map((q) => q.id).join("-") || "empty"}
              questions={questions.map(mapExamQuestionToPreview)}
              gradeObjective
              emptyMessage="Adicione questões na etapa anterior para testar o simulado."
              examMeta={{
                title: form.title || "Simulado",
                exam_type_label:
                  examTypeOptions.find((o) => o.value === form.exam_type)?.label ?? form.exam_type,
                exam_type: form.exam_type,
                status_label:
                  examStatuses.find((s) => s.slug === form.status)?.label ?? form.status,
                status: form.status,
                duration_minutes: form.duration_minutes
                  ? Number(form.duration_minutes)
                  : null,
                passing_score: form.passing_score ? Number(form.passing_score) : null,
                total_points: totalPoints,
                courses: form.course_ids
                  .map((id) => courseOptions.find((o) => o.id === id)?.name)
                  .filter(Boolean) as string[],
                subject: form.subject_id
                  ? subjectOptions.find((o) => o.value === form.subject_id)?.label ?? null
                  : null,
              }}
              header={
                <View className="mb-5 p-5 rounded-ds-md border border-border bg-brand-tint">
                  <Text className="text-lg font-semibold text-brand">
                    {form.title || "Título do simulado"}
                  </Text>
                  <Text className="text-sm text-brand mt-1">
                    {examTypeOptions.find((o) => o.value === form.exam_type)?.label ?? form.exam_type}
                    {form.subject_id
                      ? ` · ${subjectOptions.find((o) => o.value === form.subject_id)?.label ?? "Matéria"}`
                      : ""}
                  </Text>
                  <Text className="text-xs text-brand mt-2">
                    Duração: {form.duration_minutes || "--"} min · Nota mínima:{" "}
                    {form.passing_score || "--"}%
                  </Text>
                </View>
              }
            />
          </View>

          <View className="px-6 py-4 border-t border-border flex-row justify-between">
            <TouchableOpacity
              onPress={() => setActiveStep(3)}
              className="px-4 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Voltar para materiais</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goToList}
              className="px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-medium text-on-brand">Finalizar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal de Questão */}
      <Modal
        visible={questionModal}
        title={editQuestionId ? "Editar questão" : "Nova questão"}
        onClose={closeQuestionModal}
        size="xl"
        maxHeight="94%"
        showScrollIndicator
        footer={
          <>
            <TouchableOpacity
              onPress={questionModalStep === 1 ? closeQuestionModal : () => {
                setQuestionModalStep(1);
                setQErrors((prev) => {
                  const next = { ...prev };
                  delete next.options;
                  return next;
                });
              }}
              className="flex-1 border border-border py-2.5 rounded-ds-md items-center justify-center"
              style={{ minWidth: 0 }}
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-ink-muted">
                {questionModalStep === 1 ? "Cancelar" : "Voltar"}
              </Text>
            </TouchableOpacity>
            {questionModalStep === 1 ? (
              <TouchableOpacity
                onPress={goToQuestionStep2}
                className="flex-1 bg-brand py-2.5 rounded-ds-md items-center justify-center"
                style={{ minWidth: 0 }}
                activeOpacity={0.85}
              >
                <Text className="text-sm font-medium text-on-brand">
                  Próximo: {questionStep2Label}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={saveQuestion}
                disabled={savingQuestion}
                className="flex-1 bg-brand py-2.5 rounded-ds-md items-center justify-center"
                style={{ minWidth: 0 }}
                activeOpacity={0.85}
              >
                {savingQuestion ? (
                  <ActivityIndicator size="small" color="var(--ds-on-brand)" />
                ) : (
                  <Text className="text-sm font-medium text-on-brand">
                    {editQuestionId ? "Salvar alterações" : "Salvar questão"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        }
        headerContent={
          <View className="flex-row items-center gap-2 mt-3">
            {[
              { step: 1, label: "Enunciado" },
              { step: 2, label: questionStep2Label },
            ].map((item, index) => {
              const active = questionModalStep === item.step;
              const complete = questionModalStep > item.step;

              return (
                <React.Fragment key={item.step}>
                  {index > 0 ? <Ionicons name="chevron-forward" size={14} color="var(--ds-ink-subtle)" /> : null}
                  <View
                    className="flex-1 rounded-ds-md px-3 py-2.5"
                    style={{
                      backgroundColor: active ? "var(--ds-brand)" : complete ? "var(--ds-brand-tint)" : "var(--ds-surface-sunken)",
                      borderWidth: 1,
                      borderColor: active ? "var(--ds-brand)" : complete ? "var(--ds-border)" : "var(--ds-border)",
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: active ? "var(--ds-surface)" : complete ? "var(--ds-border)" : "var(--ds-surface-sunken)",
                        }}
                      >
                        <Text
                          className="text-[10px] font-semibold"
                          style={{ color: active ? "var(--ds-brand)" : complete ? "var(--ds-brand-hover)" : "var(--ds-ink-subtle)" }}
                        >
                          {item.step}
                        </Text>
                      </View>
                      <Text
                        className="text-[11px] font-semibold uppercase"
                        numberOfLines={1}
                        style={{ color: active ? "var(--ds-on-brand)" : complete ? "var(--ds-brand-hover)" : "var(--ds-ink-muted)" }}
                      >
                        {item.label}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        }
      >
        {questionModalStep === 1 ? (
          // Layout da questão avulsa: conteúdo à esquerda, configuração à direita.
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 20, alignItems: "flex-start" }}>
            <View style={{ flex: 3, width: isMobile ? "100%" : undefined, minWidth: 0 }}>
              <SegmentedControl<"multiple_choice" | "essay">
                label="Tipo"
                allowClear={false}
                options={[
                  { value: "multiple_choice", label: "Objetiva" },
                  { value: "essay", label: "Discursiva" },
                ]}
                value={qForm.type}
                onChange={(v) => v && setQField("type", v)}
              />

              <RichTextInput
                label="Enunciado"
                required
                value={qForm.question_text}
                onChange={(v) => {
                  setQField("question_text", v);
                  if (qErrors.enunciado) {
                    setQErrors((prev) => {
                      const next = { ...prev };
                      delete next.enunciado;
                      return next;
                    });
                  }
                }}
                error={qErrors.enunciado}
                minHeight={140}
                placeholder="Texto do enunciado (ou envie a imagem abaixo)."
              />

              {/* Imagem do enunciado */}
              <View className="mb-4">
                <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
                  Imagem do enunciado
                </Text>
                {qForm.image_url ? (
                  <View className="border border-border rounded-ds-md p-2" style={{ gap: 8 }}>
                    <Image
                      source={{ uri: qForm.image_url }}
                      accessibilityLabel="Imagem do enunciado"
                      style={{ width: "100%", height: isMobile ? 180 : 240 }}
                      resizeMode="contain"
                    />
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      <Button
                        size="sm"
                        icon={ImagePlus}
                        label="Trocar imagem"
                        onPress={() => questionImageInputRef.current?.click()}
                        loading={uploadingQuestionImage}
                        disabled={!effectiveExamId}
                      />
                      <Button size="sm" variant="danger" icon={Trash2} label="Remover imagem" onPress={() => setQField("image_url", "")} />
                    </View>
                  </View>
                ) : (
                  <View className="flex-row">
                    <Button
                      icon={ImagePlus}
                      label="Enviar imagem"
                      onPress={() => questionImageInputRef.current?.click()}
                      loading={uploadingQuestionImage}
                      disabled={!effectiveExamId}
                    />
                  </View>
                )}
                <Text className="text-xs text-ink-subtle" style={{ marginTop: 6 }}>
                  JPG, PNG, WEBP ou GIF, até 5MB.
                </Text>
                {qErrors.image_url ? (
                  <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>{qErrors.image_url}</Text>
                ) : null}
                <input
                  ref={questionImageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  aria-hidden
                  onChange={(e: any) => {
                    const file = e.target.files?.[0];
                    if (file) uploadQuestionImage(file);
                    e.target.value = "";
                  }}
                />
              </View>
            </View>

            <View
              className="bg-surface border border-border rounded-ds-md"
              style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 300, padding: 16 }}
            >
              <Text className="font-semibold text-ink" style={{ fontSize: 15, marginBottom: 12 }}>
                Configuração
              </Text>
              {/* Modalidade herdada do simulado: bloqueada (a API também força a do simulado). */}
              <SearchableSelect
                label="Modalidade"
                required
                disabled
                showSelectedPreview={false}
                placeholder="Defina em Dados gerais"
                value={form.exam_type}
                options={examTypeOptions}
                onChange={() => {}}
                error={qErrors.exam_type}
              />
              <Text className="text-xs text-ink-subtle" style={{ marginTop: 4, marginBottom: 12 }}>
                Definida pela modalidade do simulado (Dados gerais).
              </Text>
              <View className="flex-row" style={{ gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <FormInput
                    label="Pontos"
                    value={qForm.points}
                    onChangeText={(v) => setQField("points", v)}
                    valueFormat="decimal"
                    decimalPlaces={2}
                    placeholder="1"
                    error={qErrors.points}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput
                    label="Ordem"
                    value={qForm.order}
                    onChangeText={(v) => setQField("order", v)}
                    valueFormat="integer"
                    maxDigits={4}
                    placeholder="1"
                    error={qErrors.order}
                  />
                </View>
              </View>
              <FormInput
                label="URL do vídeo (opcional)"
                value={qForm.video_url}
                onChangeText={(v) => setQField("video_url", v)}
                placeholder="https://..."
                keyboardType="url"
                error={qErrors.video_url}
              />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 20, alignItems: "flex-start" }}>
          <View className="gap-4" style={{ flex: 3, width: isMobile ? "100%" : undefined, minWidth: 0 }}>
            {qForm.type === "multiple_choice" ? (
              <View>
                <Text className="text-sm font-semibold text-ink mb-1">
                  Alternativas de resposta
                  <Text className="text-danger"> *</Text>
                </Text>
                <Text className="text-xs text-ink-subtle mb-3">
                  Marque a opção correta e preencha pelo menos duas alternativas.
                </Text>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-medium text-ink-muted">Opções</Text>
                  <TouchableOpacity
                    onPress={addOption}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-ds-md bg-surface-sunken"
                  >
                    <Ionicons name="add" size={14} color="var(--ds-ink)" />
                    <Text className="text-xs text-ink font-semibold">Opção</Text>
                  </TouchableOpacity>
                </View>

                {qErrors.options && (
                  <Text className="text-xs text-danger mb-2">{qErrors.options}</Text>
                )}

                {qForm.options.map((opt, idx) => (
                  <View
                    key={idx}
                    className={`mb-2.5 rounded-ds-md border px-3 py-2.5 ${
                      opt.is_correct
                        ? "border-success bg-success-tint"
                        : "border-border bg-surface"
                    }`}
                  >
                    {opt.is_correct && (
                      <View className="flex-row items-center gap-1.5 mb-2">
                        <Ionicons name="checkmark-circle" size={14} color="var(--ds-success)" />
                        <Text className="text-[11px] font-semibold text-success uppercase tracking-wide">
                          Resposta correta
                        </Text>
                      </View>
                    )}
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => markCorrect(idx)}
                        activeOpacity={0.7}
                        accessibilityLabel={
                          opt.is_correct ? "Alternativa correta" : "Marcar como correta"
                        }
                      >
                        <Ionicons
                          name={opt.is_correct ? "radio-button-on" : "radio-button-off"}
                          size={22}
                          color={opt.is_correct ? "var(--ds-success)" : "var(--ds-border-strong)"}
                        />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <View
                          className={`flex-row border rounded-ds-md px-3 ${
                            opt.is_correct ? "border-success bg-surface" : "border-border bg-surface-sunken"
                          }`}
                        >
                          <RichTextInput
                            compact
                            value={opt.option_text}
                            onChange={(v) => setOptionField(idx, "option_text", v)}
                            placeholder={`Opção ${idx + 1}`}
                            aria-label={`Texto da opção ${idx + 1}`}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => markTriggerText(idx)}
                        activeOpacity={0.7}
                        style={{ padding: 4 }}
                        accessibilityLabel='Alternativa "Outro"'
                      >
                        <Ionicons
                          name={opt.triggers_text_input ? "chatbox" : "chatbox-outline"}
                          size={17}
                          color={opt.triggers_text_input ? "var(--ds-warning)" : "var(--ds-border-strong)"}
                        />
                      </TouchableOpacity>
                      {qForm.options.length > 2 && (
                        <TouchableOpacity onPress={() => removeOption(idx)} activeOpacity={0.7}>
                          <Ionicons name="close-circle" size={18} color="var(--ds-ink-subtle)" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                <Text className="text-[11px] text-ink-subtle mt-1 mb-2">
                  Toque no círculo para marcar a correta · ícone de chat = &quot;Outro&quot;
                </Text>
              </View>
            ) : null}

            <View className="rounded-ds-md border border-border p-3 bg-surface-sunken">
              <Text className="text-sm font-semibold text-ink mb-1.5">
                Gabarito / explicação (opcional)
              </Text>
              <RichTextInput
                value={qForm.explanation}
                onChange={(v) => setQField("explanation", v)}
                placeholder="Texto exibido após a correção..."
                minHeight={72}
              />
            </View>
          </View>

            {/* Classificação ao lado das alternativas */}
            <View
              className="bg-surface border border-border rounded-ds-md"
              style={{ flex: 2, width: isMobile ? "100%" : undefined, minWidth: isMobile ? undefined : 320, padding: 16 }}
            >
              <Text className="font-semibold text-ink" style={{ fontSize: 15 }}>Classificação da questão</Text>
              <Text className="text-xs text-ink-subtle" style={{ marginTop: 2, marginBottom: 12 }}>
                Disciplina, assuntos, dificuldade, banca, ano e tags. Quanto mais detalhada, melhores os relatórios e a busca no banco.
              </Text>
              <ClassificationFields
                form={qClass}
                onChange={(next) => {
                  setQClass(next);
                  if (qErrors.subject_id || qErrors.topic_ids) {
                    setQErrors(({ subject_id, topic_ids, ...rest }) => rest);
                  }
                }}
                catalogs={questionCatalogs}
                hideExamType
                errors={qErrors}
              />
            </View>
          </View>
        )}
      </Modal>

      {/* Modal de Material de Apoio */}
      <Modal
        visible={supportMaterialModal}
        title={editSupportMaterialId ? "Editar material de apoio" : "Novo material de apoio"}
        onClose={() => {
          setSupportMaterialModal(false);
          setUploadingSupportMaterialFile(false);
        }}
        size="lg"
        footer={
          <View className="flex-row gap-3 px-6 py-4 border-t border-border">
            <TouchableOpacity
              onPress={() => {
                setSupportMaterialModal(false);
                setUploadingSupportMaterialFile(false);
              }}
              className="flex-1 border border-border py-2.5 rounded-ds-md items-center"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-ink-muted">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveSupportMaterial}
              disabled={savingSupportMaterial}
              className="flex-1 bg-brand py-2.5 rounded-ds-md items-center"
              activeOpacity={0.85}
            >
              {savingSupportMaterial ? (
                <ActivityIndicator size="small" color="var(--ds-on-brand)" />
              ) : (
                <Text className="text-sm font-medium text-on-brand">
                  {editSupportMaterialId ? "Salvar" : "Adicionar"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        <FormInput
          label="Título"
          required
          value={supportMaterialForm.title}
          onChangeText={(v) => setSupportMaterialField("title", v)}
          error={supportMaterialErrors.title}
          placeholder="Ex.: Lista de exercícios"
        />

        <View className="mb-4">
          <Text className="text-sm font-semibold text-ink mb-1.5">Descrição (opcional)</Text>
          <textarea
            value={supportMaterialForm.description}
            onChange={(e: any) => setSupportMaterialField("description", e.target.value)}
            placeholder="Observações sobre este material..."
            style={inputStyle}
            rows={2}
          />
        </View>

        <SearchableSelect
          label="Tipo"
          value={supportMaterialForm.type}
          options={supportMaterialTypeOptions}
          placeholder="Selecionar tipo..."
          modalTitle="Selecionar tipo de material"
          showSelectedPreview={false}
          onChange={(v) =>
            setSupportMaterialForm((prev) => ({
              ...prev,
              type: v as "link" | "file",
              content: v === "file" && !editSupportMaterialId ? "" : prev.content,
            }))
          }
        />

        {supportMaterialForm.type === "link" ? (
          <FormInput
            label="URL do material"
            required
            value={supportMaterialForm.content}
            onChangeText={(v) => setSupportMaterialField("content", v)}
            placeholder="https://..."
            keyboardType="url"
            error={supportMaterialErrors.content}
          />
        ) : (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-ink mb-1.5">
              Arquivo (PDF, imagem ou vídeo)
            </Text>
            {!editSupportMaterialId ? (
              <>
                <View className="flex-row items-center gap-3 flex-wrap">
                  <TouchableOpacity
                    onPress={() => supportMaterialFileInputRef.current?.click()}
                    disabled={uploadingSupportMaterialFile}
                    className="px-4 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
                    activeOpacity={0.85}
                  >
                    <Text className="text-sm font-medium text-on-brand">
                      {supportMaterialFile ? "Trocar arquivo" : "Selecionar arquivo"}
                    </Text>
                  </TouchableOpacity>
                  {supportMaterialFile ? (
                    <View className="px-3 py-2 rounded-ds-md border border-border bg-brand-tint min-w-[220px]">
                      <Text className="text-xs font-semibold text-brand" numberOfLines={1}>
                        {supportMaterialFile.name}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-ink-subtle">Nenhum arquivo selecionado</Text>
                  )}
                </View>
                <Text className="text-xs text-ink-subtle mt-2">
                  Tipos aceitos: PDF, JPG, PNG, WEBP, MP4, MOV, AVI, MKV. Máximo: 50 MB.
                </Text>
                <input
                  ref={supportMaterialFileInputRef}
                  type="file"
                  accept=".pdf,image/*,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
                  style={{ display: "none" }}
                  onChange={(e: any) => {
                    const file = e.target.files?.[0];
                    if (file) setSupportMaterialFile(file);
                    e.target.value = "";
                  }}
                />
                {supportMaterialErrors.file && (
                  <Text className="text-xs text-danger mt-1">{supportMaterialErrors.file}</Text>
                )}
              </>
            ) : (
              <View className="rounded-ds-md border border-border bg-surface-sunken px-4 py-3">
                <Text className="text-xs text-ink-muted">
                  Para alterar o arquivo, remova este material e crie um novo upload.
                </Text>
                <Text className="text-xs text-brand mt-1" numberOfLines={1}>
                  {supportMaterialForm.content}
                </Text>
              </View>
            )}
          </View>
        )}
      </Modal>

      <ConfirmModal
        visible={postCreatePrompt}
        title="Formulário criado"
        message="Deseja cadastrar questões e materiais de apoio (links/anexos) agora?"
        confirmLabel="Sim, cadastrar agora"
        cancelLabel="Depois"
        iconName="help-circle-outline"
        tone="primary"
        onConfirm={handlePostCreateContinue}
        onCancel={handlePostCreateLater}
      />

      {/* Confirm delete question */}
      <ConfirmModal
        visible={deleteQuestionId !== null}
        title="Remover questão"
        message="Tem certeza que deseja remover esta questão?"
        loading={deletingQuestion}
        onConfirm={deleteQuestion}
        onCancel={() => setDeleteQuestionId(null)}
      />

      <ConfirmModal
        visible={deleteSupportMaterialId !== null}
        title="Remover material de apoio"
        message="Tem certeza que deseja remover este material?"
        loading={deletingSupportMaterial}
        onConfirm={deleteSupportMaterial}
        onCancel={() => setDeleteSupportMaterialId(null)}
      />

      <ConfirmModal
        visible={confirmAction !== null}
        tone={confirmAction === "reset" ? "danger" : "primary"}
        title={confirmAction === "reset" ? "Redefinir entregas" : "Duplicar simulado"}
        message={
          confirmAction === "reset"
            ? "Apaga as entregas e as tentativas em andamento deste simulado. Os alunos poderão fazê-lo de novo, dentro do prazo já configurado. As notas saem dos relatórios."
            : "Cria um rascunho com os mesmos cursos, questões, alternativas e materiais. As entregas dos alunos ficam só neste simulado."
        }
        confirmLabel={confirmAction === "reset" ? "Redefinir" : "Duplicar"}
        loading={acting}
        onConfirm={() => void runExamAction()}
        onCancel={() => setConfirmAction(null)}
      />

    </ScrollView>

    {(activeStep === 1 || !canManageContent) && (
      <View className="flex-row items-center gap-2 border-t border-border bg-surface px-6 py-2.5 flex-wrap">
        <View className="flex-row items-center gap-2">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dirty ? "var(--ds-accent)" : "var(--ds-success)" }} />
          <Text className="text-[13px] text-ink-muted">{dirty ? "Alterações não salvas" : "Tudo salvo"}</Text>
        </View>
        <View className="flex-row items-center gap-2 flex-wrap" style={{ marginLeft: "auto" }}>
          <TouchableOpacity onPress={discardChanges} disabled={!dirty || saving} className="px-3 min-h-control-md justify-center" activeOpacity={0.7}>
            <Text className={`text-[13px] font-medium ${dirty ? "text-ink-muted" : "text-ink-subtle"}`}>Descartar alterações</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void saveExam()}
            disabled={saving}
            className="px-3.5 rounded-ds-md border border-border-strong bg-surface min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator size="small" color="var(--ds-brand)" /> : <Text className="text-[13px] font-medium text-ink">Salvar</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void (canManageContent ? saveAndGoQuestions() : saveExam())}
            disabled={saving}
            className="px-3.5 rounded-ds-md bg-brand min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            <Text className="text-[13px] font-medium text-on-brand">
              {canManageContent ? "Salvar e ir para questões →" : "Criar formulário"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )}

      {effectiveExamId != null && (
        <ExamAnswerKeyDialog
          visible={answerKeyOpen}
          examId={effectiveExamId}
          questions={questions.map((question) => ({
            id: question.id,
            type: question.type,
            order: question.order,
            subjectName: question.subject?.name ?? null,
            options: question.options.map((option) => ({ is_correct: option.is_correct, order: option.order })),
          }))}
          onClose={() => setAnswerKeyOpen(false)}
          onApplied={() => { void fetchQuestions(); }}
          setToast={setToast}
        />
      )}

      <ExamQuestionErrorsReportModal
        visible={errorsReportOpen}
        examId={effectiveExamId}
        examTitle={form.title}
        onClose={() => setErrorsReportOpen(false)}
        setToast={setToast}
      />

      <ExamBankReleaseModal
        visible={releaseOpen}
        examId={effectiveExamId}
        mode={releaseMode}
        onClose={() => setReleaseOpen(false)}
        onSaved={(message) => setToast({ visible: true, type: "success", message })}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </View>
  );
}
