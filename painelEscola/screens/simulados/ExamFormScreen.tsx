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
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import FormSelect, { type SelectOption } from "../../components/ui/FormSelect";
import SearchableSelect, { SearchableOption } from "../../components/ui/SearchableSelect";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
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
import type {
  ExamForm,
  ExamFormScreenProps,
  ExamOptionForm,
  ExamQuestion,
  ExamQuestionForm,
  ExamSupportMaterial,
  ExamSupportMaterialForm,
} from "../../types/simulados";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_EXAM: ExamForm = {
  title: "",
  exam_type: "custom",
  status: "draft",
  course_id: "",
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
  if (!form.question_text.trim() && !form.image_url.trim()) {
    errs.enunciado = "Informe o texto do enunciado, envie uma imagem, ou ambos.";
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
  const filled = form.options.filter((o) => o.option_text.trim());
  if (filled.length < 2) errs.options = "Informe pelo menos 2 opções.";
  const hasCorrect = form.options.some((o) => o.is_correct && o.option_text.trim());
  if (!hasCorrect) errs.options = "Marque pelo menos uma opção como correta.";
  return errs;
}

function validateQuestion(form: ExamQuestionForm): Record<string, string> {
  return { ...validateQuestionEnunciado(form), ...validateQuestionAlternatives(form) };
}

function resolveExamId(data: unknown): number | null {
  const root = data as Record<string, unknown> | null | undefined;
  if (!root) return null;
  const body = (root.body ?? root.data ?? root) as Record<string, unknown>;
  const id = body.id;
  return typeof id === "number" ? id : null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExamFormScreen({ examId, navigate }: ExamFormScreenProps) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [savedExamId, setSavedExamId] = useState<number | null>(null);
  const [postCreatePrompt, setPostCreatePrompt] = useState(false);
  const effectiveExamId = examId ?? savedExamId;
  const canManageContent = effectiveExamId != null;
  const scrollRef = useRef<ScrollView>(null);
  const questionImageInputRef = useRef<HTMLInputElement | null>(null);
  const supportMaterialFileInputRef = useRef<HTMLInputElement | null>(null);

  // Domain hooks
  const examStatuses = useExamStatuses();
  const examTypes = useExamTypes();
  const examTypeOptions = [{ value: "", label: "Selecione" }, ...domainToOptions(examTypes)];
  const examStatusOptions = domainToOptions(examStatuses);
  const retakeOptions: SelectOption[] = [
    { value: "false", label: "Não" },
    { value: "true", label: "Sim" },
  ];
  const releaseOptions: SelectOption[] = [
    { value: "false", label: "Liberar assim que corrigir" },
    { value: "true", label: "Liberar só após o fim do período" },
  ];

  // Exam form state
  const [loading, setLoading] = useState(examId !== null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ExamForm>(EMPTY_EXAM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Select options loaded from API
  const [courseOptions, setCourseOptions] = useState<SelectOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SearchableOption[]>([]);

  // Questions state
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionModal, setQuestionModal] = useState(false);
  const [questionModalStep, setQuestionModalStep] = useState<1 | 2>(1);
  const [editQuestionId, setEditQuestionId] = useState<number | null>(null);
  const [qForm, setQForm] = useState<ExamQuestionForm>(EMPTY_QUESTION);
  const [qErrors, setQErrors] = useState<Record<string, string>>({});
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [questionImageRatios, setQuestionImageRatios] = useState<Record<string, number>>({});

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

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const ensureQuestionImageRatio = useCallback((imageUrl: string) => {
    if (!imageUrl || questionImageRatios[imageUrl]) return;
    Image.getSize(
      imageUrl,
      (width, height) => {
        if (!width || !height) return;
        setQuestionImageRatios((prev) => {
          if (prev[imageUrl]) return prev;
          return { ...prev, [imageUrl]: width / height };
        });
      },
      () => {
        setQuestionImageRatios((prev) => {
          if (prev[imageUrl]) return prev;
          return { ...prev, [imageUrl]: 1.4 };
        });
      }
    );
  }, [questionImageRatios]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          api.get("/courses", { params: { per_page: 200 } }),
          api.get("/subjects", { params: { status: "active", per_page: 200 } }),
        ]);
        setCourseOptions([
          { value: "", label: "Nenhum" },
          ...(cRes.data.data ?? cRes.data).map((c: any) => ({ value: String(c.id), label: c.name })),
        ]);
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
        setForm({
          title: exam.title ?? "",
          exam_type: exam.exam_type ?? "custom",
          status: exam.status ?? "draft",
          course_id: exam.course?.id ? String(exam.course.id) : "",
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
        });
        setQuestions(exam.questions ?? []);
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

  // ── Exam Save ────────────────────────────────────────────────────────────────

  const setField = (k: keyof ExamForm, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const saveExam = async () => {
    const errs = validateExam(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        exam_type: form.exam_type,
        status: form.status,
        description: form.description.trim() || null,
        course_id: form.course_id ? Number(form.course_id) : null,
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
        const { data } = await api.put(`/exams/${effectiveExamId}`, payload);
        const response = data?.body ?? data?.data ?? data;
        setToast({
          visible: true,
          type: "success",
          message: data?.message || response?.message || "Operação realizada com sucesso.",
        });
      } else {
        const { data } = await api.post("/exams", payload);
        const newId = resolveExamId(data);
        if (!newId) {
          throw new Error("Resposta da API sem identificador do simulado.");
        }
        setSavedExamId(newId);
        navigate("simulados-form", { examId: newId });
        setPostCreatePrompt(true);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Formulário criado com sucesso.",
        });
      }
      setErrors({});
    } catch (err: any) {
      const apiErrs = parseApiErrors(err?.response?.data?.errors ?? {});
      setErrors(apiErrs);
      setToast({
        visible: true,
        type: "error",
        message: err?.response?.data?.message || "Não foi possível salvar o simulado.",
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
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

  const openNewQuestion = () => {
    setEditQuestionId(null);
    setQForm({ ...EMPTY_QUESTION, options: EMPTY_QUESTION.options.map((o) => ({ ...o })) });
    setQErrors({});
    setQuestionModalStep(1);
    setQuestionModal(true);
  };

  const openEditQuestion = (q: ExamQuestion) => {
    setEditQuestionId(q.id);
    setQForm({
      type: q.type,
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
    const errs = validateQuestionEnunciado(qForm);
    setQErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setQuestionModalStep(2);
  };

  const questionStep2Label =
    qForm.type === "multiple_choice" ? "Alternativas" : "Gabarito";

  const setQField = (k: keyof ExamQuestionForm, v: any) =>
    setQForm((prev) => ({ ...prev, [k]: v }));

  const uploadQuestionImage = async (file: File) => {
    if (!effectiveExamId) return;
    setUploadingQuestionImage(true);
    try {
      const compressed = await prepareImageForUpload(file, 100);
      const formData = new FormData();
      formData.append("image", compressed);
      const { data } = await api.post(`/exams/${effectiveExamId}/questions/upload-image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const response = data.body ?? data.data ?? data;
      if (response?.image_url) {
        setQField("image_url", response.image_url);
        setQErrors((prev) => {
          const next = { ...prev };
          delete next.enunciado;
          delete next.image_url;
          return next;
        });
      }
    } catch (err: any) {
      const apiErrs = parseApiErrors(err?.response?.data?.errors ?? {});
      setQErrors((prev) => ({
        ...prev,
        image_url:
          apiErrs.image ||
          apiErrs.image_url ||
          apiErrs.file ||
          "Não foi possível enviar a imagem.",
      }));
      setToast({
        visible: true,
        type: "error",
        message: err?.response?.data?.message || "Não foi possível enviar a imagem.",
      });
    } finally {
      setUploadingQuestionImage(false);
    }
  };

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
    const enunciadoErrs = validateQuestionEnunciado(qForm);
    const altErrs = validateQuestionAlternatives(qForm);
    const errs = { ...enunciadoErrs, ...altErrs };
    setQErrors(errs);
    if (Object.keys(errs).length > 0) {
      setQuestionModalStep(Object.keys(enunciadoErrs).length > 0 ? 1 : 2);
      return;
    }

    setSavingQuestion(true);
    try {
      const payload: Record<string, any> = {
        type: qForm.type,
        question_text: qForm.question_text.trim() || null,
        subject_id: qForm.subject_id ? Number(qForm.subject_id) : null,
        points: qForm.points ? Number(qForm.points) : 1.0,
        order: qForm.order ? Number(qForm.order) : undefined,
        image_url: qForm.image_url.trim() || null,
        video_url: qForm.video_url.trim() || null,
        explanation: qForm.explanation.trim() || null,
      };
      if (qForm.type === "multiple_choice") {
        payload.options = qForm.options
          .filter((o) => o.option_text.trim())
          .map((o, i) => ({
            option_text: o.option_text.trim(),
            is_correct: o.is_correct,
            order: i + 1,
            triggers_text_input: o.triggers_text_input,
          }));
      }

      if (editQuestionId) {
        const { data } = await api.put(`/exams/${effectiveExamId}/questions/${editQuestionId}`, payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Questão atualizada com sucesso.",
        });
      } else {
        const { data } = await api.post(`/exams/${effectiveExamId}/questions`, payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message || "Questão adicionada com sucesso.",
        });
      }
      closeQuestionModal();
      fetchQuestions();
    } catch (err: any) {
      const apiErrs = parseApiErrors(err?.response?.data?.errors ?? {});
      setQErrors(apiErrs);
      setToast({
        visible: true,
        type: "error",
        message: err?.response?.data?.message || "Não foi possível salvar a questão.",
      });
    } finally {
      setSavingQuestion(false);
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
          setToast({
            visible: true,
            type: "success",
            message: data?.message || "Material de apoio atualizado com sucesso.",
          });
        } else {
          const { data } = await api.post(`/exams/${effectiveExamId}/support-materials`, payload);
          setToast({
            visible: true,
            type: "success",
            message: data?.message || "Material de apoio criado com sucesso.",
          });
        }
      }

      setSupportMaterialModal(false);
      setSupportMaterialForm(EMPTY_SUPPORT_MATERIAL);
      setSupportMaterialFile(null);
      fetchSupportMaterials();
    } catch (err: any) {
      const apiErrs = parseApiErrors(err?.response?.data?.errors ?? {});
      setSupportMaterialErrors(apiErrs);
      setToast({
        visible: true,
        type: "error",
        message: err?.response?.data?.message || "Não foi possível salvar o material de apoio.",
      });
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
    questions.forEach((question) => {
      if (question.image_url) ensureQuestionImageRatio(question.image_url);
    });
  }, [questions, ensureQuestionImageRatio]);

  useEffect(() => {
    if (canManageContent) fetchSupportMaterials();
  }, [canManageContent, fetchSupportMaterials]);

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
    navigate("simulados");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  const inputStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
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

  const stepItems = canManageContent
    ? [
        { id: 1 as const, title: "Dados gerais", description: "Informações e configuração do simulado" },
        { id: 2 as const, title: "Questões", description: "Cadastro, edição e organização das questões" },
        { id: 3 as const, title: "Materiais", description: "Links e arquivos de apoio" },
        { id: 4 as const, title: "Pré-visualização", description: "Como o aluno verá o simulado" },
      ]
    : [
        { id: 1 as const, title: "Dados gerais", description: "Informações e configuração do simulado" },
      ];

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => navigate("simulados")}
            className="p-2 rounded-xl bg-white border border-gray-200"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color="#374151" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-gray-800">
              {canManageContent ? "Editar Simulado" : "Novo Simulado"}
            </Text>
            <Text className="text-sm text-gray-500">
              {canManageContent
                ? "Atualize as informações, questões e materiais do simulado"
                : "Informe o título e, se quiser, os demais dados do formulário"}
            </Text>
          </View>
        </View>
        {canManageContent && (
          <Badge
            label={examStatuses.find((s) => s.slug === form.status)?.label ?? form.status}
            slug={form.status}
          />
        )}
      </View>

      {canManageContent && (
        <View className="flex-row gap-3 mb-6">
          {stepItems.map((step) => {
            const active = activeStep === step.id;
            return (
              <TouchableOpacity
                key={step.id}
                onPress={() => setActiveStep(step.id)}
                className={`flex-1 rounded-2xl border px-4 py-3 ${
                  active ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white"
                }`}
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="items-center justify-center rounded-full"
                    style={{ width: 28, height: 28, backgroundColor: active ? "#7C3AED" : "#E5E7EB" }}
                  >
                    <Text className={`text-xs font-bold ${active ? "text-white" : "text-gray-600"}`}>
                      {step.id}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className={`text-sm font-semibold ${active ? "text-violet-700" : "text-gray-700"}`}>
                      {step.title}
                    </Text>
                    <Text className="text-xs text-gray-400">{step.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Formulário principal */}
      {(activeStep === 1 || !canManageContent) && (
        <View
          className="bg-white rounded-2xl p-6 mb-6"
          style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
        >
        <Text className="text-base font-bold text-gray-800 mb-4">Informações do Simulado</Text>

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 2, minWidth: 280 }}>
            <FormInput
              label="Título"
              required
              value={form.title}
              onChangeText={(v) => setField("title", v)}
              placeholder="Ex.: Simulado ENEM – Matemática"
              error={errors.title}
            />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <FormSelect
              label="Tipo"
              value={form.exam_type}
              options={examTypeOptions}
              onChange={(v) => setField("exam_type", v)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <FormSelect
              label="Status"
              value={form.status}
              options={examStatusOptions}
              onChange={(v) => setField("status", v)}
            />
          </View>
        </View>

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1.2, minWidth: 220 }}>
            <FormSelect
              label="Curso"
              value={form.course_id}
              options={courseOptions}
              onChange={(v) => setField("course_id", v)}
              placeholder="Selecione um curso"
            />
          </View>
          <View style={{ flex: 1.2, minWidth: 240 }}>
            <SearchableSelect
              label="Matéria"
              value={form.subject_id}
              options={subjectOptions}
              onChange={(v) => setField("subject_id", v)}
              placeholder="Selecione uma matéria"
              modalTitle="Selecionar matéria"
            />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <FormInput
              label="Duração (minutos)"
              value={form.duration_minutes}
              onChangeText={(v) => setField("duration_minutes", v)}
              valueFormat="integer"
              maxDigits={4}
              placeholder="Ex.: 90"
              error={errors.duration_minutes}
            />
          </View>
        </View>

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: 180 }}>
            <FormInput
              label="Nota mínima (%)"
              value={form.passing_score}
              onChangeText={(v) => setField("passing_score", v)}
              valueFormat="decimal"
              decimalPlaces={2}
              placeholder="Ex.: 60"
              error={errors.passing_score}
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <DateTimePickerInput
              label="Data de início"
              value={form.starts_at}
              onChangeText={(v) => setField("starts_at", v)}
              error={errors.starts_at}
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <DateTimePickerInput
              label="Data de encerramento"
              value={form.ends_at}
              onChangeText={(v) => setField("ends_at", v)}
              error={errors.ends_at}
            />
          </View>
        </View>

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: 220 }}>
            <FormSelect
              label="Liberação do resultado"
              value={form.release_results_after_end}
              options={releaseOptions}
              onChange={(v) => setField("release_results_after_end", v)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <FormSelect
              label="Permitir retentativa"
              value={form.allow_retake}
              options={retakeOptions}
              onChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  allow_retake: v,
                  max_attempts: v === "true" ? prev.max_attempts : "",
                  min_score_to_retake: v === "true" ? prev.min_score_to_retake : "",
                }))
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <FormInput
              label="Máximo de tentativas"
              value={form.max_attempts}
              onChangeText={(v) => setField("max_attempts", v)}
              valueFormat="integer"
              maxDigits={3}
              placeholder="Ex.: 3"
              editable={form.allow_retake === "true"}
              error={errors.max_attempts}
            />
          </View>
        </View>

        {form.release_results_after_end === "true" && (
          <Text className="text-xs text-cyan-700 mb-4 -mt-2">
            O aluno só verá nota e gabarito depois que a data final do simulado for atingida.
          </Text>
        )}

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: 240 }}>
            <FormInput
              label="Nota mínima para nova tentativa (%)"
              value={form.min_score_to_retake}
              onChangeText={(v) => setField("min_score_to_retake", v)}
              valueFormat="decimal"
              decimalPlaces={2}
              placeholder="Ex.: 70 (vazio usa nota mínima do simulado)"
              editable={form.allow_retake === "true"}
              error={errors.min_score_to_retake}
            />
          </View>
          <View style={{ flex: 1.4, minWidth: 280 }}>
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">Descrição</Text>
              <textarea
                value={form.description}
                onChange={(e: any) => setField("description", e.target.value)}
                placeholder="Descrição opcional do simulado..."
                style={inputStyle}
                rows={3}
              />
            </View>
          </View>
        </View>

        {form.allow_retake !== "true" && (
          <Text className="text-xs text-gray-400 mb-4 -mt-2">
            Retentativa desativada: após concluir, o aluno não poderá iniciar nova tentativa.
          </Text>
        )}

        <View className="flex-row gap-3 mt-2">
          <TouchableOpacity
            onPress={() => navigate("simulados")}
            className="flex-1 border border-gray-200 py-3 rounded-xl items-center"
            activeOpacity={0.7}
          >
            <Text className="text-sm font-semibold text-gray-600">Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveExam}
            disabled={saving}
            className="flex-1 bg-violet-600 py-3 rounded-xl items-center"
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                {canManageContent ? "Salvar Alterações" : "Criar Formulário"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {canManageContent && activeStep === 1 && (
          <View className="flex-row justify-end mt-4">
            <TouchableOpacity
              onPress={() => {
                setActiveStep(2);
                fetchQuestions();
                scrollToTop();
              }}
              className="px-4 py-2.5 rounded-xl bg-violet-600"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Ir para questões</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      )}

      {/* Seção de Questões – só exibe quando o simulado já existe */}
      {canManageContent && activeStep === 2 && (
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
        >
          {/* Header da seção */}
          <View
            className={`px-6 py-4 border-b border-gray-100 gap-3 ${
              isMobile ? "flex-col" : "flex-row items-center justify-between"
            }`}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-base font-bold text-gray-800">Questões</Text>
              <Text className="text-xs text-gray-400">
                {questions.length} questão{questions.length !== 1 ? "ões" : ""} · {totalPoints.toFixed(1)} pontos no total
              </Text>
            </View>
            {questions.length > 0 && (
              <TouchableOpacity
                onPress={openNewQuestion}
                className={`flex-row items-center justify-center bg-violet-600 px-4 py-2.5 rounded-xl ${
                  isMobile ? "w-full" : ""
                }`}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="white" />
                <Text className="text-white text-sm font-semibold ml-1">Nova Questão</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Lista de questões */}
          {loadingQuestions ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : questions.length === 0 ? (
            <View className="py-12 items-center gap-3 px-6">
              <Ionicons name="help-circle-outline" size={32} color="#D1D5DB" />
              <Text className="text-sm text-gray-400 text-center">Nenhuma questão adicionada ainda</Text>
              <TouchableOpacity
                onPress={openNewQuestion}
                className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="white" />
                <Text className="text-sm font-semibold text-white ml-1">Nova Questão</Text>
              </TouchableOpacity>
            </View>
          ) : (
            questions.map((q, i) => (
              <View
                key={q.id}
                className={`px-6 py-4 ${i < questions.length - 1 ? "border-b border-gray-50" : ""}`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className="items-center justify-center rounded-lg"
                    style={{ width: 32, height: 32, backgroundColor: "#EDE9FE", flexShrink: 0 }}
                  >
                    <Text className="text-xs font-bold text-violet-700">{q.order}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-gray-800 font-medium" numberOfLines={2}>
                      {q.question_text || "Questão sem texto"}
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
                          color="#9CA3AF"
                        />
                        <Text className="text-xs text-gray-400">
                          {q.type === "essay"
                            ? "Discursiva"
                            : q.options.some((o) => o.triggers_text_input)
                            ? 'Objetiva c/ "Outro"'
                            : "Objetiva"}
                        </Text>
                      </View>
                      {q.subject && (
                        <Text className="text-xs text-gray-400">· {q.subject.name}</Text>
                      )}
                      <Text className="text-xs text-gray-400">· {q.points} pts</Text>
                      {q.type === "multiple_choice" && (
                        <Text className="text-xs text-gray-400">· {q.options.length} opções</Text>
                      )}
                    </View>
                  </View>
                  <View className="flex-row gap-1">
                    <TouchableOpacity
                      onPress={() => openEditQuestion(q)}
                      className="p-2 rounded-lg bg-violet-50"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={14} color="#7C3AED" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteQuestionId(q.id)}
                      className="p-2 rounded-lg bg-red-50"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View
            className={`px-6 py-4 border-t border-gray-100 gap-3 ${
              isMobile ? "flex-col" : "flex-row flex-wrap justify-between"
            }`}
          >
            <TouchableOpacity
              onPress={() => setActiveStep(1)}
              className={`px-4 py-2.5 rounded-xl border border-gray-200 bg-white items-center ${
                isMobile ? "w-full" : ""
              }`}
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-gray-700">Voltar para dados</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveStep(3)}
              className={`px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 items-center ${
                isMobile ? "w-full" : ""
              }`}
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-violet-700">Materiais de apoio</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canManageContent && activeStep === 3 && (
        <View
          className="bg-white rounded-2xl overflow-hidden mb-6"
          style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
        >
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
            <View>
              <Text className="text-base font-bold text-gray-800">Materiais de apoio</Text>
              <Text className="text-xs text-gray-400">
                Links e arquivos para auxiliar os alunos antes ou durante o simulado
              </Text>
            </View>
            <TouchableOpacity
              onPress={openNewSupportMaterial}
              className="flex-row items-center bg-violet-600 px-4 py-2 rounded-xl"
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-white text-sm font-semibold ml-1">Novo Material</Text>
            </TouchableOpacity>
          </View>

          {loadingSupportMaterials ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : supportMaterials.length === 0 ? (
            <View className="py-12 items-center gap-2">
              <Ionicons name="library-outline" size={30} color="#D1D5DB" />
              <Text className="text-sm text-gray-400">Nenhum material de apoio cadastrado.</Text>
              <TouchableOpacity onPress={openNewSupportMaterial} activeOpacity={0.7}>
                <Text className="text-sm text-violet-600 font-semibold">Adicionar primeiro material</Text>
              </TouchableOpacity>
            </View>
          ) : (
            supportMaterials.map((material, idx) => (
              <View
                key={material.id}
                className={`px-6 py-4 ${idx < supportMaterials.length - 1 ? "border-b border-gray-50" : ""}`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className={`w-9 h-9 rounded-xl items-center justify-center ${
                      material.type === "link" ? "bg-sky-50" : "bg-emerald-50"
                    }`}
                  >
                    <Ionicons
                      name={material.type === "link" ? "link-outline" : "document-attach-outline"}
                      size={17}
                      color={material.type === "link" ? "#0369A1" : "#047857"}
                    />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-sm font-semibold text-gray-800">{material.title}</Text>
                      <Badge
                        label={material.type === "link" ? "Link" : "Arquivo"}
                        slug={material.type === "link" ? "active" : "published"}
                      />
                    </View>
                    {!!material.description && (
                      <Text className="text-xs text-gray-500 mb-1">{material.description}</Text>
                    )}
                    <Text className="text-xs text-violet-700" numberOfLines={1}>
                      {material.content}
                    </Text>
                    {material.type === "file" && (
                      <Text className="text-xs text-gray-400 mt-1">
                        {material.file_type ? `Tipo: ${material.file_type.toUpperCase()} · ` : ""}
                        Tamanho: {formatFileSize(material.file_size)}
                      </Text>
                    )}
                  </View>
                  <View className="flex-row gap-1">
                    <TouchableOpacity
                      onPress={() => openEditSupportMaterial(material)}
                      className="p-2 rounded-lg bg-violet-50"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={14} color="#7C3AED" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteSupportMaterialId(material.id)}
                      className="p-2 rounded-lg bg-red-50"
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View className="px-6 py-4 border-t border-gray-100 flex-row justify-between">
            <TouchableOpacity
              onPress={() => setActiveStep(2)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-gray-700">Voltar para questões</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveStep(4)}
              className="px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-violet-700">Ir para preview</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openNewSupportMaterial}
              className="px-4 py-2.5 rounded-xl bg-violet-600"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Novo Material</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canManageContent && activeStep === 4 && (
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
        >
          <View className="px-6 py-4 border-b border-gray-100 flex-row items-center justify-between">
            <View>
              <Text className="text-base font-bold text-gray-800">Pré-visualização do aluno</Text>
              <Text className="text-xs text-gray-400">
                Simulação de como o simulado aparece durante a realização
              </Text>
            </View>
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <Ionicons name="eye-outline" size={16} color="#6B7280" />
              <Text className="text-xs font-semibold text-gray-600">
                {questions.length} questões · {totalPoints.toFixed(1)} pontos
              </Text>
            </View>
          </View>

          <View className="px-6 py-5 bg-violet-50 border-b border-violet-100">
            <Text className="text-lg font-bold text-violet-900">{form.title || "Título do simulado"}</Text>
            <Text className="text-sm text-violet-700 mt-1">
              {examTypeOptions.find((o) => o.value === form.exam_type)?.label ?? form.exam_type}
              {form.subject_id ? ` · ${subjectOptions.find((o) => o.value === form.subject_id)?.label ?? "Matéria"}` : ""}
            </Text>
            <Text className="text-xs text-violet-600 mt-2">
              Duração: {form.duration_minutes || "--"} min · Nota mínima: {form.passing_score || "--"}%
            </Text>
          </View>

          {questions.length === 0 ? (
            <View className="py-12 items-center gap-2">
              <Ionicons name="eye-off-outline" size={32} color="#D1D5DB" />
              <Text className="text-sm text-gray-400">Adicione questões para visualizar o simulado.</Text>
            </View>
          ) : (
            questions.map((q, index) => (
              <View key={q.id} className={`px-6 py-5 ${index < questions.length - 1 ? "border-b border-gray-50" : ""}`}>
                <View className="flex-row items-start gap-3 mb-3">
                  <View className="w-8 h-8 rounded-full bg-violet-100 items-center justify-center">
                    <Text className="text-xs font-bold text-violet-700">{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="text-sm font-semibold text-gray-800">
                      {q.question_text || "Questão sem texto"}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-1">
                      {q.type === "essay" ? "Discursiva" : q.options.some((o) => o.triggers_text_input) ? 'Objetiva c/ "Outro"' : "Objetiva"}
                      {q.points ? ` · ${q.points} pontos` : ""}
                    </Text>
                  </View>
                </View>

                {q.image_url && (
                  <View className="mb-4 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    <Image
                      source={{ uri: q.image_url }}
                      style={{
                        width: "100%",
                        aspectRatio: questionImageRatios[q.image_url] || 1.4,
                        backgroundColor: "#F3F4F6",
                      }}
                      resizeMode="contain"
                    />
                    <View className="px-3 py-2 border-t border-gray-200">
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {q.image_url}
                      </Text>
                    </View>
                  </View>
                )}

                {q.type === "essay" ? (
                  <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 min-h-[96px]">
                    <Text className="text-xs text-gray-400">Resposta do aluno</Text>
                    <Text className="text-sm text-gray-500 mt-2">Espaço para resposta discursiva...</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {q.options.map((opt) => (
                      <View
                        key={opt.id ?? `${q.id}-${opt.order}`}
                        className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                          opt.triggers_text_input ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"
                        }`}
                      >
                        <View className="w-5 h-5 rounded-full border-2 border-gray-300 items-center justify-center">
                          <View className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                        </View>
                        <Text className="text-sm flex-1 text-gray-700">{opt.option_text || `Opção ${opt.order}`}</Text>
                        {opt.triggers_text_input && (
                          <View className="px-2 py-1 rounded-full bg-amber-100 border border-amber-200">
                            <Text className="text-[11px] font-semibold text-amber-700">Exige texto</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}

          <View className="px-6 py-4 border-t border-gray-100 flex-row justify-between">
            <TouchableOpacity
              onPress={() => setActiveStep(3)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-gray-700">Voltar para materiais</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigate("simulados")}
              className="px-4 py-2.5 rounded-xl bg-violet-600"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Finalizar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal de Questão */}
      <Modal
        visible={questionModal}
        title={editQuestionId ? "Editar Questão" : "Nova Questão"}
        onClose={closeQuestionModal}
        size="md"
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
              className="flex-1 border border-gray-200 py-2.5 rounded-xl items-center justify-center"
              style={{ minWidth: 0 }}
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-600">
                {questionModalStep === 1 ? "Cancelar" : "Voltar"}
              </Text>
            </TouchableOpacity>
            {questionModalStep === 1 ? (
              <TouchableOpacity
                onPress={goToQuestionStep2}
                className="flex-1 bg-violet-600 py-2.5 rounded-xl items-center justify-center"
                style={{ minWidth: 0 }}
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold text-white">
                  Próximo: {questionStep2Label}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={saveQuestion}
                disabled={savingQuestion}
                className="flex-1 bg-violet-600 py-2.5 rounded-xl items-center justify-center"
                style={{ minWidth: 0 }}
                activeOpacity={0.85}
              >
                {savingQuestion ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-sm font-semibold text-white">
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
                  {index > 0 ? <Ionicons name="chevron-forward" size={14} color="#9CA3AF" /> : null}
                  <View
                    className="flex-1 rounded-xl px-3 py-2.5"
                    style={{
                      backgroundColor: active ? "#7C3AED" : complete ? "#F5F3FF" : "#F9FAFB",
                      borderWidth: 1,
                      borderColor: active ? "#7C3AED" : complete ? "#C4B5FD" : "#E5E7EB",
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: active ? "#FFFFFF" : complete ? "#DDD6FE" : "#EEF2F7",
                        }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: active ? "#7C3AED" : complete ? "#6D28D9" : "#9CA3AF" }}
                        >
                          {item.step}
                        </Text>
                      </View>
                      <Text
                        className="text-[11px] font-bold uppercase"
                        numberOfLines={1}
                        style={{ color: active ? "#FFFFFF" : complete ? "#6D28D9" : "#6B7280" }}
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
          <View className="gap-4">
            {qErrors.enunciado && (
              <View className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                <Text className="text-xs text-red-600">{qErrors.enunciado}</Text>
              </View>
            )}

            <View className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <Text className="text-xs font-semibold text-gray-500 mb-2">Formato</Text>
              <View className="flex-row bg-white rounded-xl p-1 border border-gray-200">
                {(["multiple_choice", "essay"] as const).map((t) => {
                  const selected = qForm.type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setQField("type", t)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg"
                      style={{
                        backgroundColor: selected ? "#7C3AED" : "transparent",
                        borderWidth: 1,
                        borderColor: selected ? "#7C3AED" : "transparent",
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={t === "multiple_choice" ? "list-outline" : "create-outline"}
                        size={15}
                        color={selected ? "#FFFFFF" : "#6B7280"}
                      />
                      <Text
                        className={`text-sm font-semibold ${selected ? "text-white" : "text-gray-600"}`}
                      >
                        {t === "multiple_choice" ? "Objetiva" : "Discursiva"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">Enunciado</Text>
              <textarea
                value={qForm.question_text}
                onChange={(e: any) => {
                  setQField("question_text", e.target.value);
                  if (qErrors.enunciado) {
                    setQErrors((prev) => {
                      const next = { ...prev };
                      delete next.enunciado;
                      return next;
                    });
                  }
                }}
                placeholder="Digite o texto da questão..."
                style={{
                  ...inputStyle,
                  minHeight: 88,
                  borderColor: qErrors.enunciado ? "#FCA5A5" : "#E5E7EB",
                }}
                rows={3}
              />
              {!qErrors.enunciado && (
                <Text className="text-xs text-gray-400 mt-1">
                  Texto e/ou imagem — pelo menos um é necessário.
                </Text>
              )}
            </View>

            <View className={`gap-3 ${isMobile ? "" : "flex-row items-start"}`}>
              <View className={isMobile ? "" : "flex-1"} style={{ minWidth: 0 }}>
                <FormSelect
                  label="Matéria"
                  value={qForm.subject_id}
                  options={subjectOptions.filter((o) => o.value !== "")}
                  onChange={(v) => setQField("subject_id", v)}
                  placeholder="Nenhuma"
                />
              </View>
              <View style={{ width: isMobile ? undefined : 96 }}>
                <FormInput
                  label="Pontos"
                  value={qForm.points}
                  onChangeText={(v) => setQField("points", v)}
                  valueFormat="decimal"
                  decimalPlaces={2}
                  placeholder="1"
                  error={qErrors.points}
                  style={{ height: 42, textAlign: "center" }}
                />
              </View>
              <View style={{ width: isMobile ? undefined : 88 }}>
                <FormInput
                  label="Ordem"
                  value={qForm.order}
                  onChangeText={(v) => setQField("order", v)}
                  valueFormat="integer"
                  maxDigits={4}
                  placeholder="1"
                  error={qErrors.order}
                  style={{ height: 42, textAlign: "center" }}
                />
              </View>
            </View>

            <View
              className="rounded-xl border p-3"
              style={{
                borderColor: qErrors.enunciado ? "#FCA5A5" : "#E5E7EB",
                backgroundColor: "#FAFAFA",
              }}
            >
              <Text className="text-sm font-semibold text-gray-700 mb-2">Mídia (opcional)</Text>
              <View className="flex-row items-center gap-3 flex-wrap">
                <TouchableOpacity
                  onPress={() => questionImageInputRef.current?.click()}
                  disabled={uploadingQuestionImage}
                  className="flex-row items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white"
                  activeOpacity={0.85}
                >
                  {uploadingQuestionImage ? (
                    <ActivityIndicator color="#7C3AED" size="small" />
                  ) : (
                    <Ionicons name="image-outline" size={16} color="#7C3AED" />
                  )}
                  <Text className="text-sm font-medium text-gray-700">
                    {qForm.image_url ? "Trocar imagem" : "Enviar imagem"}
                  </Text>
                </TouchableOpacity>
                {qForm.image_url ? (
                  <View className="flex-row items-center gap-2">
                    <Image
                      source={{ uri: qForm.image_url }}
                      style={{ width: 80, height: 56, borderRadius: 8, backgroundColor: "#E5E7EB" }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity onPress={() => setQField("image_url", "")} activeOpacity={0.7}>
                      <Text className="text-xs font-semibold text-red-600">Remover</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
              <input
                ref={questionImageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e: any) => {
                  const file = e.target.files?.[0];
                  if (file) uploadQuestionImage(file);
                  e.target.value = "";
                }}
              />
              <View className="mt-3">
                <FormInput
                  label="URL do vídeo"
                  value={qForm.video_url}
                  onChangeText={(v) => setQField("video_url", v)}
                  placeholder="https://..."
                  keyboardType="url"
                  error={qErrors.video_url}
                />
              </View>
            </View>
          </View>
        ) : (
          <View className="gap-4">
            {qForm.type === "multiple_choice" ? (
              <View>
                <Text className="text-sm font-semibold text-gray-800 mb-1">
                  Alternativas de resposta
                </Text>
                <Text className="text-xs text-gray-400 mb-3">
                  Marque a opção correta e preencha pelo menos duas alternativas.
                </Text>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-medium text-gray-600">Opções</Text>
                  <TouchableOpacity
                    onPress={addOption}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-md bg-gray-100"
                  >
                    <Ionicons name="add" size={14} color="#374151" />
                    <Text className="text-xs text-gray-700 font-semibold">Opção</Text>
                  </TouchableOpacity>
                </View>

                {qErrors.options && (
                  <Text className="text-xs text-red-500 mb-2">{qErrors.options}</Text>
                )}

                {qForm.options.map((opt, idx) => (
                  <View key={idx} className="flex-row items-center gap-2 mb-2">
                    <TouchableOpacity onPress={() => markCorrect(idx)} activeOpacity={0.7}>
                      <Ionicons
                        name={opt.is_correct ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={opt.is_correct ? "#7C3AED" : "#D1D5DB"}
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={opt.option_text}
                        onChangeText={(v) => setOptionField(idx, "option_text", v)}
                        placeholder={`Opção ${idx + 1}`}
                        placeholderTextColor="#9CA3AF"
                        className={`border rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 ${
                          opt.is_correct ? "border-violet-300" : "border-gray-200"
                        }`}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => markTriggerText(idx)}
                      activeOpacity={0.7}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name={opt.triggers_text_input ? "chatbox" : "chatbox-outline"}
                        size={17}
                        color={opt.triggers_text_input ? "#F59E0B" : "#D1D5DB"}
                      />
                    </TouchableOpacity>
                    {qForm.options.length > 2 && (
                      <TouchableOpacity onPress={() => removeOption(idx)} activeOpacity={0.7}>
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <Text className="text-[11px] text-gray-400 mt-1 mb-2">
                  ○ correta · 💬 &quot;Outro&quot;
                </Text>
              </View>
            ) : null}

            <View className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">
                Gabarito / explicação (opcional)
              </Text>
              <textarea
                value={qForm.explanation}
                onChange={(e: any) => setQField("explanation", e.target.value)}
                placeholder="Texto exibido após a correção..."
                style={{ ...inputStyle, minHeight: 72, backgroundColor: "#fff" }}
                rows={3}
              />
            </View>
          </View>
        )}
      </Modal>

      {/* Modal de Material de Apoio */}
      <Modal
        visible={supportMaterialModal}
        title={editSupportMaterialId ? "Editar Material de Apoio" : "Novo Material de Apoio"}
        onClose={() => setSupportMaterialModal(false)}
        size="lg"
        footer={
          <View className="flex-row gap-3 px-6 py-4 border-t border-gray-100">
            <TouchableOpacity
              onPress={() => setSupportMaterialModal(false)}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-600">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveSupportMaterial}
              disabled={savingSupportMaterial}
              className="flex-1 bg-violet-600 py-2.5 rounded-xl items-center"
              activeOpacity={0.85}
            >
              {savingSupportMaterial ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-sm font-semibold text-white">
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
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">Descrição (opcional)</Text>
          <textarea
            value={supportMaterialForm.description}
            onChange={(e: any) => setSupportMaterialField("description", e.target.value)}
            placeholder="Observações sobre este material..."
            style={inputStyle}
            rows={2}
          />
        </View>

        <View className="mb-3">
          <FormSelect
            label="Tipo"
            value={supportMaterialForm.type}
            options={[
              { value: "link", label: "Link" },
              { value: "file", label: "Arquivo" },
            ]}
            onChange={(v) =>
              setSupportMaterialForm((prev) => ({
                ...prev,
                type: v as "link" | "file",
                content: v === "file" && !editSupportMaterialId ? "" : prev.content,
              }))
            }
          />
        </View>

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
            <Text className="text-sm font-semibold text-gray-700 mb-1.5">
              Arquivo (PDF, imagem ou vídeo)
            </Text>
            {!editSupportMaterialId ? (
              <>
                <View className="flex-row items-center gap-3 flex-wrap">
                  <TouchableOpacity
                    onPress={() => supportMaterialFileInputRef.current?.click()}
                    disabled={uploadingSupportMaterialFile}
                    className="px-4 py-2.5 rounded-xl bg-violet-600"
                    activeOpacity={0.85}
                  >
                    <Text className="text-sm font-semibold text-white">
                      {supportMaterialFile ? "Trocar arquivo" : "Selecionar arquivo"}
                    </Text>
                  </TouchableOpacity>
                  {supportMaterialFile ? (
                    <View className="px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 min-w-[220px]">
                      <Text className="text-xs font-semibold text-violet-700" numberOfLines={1}>
                        {supportMaterialFile.name}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-gray-400">Nenhum arquivo selecionado</Text>
                  )}
                </View>
                <Text className="text-xs text-gray-400 mt-2">
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
                  <Text className="text-xs text-red-500 mt-1">{supportMaterialErrors.file}</Text>
                )}
              </>
            ) : (
              <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-xs text-gray-500">
                  Para alterar o arquivo, remova este material e crie um novo upload.
                </Text>
                <Text className="text-xs text-violet-600 mt-1" numberOfLines={1}>
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

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </ScrollView>
  );
}
