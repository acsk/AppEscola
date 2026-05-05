import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import SearchableSelect, { SearchableOption } from "../../components/ui/SearchableSelect";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useExamStatuses, useExamTypes, domainToOptions } from "../../hooks/useDomains";
import DateTimePickerInput from "../../components/ui/DateTimePickerInput";
import { displayToISO, isoToDisplay, displayDateTimeToISO, isoToDisplayDateTime } from "../../utils/masks";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExamForm = {
  title: string;
  exam_type: string;
  status: string;
  course_id: string;
  subject_id: string;
  description: string;
  duration_minutes: string;
  passing_score: string;
  starts_at: string;
  ends_at: string;
  release_results_after_end: string;
  allow_retake: string;
  max_attempts: string;
  min_score_to_retake: string;
};

type Question = {
  id: number;
  type: "multiple_choice" | "essay";
  question_text: string;
  points: number;
  order: number;
  image_url: string | null;
  video_url: string | null;
  explanation: string | null;
  subject: { id: number; name: string } | null;
  options: Option[];
};

type Option = {
  id?: number;
  option_text: string;
  is_correct: boolean;
  order: number;
  triggers_text_input: boolean;
};

type QuestionForm = {
  type: "multiple_choice" | "essay";
  question_text: string;
  subject_id: string;
  points: string;
  order: string;
  image_url: string;
  video_url: string;
  explanation: string;
  options: OptionForm[];
};

type OptionForm = {
  option_text: string;
  is_correct: boolean;
  order: number;
  triggers_text_input: boolean;
};

type SelectOption = { value: string | number; label: string };

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

const EMPTY_QUESTION: QuestionForm = {
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

// ── Validation ────────────────────────────────────────────────────────────────

function validateExam(form: ExamForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.title.trim()) errs.title = "Título é obrigatório.";
  if (form.duration_minutes && isNaN(Number(form.duration_minutes)))
    errs.duration_minutes = "Duração deve ser um número inteiro.";
  if (form.passing_score && isNaN(Number(form.passing_score)))
    errs.passing_score = "Nota mínima deve ser um número.";
  if (form.passing_score) {
    const score = Number(form.passing_score);
    if (score < 0 || score > 100) errs.passing_score = "Nota mínima deve estar entre 0 e 100.";
  }
  if (form.release_results_after_end === "true" && !form.ends_at) {
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
      if (isNaN(minScore) || minScore < 0 || minScore > 100)
        errs.min_score_to_retake = "Nota para nova tentativa deve estar entre 0 e 100.";
    }
  }
  return errs;
}

function validateQuestion(form: QuestionForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.question_text.trim()) errs.question_text = "Enunciado é obrigatório.";
  if (form.points && isNaN(Number(form.points))) errs.points = "Pontuação deve ser um número.";
  if (form.type === "multiple_choice") {
    const filled = form.options.filter((o) => o.option_text.trim());
    if (filled.length < 2) errs.options = "Informe pelo menos 2 opções.";
    const hasCorrect = form.options.some((o) => o.is_correct && o.option_text.trim());
    if (!hasCorrect) errs.options = "Marque pelo menos uma opção como correta.";
  }
  return errs;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  examId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExamFormScreen({ examId, navigate }: Props) {
  const isEdit = examId !== null;
  const scrollRef = useRef<ScrollView>(null);

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
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ExamForm>(EMPTY_EXAM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Select options loaded from API
  const [courseOptions, setCourseOptions] = useState<SelectOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SearchableOption[]>([]);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionModal, setQuestionModal] = useState(false);
  const [editQuestionId, setEditQuestionId] = useState<number | null>(null);
  const [qForm, setQForm] = useState<QuestionForm>(EMPTY_QUESTION);
  const [qErrors, setQErrors] = useState<Record<string, string>>({});
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);

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
    if (!isEdit) return;
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
  }, [examId]);

  const fetchQuestions = useCallback(async () => {
    if (!isEdit || !examId) return;
    setLoadingQuestions(true);
    try {
      const { data } = await api.get(`/exams/${examId}`);
      setQuestions((data.body ?? data).questions ?? []);
    } catch {}
    setLoadingQuestions(false);
  }, [examId, isEdit]);

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

      if (isEdit) {
        await api.put(`/exams/${examId}`, payload);
      } else {
        const { data } = await api.post("/exams", payload);
        navigate("simulados-form", { examId: (data.body ?? data).id });
        return;
      }
      setErrors({});
    } catch (err: any) {
      const apiErrs = parseApiErrors(err);
      setErrors(apiErrs);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    setSaving(false);
  };

  // ── Question Modal ────────────────────────────────────────────────────────────

  const openNewQuestion = () => {
    setEditQuestionId(null);
    setQForm({ ...EMPTY_QUESTION, options: EMPTY_QUESTION.options.map((o) => ({ ...o })) });
    setQErrors({});
    setQuestionModal(true);
  };

  const openEditQuestion = (q: Question) => {
    setEditQuestionId(q.id);
    setQForm({
      type: q.type,
      question_text: q.question_text,
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
    setQuestionModal(true);
  };

  const setQField = (k: keyof QuestionForm, v: any) =>
    setQForm((prev) => ({ ...prev, [k]: v }));

  const setOptionField = (idx: number, k: keyof OptionForm, v: any) => {
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
    if (!examId) return;
    const errs = validateQuestion(qForm);
    setQErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingQuestion(true);
    try {
      const payload: Record<string, any> = {
        type: qForm.type,
        question_text: qForm.question_text.trim(),
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
        await api.put(`/exams/${examId}/questions/${editQuestionId}`, payload);
      } else {
        await api.post(`/exams/${examId}/questions`, payload);
      }
      setQuestionModal(false);
      fetchQuestions();
    } catch (err: any) {
      const apiErrs = parseApiErrors(err);
      setQErrors(apiErrs);
    }
    setSavingQuestion(false);
  };

  const deleteQuestion = async () => {
    if (!deleteQuestionId || !examId) return;
    setDeletingQuestion(true);
    try {
      await api.delete(`/exams/${examId}/questions/${deleteQuestionId}`);
      setDeleteQuestionId(null);
      fetchQuestions();
    } catch {}
    setDeletingQuestion(false);
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

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
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
              {isEdit ? "Editar Simulado" : "Novo Simulado"}
            </Text>
            <Text className="text-sm text-gray-500">
              {isEdit ? "Atualize as informações e questões do simulado" : "Preencha os dados para criar o simulado"}
            </Text>
          </View>
        </View>
        {isEdit && (
          <Badge
            label={examStatuses.find((s) => s.slug === form.status)?.label ?? form.status}
            slug={form.status}
          />
        )}
      </View>

      {/* Formulário principal */}
      <View
        className="bg-white rounded-2xl p-6 mb-6"
        style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
      >
        <Text className="text-base font-bold text-gray-800 mb-4">Informações do Simulado</Text>

        <FormInput
          label="Título"
          required
          value={form.title}
          onChangeText={(v) => setField("title", v)}
          placeholder="Ex.: Simulado ENEM – Matemática"
          error={errors.title}
        />

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <FormSelect
              label="Tipo"
              value={form.exam_type}
              options={examTypeOptions}
              onChange={(v) => setField("exam_type", v)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormSelect
              label="Status"
              value={form.status}
              options={examStatusOptions}
              onChange={(v) => setField("status", v)}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <FormSelect
              label="Curso"
              value={form.course_id}
              options={courseOptions}
              onChange={(v) => setField("course_id", v)}
              placeholder="Selecione um curso"
            />
          </View>
          <View style={{ flex: 1 }}>
            <SearchableSelect
              label="Matéria"
              value={form.subject_id}
              options={subjectOptions}
              onChange={(v) => setField("subject_id", v)}
              placeholder="Selecione uma matéria"
              modalTitle="Selecionar matéria"
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <FormInput
              label="Duração (minutos)"
              value={form.duration_minutes}
              onChangeText={(v) => setField("duration_minutes", v)}
              placeholder="Ex.: 90"
              keyboardType="numeric"
              error={errors.duration_minutes}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput
              label="Nota mínima (%)"
              value={form.passing_score}
              onChangeText={(v) => setField("passing_score", v)}
              placeholder="Ex.: 60"
              keyboardType="numeric"
              error={errors.passing_score}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <DateTimePickerInput
              label="Data de início"
              value={form.starts_at}
              onChangeText={(v) => setField("starts_at", v)}
              error={errors.starts_at}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimePickerInput
              label="Data de encerramento"
              value={form.ends_at}
              onChangeText={(v) => setField("ends_at", v)}
              error={errors.ends_at}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <FormSelect
              label="Liberação do resultado"
              value={form.release_results_after_end}
              options={releaseOptions}
              onChange={(v) => setField("release_results_after_end", v)}
            />
          </View>
          <View style={{ flex: 1 }}>
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
        </View>

        {form.release_results_after_end === "true" && (
          <Text className="text-xs text-cyan-700 mb-4 -mt-2">
            O aluno só verá nota e gabarito depois que a data final do simulado for atingida.
          </Text>
        )}

        <View className="flex-row gap-4">
          <View style={{ flex: 1 }}>
            <FormInput
              label="Máximo de tentativas"
              value={form.max_attempts}
              onChangeText={(v) => setField("max_attempts", v)}
              placeholder="Ex.: 3"
              keyboardType="numeric"
              editable={form.allow_retake === "true"}
              error={errors.max_attempts}
            />
          </View>
        </View>

        <FormInput
          label="Nota mínima para nova tentativa (%)"
          value={form.min_score_to_retake}
          onChangeText={(v) => setField("min_score_to_retake", v)}
          placeholder="Ex.: 70 (vazio usa nota mínima do simulado)"
          keyboardType="numeric"
          editable={form.allow_retake === "true"}
          error={errors.min_score_to_retake}
        />

        {form.allow_retake !== "true" && (
          <Text className="text-xs text-gray-400 mb-4 -mt-2">
            Retentativa desativada: após concluir, o aluno não poderá iniciar nova tentativa.
          </Text>
        )}

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
                {isEdit ? "Salvar Alterações" : "Criar Simulado"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Seção de Questões – só exibe quando o simulado já existe */}
      {isEdit && (
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
        >
          {/* Header da seção */}
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
            <View>
              <Text className="text-base font-bold text-gray-800">Questões</Text>
              <Text className="text-xs text-gray-400">
                {questions.length} questão{questions.length !== 1 ? "ões" : ""} · {totalPoints.toFixed(1)} pontos no total
              </Text>
            </View>
            <TouchableOpacity
              onPress={openNewQuestion}
              className="flex-row items-center bg-violet-600 px-4 py-2 rounded-xl"
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-white text-sm font-semibold ml-1">Nova Questão</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de questões */}
          {loadingQuestions ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : questions.length === 0 ? (
            <View className="py-12 items-center gap-2">
              <Ionicons name="help-circle-outline" size={32} color="#D1D5DB" />
              <Text className="text-sm text-gray-400">Nenhuma questão adicionada ainda</Text>
              <TouchableOpacity onPress={openNewQuestion} activeOpacity={0.7}>
                <Text className="text-sm text-violet-600 font-semibold">Adicionar primeira questão</Text>
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
                      {q.question_text}
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
        </View>
      )}

      {/* Modal de Questão */}
      <Modal
        visible={questionModal}
        title={editQuestionId ? "Editar Questão" : "Nova Questão"}
        onClose={() => setQuestionModal(false)}
        size="lg"
        footer={
          <View className="flex-row gap-3 px-6 py-4 border-t border-gray-100">
            <TouchableOpacity
              onPress={() => setQuestionModal(false)}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-600">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveQuestion}
              disabled={savingQuestion}
              className="flex-1 bg-violet-600 py-2.5 rounded-xl items-center"
              activeOpacity={0.85}
            >
              {savingQuestion ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {editQuestionId ? "Salvar" : "Adicionar"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {/* Tipo */}
        <View className="flex-row gap-3 mb-4">
          {(["multiple_choice", "essay"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setQField("type", t)}
              className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${
                qForm.type === t
                  ? "border-violet-500 bg-violet-50"
                  : "border-gray-200 bg-white"
              }`}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t === "multiple_choice" ? "radio-button-on-outline" : "create-outline"}
                size={16}
                color={qForm.type === t ? "#7C3AED" : "#9CA3AF"}
              />
              <Text
                className={`text-sm font-semibold ${
                  qForm.type === t ? "text-violet-700" : "text-gray-500"
                }`}
              >
                {t === "multiple_choice" ? "Objetiva" : "Discursiva"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Enunciado */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">
            Enunciado <Text className="text-red-500">*</Text>
          </Text>
          <textarea
            value={qForm.question_text}
            onChange={(e: any) => setQField("question_text", e.target.value)}
            placeholder="Digite o enunciado da questão..."
            style={{
              ...inputStyle,
              borderColor: qErrors.question_text ? "#FCA5A5" : "#E5E7EB",
            }}
            rows={3}
          />
          {qErrors.question_text && (
            <Text className="text-xs text-red-500 mt-1">{qErrors.question_text}</Text>
          )}
        </View>

        {/* Matéria e pontuação */}
        <View className="flex-row gap-4 mb-2">
          <View style={{ flex: 2 }}>
            <SearchableSelect
              label="Matéria"
              value={qForm.subject_id}
              options={subjectOptions}
              onChange={(v) => setQField("subject_id", v)}
              placeholder="Selecione uma matéria"
              modalTitle="Selecionar matéria"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput
              label="Pontuação"
              value={qForm.points}
              onChangeText={(v) => setQField("points", v)}
              placeholder="1.0"
              keyboardType="numeric"
              error={qErrors.points}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput
              label="Ordem"
              value={qForm.order}
              onChangeText={(v) => setQField("order", v)}
              placeholder="Auto"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* URLs opcionais */}
        <FormInput
          label="URL da Imagem (opcional)"
          value={qForm.image_url}
          onChangeText={(v) => setQField("image_url", v)}
          placeholder="https://..."
          keyboardType="url"
        />
        <FormInput
          label="URL do Vídeo (opcional)"
          value={qForm.video_url}
          onChangeText={(v) => setQField("video_url", v)}
          placeholder="https://..."
          keyboardType="url"
        />

        {/* Gabarito / explicação */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">Explicação / Gabarito (opcional)</Text>
          <textarea
            value={qForm.explanation}
            onChange={(e: any) => setQField("explanation", e.target.value)}
            placeholder="Explicação da resposta correta..."
            style={inputStyle}
            rows={2}
          />
        </View>

        {/* Opções – somente objetiva */}
        {qForm.type === "multiple_choice" && (
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-semibold text-gray-700">Opções</Text>
              <TouchableOpacity onPress={addOption} activeOpacity={0.7} className="flex-row items-center gap-1">
                <Ionicons name="add-circle-outline" size={16} color="#7C3AED" />
                <Text className="text-xs text-violet-600 font-semibold">Adicionar opção</Text>
              </TouchableOpacity>
            </View>

            {qErrors.options && (
              <Text className="text-xs text-red-500 mb-2">{qErrors.options}</Text>
            )}

            {qForm.options.map((opt, idx) => (
              <View key={idx} className="flex-row items-center gap-2 mb-2">
                {/* Botão de correta */}
                <TouchableOpacity onPress={() => markCorrect(idx)} activeOpacity={0.7}>
                  <Ionicons
                    name={opt.is_correct ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={opt.is_correct ? "#7C3AED" : "#D1D5DB"}
                  />
                </TouchableOpacity>

                {/* Input da opção */}
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={opt.option_text}
                    onChangeText={(v) => setOptionField(idx, "option_text", v)}
                    placeholder={`Opção ${idx + 1}`}
                    placeholderTextColor="#9CA3AF"
                    className={`border rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-gray-50 ${
                      opt.is_correct ? "border-violet-300" : "border-gray-200"
                    }`}
                  />
                </View>

                {/* Toggle triggers_text_input */}
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

                {/* Remover opção */}
                {qForm.options.length > 2 && (
                  <TouchableOpacity onPress={() => removeOption(idx)} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <Text className="text-xs text-gray-400 mt-1">
              Círculo: marca correta · Ícone de chat: ativa campo de texto para o aluno (ex: "Outro")
            </Text>
          </View>
        )}
      </Modal>

      {/* Confirm delete question */}
      <ConfirmModal
        visible={deleteQuestionId !== null}
        title="Remover questão"
        message="Tem certeza que deseja remover esta questão?"
        loading={deletingQuestion}
        onConfirm={deleteQuestion}
        onCancel={() => setDeleteQuestionId(null)}
      />
    </ScrollView>
  );
}
