import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import Modal from "../../components/ui/Modal";
import OfficialAssessmentGradesTable from "../../components/avaliacoes-oficiais/OfficialAssessmentGradesTable";
import OfficialAssessmentGradeStepper from "../../components/avaliacoes-oficiais/OfficialAssessmentGradeStepper";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { parseApiErrors } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import type {
  GradeDraftRow,
  OfficialAssessmentForm,
  OfficialAssessmentFormScreenProps,
} from "../../types/avaliacoesOficiais";

const EMPTY_FORM: OfficialAssessmentForm = {
  title: "",
  kind: "presencial_bimestral",
  assessment_date: "",
  school_class_id: "",
  subject_ids: [],
  exam_type_id: "",
  max_score: "10",
  weight: "1",
  counts_towards_report_card: true,
  notes: "",
};

const gradeRowKey = (studentId: number, subjectId: number) => `${studentId}-${subjectId}`;

function PublishSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row py-1.5 border-b border-gray-100">
      <Text className="text-xs font-semibold text-gray-500" style={{ width: 118 }}>
        {label}
      </Text>
      <Text className="text-xs font-medium text-gray-800 flex-1">{value}</Text>
    </View>
  );
}

export default function OfficialAssessmentFormScreen({
  navigate,
  assessmentId,
}: OfficialAssessmentFormScreenProps) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const isEdit = assessmentId != null;
  const [loading, setLoading] = useState(isEdit);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<OfficialAssessmentForm>(EMPTY_FORM);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [assessmentBackendId, setAssessmentBackendId] = useState<number | null>(assessmentId);
  const [grades, setGrades] = useState<GradeDraftRow[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ id: number; name: string }[]>([]);
  const [examTypes, setExamTypes] = useState<{ value: string; label: string }[]>([]);
  const [gradesModalVisible, setGradesModalVisible] = useState(false);
  const [gradesModalStudentId, setGradesModalStudentId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const kindOptions = useMemo(
    () => [
      { value: "presencial_bimestral", label: "Presencial bimestral" },
      { value: "presencial_recuperacao", label: "Presencial recuperação" },
      { value: "presencial_diagnostico", label: "Presencial diagnóstico" },
      { value: "presencial_final", label: "Presencial final" },
      { value: "outro", label: "Outro" },
    ],
    []
  );

  const loadDependencies = useCallback(async () => {
    const [classesRes, subjectsRes, examTypesRes] = await Promise.all([
      api.get("/school-classes", { params: { per_page: 200, status: "active" } }),
      api.get("/subjects", { params: { per_page: 200 } }),
      api.get("/admin/exam-types"),
    ]);

    const classesList = Array.isArray(classesRes.data?.data) ? classesRes.data.data : [];
    const subjectsList = Array.isArray(subjectsRes.data?.data) ? subjectsRes.data.data : [];
    const examTypesList = Array.isArray(examTypesRes.data?.body) ? examTypesRes.data.body : examTypesRes.data?.data ?? [];

    setClasses(classesList.map((c: any) => ({ value: String(c.id), label: String(c.name ?? `Turma #${c.id}`) })));
    setSubjectOptions(
      subjectsList
        .filter((s: any) => s?.id)
        .map((s: any) => ({
          id: Number(s.id),
          name: String(s.name ?? `Disciplina #${s.id}`),
        }))
    );
    setExamTypes((Array.isArray(examTypesList) ? examTypesList : []).map((e: any) => ({ value: String(e.id), label: String(e.label ?? e.slug ?? `Tipo #${e.id}`) })));
  }, []);

  const loadAssessment = useCallback(async () => {
    if (!assessmentId) return;
    const { data } = await api.get(`/official-assessments/${assessmentId}`);
    const body = data?.body ?? data?.data ?? data;
    setAssessmentBackendId(body.id);
    setStatus(body.status);
    const loadedSubjectIds = Array.isArray(body.subject_ids)
      ? body.subject_ids.map((id: unknown) => Number(id)).filter((id: number) => id > 0)
      : Array.isArray(body.subjects)
        ? body.subjects.map((s: any) => Number(s.id)).filter((id: number) => id > 0)
        : body.subject_id
          ? [Number(body.subject_id)]
          : [];

    setForm({
      title: body.title ?? "",
      kind: body.kind ?? "presencial_bimestral",
      assessment_date: isoToDisplay(body.assessment_date ?? ""),
      school_class_id: body.school_class_id ? String(body.school_class_id) : "",
      subject_ids: loadedSubjectIds,
      exam_type_id: body.exam_type_id ? String(body.exam_type_id) : "",
      max_score: body.max_score != null ? String(body.max_score) : "10",
      weight: body.weight != null ? String(body.weight) : "1",
      counts_towards_report_card: !!body.counts_towards_report_card,
      notes: body.notes ?? "",
    });
    const gradeRows = Array.isArray(body.grades) ? body.grades : [];
    setGrades(
      gradeRows
        .filter((g: any) => Number(g.subject_id) > 0)
        .map((g: any) => ({
          student_id: Number(g.student_id),
          subject_id: Number(g.subject_id),
          student_name: String(g.student?.name ?? `Aluno #${g.student_id}`),
          subject_name: String(g.subject?.name ?? `Disciplina #${g.subject_id}`),
          enrollment_number: g.student?.enrollment_number ?? null,
          enrollment_id: g.enrollment_id ?? null,
          is_absent: !!g.is_absent,
          grade: g.grade != null ? String(g.grade) : "",
          notes: g.notes ?? "",
        }))
    );
  }, [assessmentId]);

  const subjectNameById = useMemo(
    () => new Map(subjectOptions.map((s) => [s.id, s.name])),
    [subjectOptions]
  );

  const selectedSubjects = useMemo(
    () =>
      form.subject_ids
        .map((id) => subjectOptions.find((s) => s.id === id))
        .filter((s): s is { id: number; name: string } => !!s),
    [form.subject_ids, subjectOptions]
  );

  const gradesModalStudentName = useMemo(() => {
    if (gradesModalStudentId == null) return null;
    const row = grades.find((g) => g.student_id === gradesModalStudentId);
    return row?.student_name ?? null;
  }, [gradesModalStudentId, grades]);

  const publishSummary = useMemo(() => {
    const classLabel =
      classes.find((c) => c.value === form.school_class_id)?.label ?? "Não selecionada";
    const kindLabel =
      kindOptions.find((k) => k.value === form.kind)?.label ?? form.kind;
    const examTypeLabel = form.exam_type_id
      ? examTypes.find((e) => e.value === form.exam_type_id)?.label ?? "—"
      : null;
    const subjectNames =
      selectedSubjects.length > 0
        ? selectedSubjects.map((s) => s.name).join(", ")
        : "Nenhuma selecionada";

    const studentIds = new Set(grades.map((g) => g.student_id));
    let launchedCount = 0;
    studentIds.forEach((studentId) => {
      const complete = form.subject_ids.every((subjectId) => {
        const row = grades.find(
          (g) => g.student_id === studentId && g.subject_id === subjectId
        );
        if (!row) return false;
        if (row.is_absent) return true;
        return row.grade.trim() !== "";
      });
      if (complete) launchedCount += 1;
    });

    return {
      classLabel,
      kindLabel,
      examTypeLabel,
      subjectNames,
      title: form.title.trim() || "Sem título",
      assessmentDate: form.assessment_date || "—",
      maxScore: form.max_score || "—",
      weight: form.weight || "—",
      countsTowardsReportCard: form.counts_towards_report_card ? "Sim" : "Não",
      studentTotal: studentIds.size,
      launchedCount,
      pendingCount: Math.max(0, studentIds.size - launchedCount),
    };
  }, [form, classes, kindOptions, examTypes, selectedSubjects, grades]);

  const mergeGradeMatrix = useCallback(
    (
      students: Array<{
        student_id: number;
        student_name: string;
        enrollment_number: string | null;
        enrollment_id: number | null;
      }>,
      subjectIds: number[],
      previous: GradeDraftRow[]
    ): GradeDraftRow[] => {
      const prevMap = new Map(previous.map((g) => [gradeRowKey(g.student_id, g.subject_id), g]));
      const rows: GradeDraftRow[] = [];
      subjectIds.forEach((subjectId) => {
        students.forEach((student) => {
          const key = gradeRowKey(student.student_id, subjectId);
          rows.push(
            prevMap.get(key) ?? {
              ...student,
              subject_id: subjectId,
              subject_name: subjectNameById.get(subjectId) ?? `Disciplina #${subjectId}`,
              is_absent: false,
              grade: "",
              notes: "",
            }
          );
        });
      });
      return rows;
    },
    [subjectNameById]
  );

  const loadStudentsForClass = useCallback(
    async (schoolClassId: string, subjectIds: number[]) => {
      if (!schoolClassId || subjectIds.length === 0) {
        setGrades([]);
        return;
      }
      const { data } = await api.get("/reports/class-students", {
        params: { school_class_id: schoolClassId, per_page: 200 },
      });
      const items = Array.isArray(data?.body?.items) ? data.body.items : [];
      const active = items.filter((row: any) => String(row.enrollment_status ?? "").toLowerCase() === "active");
      const students: Array<{
        student_id: number;
        student_name: string;
        enrollment_number: string | null;
        enrollment_id: number | null;
      }> = [];
      const seen = new Set<number>();
      active.forEach((row: any) => {
        const id = Number(row.student_id);
        if (!Number.isFinite(id) || seen.has(id)) return;
        seen.add(id);
        const enrollmentIdRaw =
          row.enrollment_id ?? row.enrollment?.id ?? row.enrollment?.enrollment_id ?? null;
        const enrollmentId = Number(enrollmentIdRaw);
        students.push({
          student_id: id,
          student_name: String(row.student_name ?? `Aluno #${id}`),
          enrollment_number: row.enrollment_number ?? null,
          enrollment_id: Number.isFinite(enrollmentId) && enrollmentId > 0 ? enrollmentId : null,
        });
      });
      setGrades((prev) => mergeGradeMatrix(students, subjectIds, prev));
    },
    [mergeGradeMatrix]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoadFailed(false);
        await loadDependencies();
        await loadAssessment();
      } catch (e: any) {
        setLoadFailed(true);
        setToast({ visible: true, type: "error", message: e?.response?.data?.message ?? "Erro ao carregar tela." });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAssessment, loadDependencies]);

  useEffect(() => {
    if (form.school_class_id && form.subject_ids.length > 0 && status !== "published") {
      loadStudentsForClass(form.school_class_id, form.subject_ids).catch(() => undefined);
    }
  }, [form.school_class_id, form.subject_ids, status, loadStudentsForClass]);

  useEffect(() => {
    if (form.subject_ids.length === 0) {
      setGrades([]);
      return;
    }
    setGrades((prev) => {
      const students = new Map<
        number,
        {
          student_id: number;
          student_name: string;
          enrollment_number: string | null;
          enrollment_id: number | null;
        }
      >();
      prev.forEach((g) => {
        if (!students.has(g.student_id)) {
          students.set(g.student_id, {
            student_id: g.student_id,
            student_name: g.student_name,
            enrollment_number: g.enrollment_number,
            enrollment_id: g.enrollment_id,
          });
        }
      });
      if (students.size === 0) return [];
      return mergeGradeMatrix(Array.from(students.values()), form.subject_ids, prev);
    });
  }, [form.subject_ids, mergeGradeMatrix]);

  const toggleSubject = (subjectId: number) => {
    setForm((prev) => ({
      ...prev,
      subject_ids: prev.subject_ids.includes(subjectId)
        ? prev.subject_ids.filter((id) => id !== subjectId)
        : [...prev.subject_ids, subjectId],
    }));
  };

  const setField = (key: keyof OfficialAssessmentForm, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (isEdit && loadFailed) {
      setToast({
        visible: true,
        type: "error",
        message: "Não foi possível carregar a avaliação para edição. Recarregue a tela antes de salvar.",
      });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const payload = {
        title: form.title.trim(),
        kind: form.kind,
        assessment_date: displayToISO(form.assessment_date) || form.assessment_date,
        school_class_id: Number(form.school_class_id),
        subject_ids: form.subject_ids,
        exam_type_id: form.exam_type_id ? Number(form.exam_type_id) : null,
        max_score: Number(form.max_score),
        weight: Number(form.weight),
        counts_towards_report_card: form.counts_towards_report_card,
        notes: form.notes.trim() || null,
      };
      if (assessmentBackendId) {
        await api.put(`/official-assessments/${assessmentBackendId}`, payload);
      } else {
        const { data } = await api.post("/official-assessments", payload);
        const body = data?.body ?? data?.data ?? data;
        setAssessmentBackendId(Number(body.id));
      }
      setToast({ visible: true, type: "success", message: "Avaliação salva com sucesso." });
    } catch (e: any) {
      const parsed = parseApiErrors(e?.response?.data?.body?.errors ?? e?.response?.data?.errors ?? {});
      setErrors(parsed);
      setToast({ visible: true, type: "error", message: e?.response?.data?.message ?? "Erro ao salvar avaliação." });
    } finally {
      setSaving(false);
    }
  };

  const saveGrades = async () => {
    if (isEdit && loadFailed) {
      setToast({
        visible: true,
        type: "error",
        message: "Não foi possível carregar a avaliação para edição. Recarregue a tela antes de salvar notas.",
      });
      return;
    }
    if (!assessmentBackendId) {
      setToast({ visible: true, type: "error", message: "Salve a avaliação antes de lançar notas." });
      return;
    }
    setSavingGrades(true);
    const isIndividual = gradesModalStudentId != null;
    const rowsToSave = isIndividual
      ? grades.filter((g) => g.student_id === gradesModalStudentId)
      : grades;
    try {
      const payload = {
        grades: rowsToSave.map((g) => ({
          student_id: g.student_id,
          subject_id: g.subject_id,
          enrollment_id: g.enrollment_id,
          grade: g.is_absent || !g.grade ? null : Number(g.grade),
          is_absent: g.is_absent,
          notes: g.notes.trim() || null,
        })),
      };
      await api.post(`/official-assessments/${assessmentBackendId}/grades`, payload);
      closeGradesModal();
      setToast({
        visible: true,
        type: "success",
        message: isIndividual ? "Nota do aluno salva com sucesso." : "Notas salvas com sucesso.",
      });
    } catch (e: any) {
      setToast({ visible: true, type: "error", message: e?.response?.data?.message ?? "Erro ao salvar notas." });
    } finally {
      setSavingGrades(false);
    }
  };

  const publish = async () => {
    if (isEdit && loadFailed) {
      setToast({
        visible: true,
        type: "error",
        message: "Não foi possível carregar a avaliação para edição. Recarregue a tela antes de publicar.",
      });
      return;
    }
    if (!assessmentBackendId) return;
    setPublishing(true);
    try {
      await api.post(`/official-assessments/${assessmentBackendId}/publish`);
      setStatus("published");
      setToast({ visible: true, type: "success", message: "Avaliação publicada com sucesso." });
    } catch (e: any) {
      setToast({ visible: true, type: "error", message: e?.response?.data?.message ?? "Erro ao publicar." });
    } finally {
      setPublishing(false);
      setPublishModalVisible(false);
    }
  };

  const updateGradeField = (studentId: number, subjectId: number, patch: Partial<GradeDraftRow>) => {
    setGrades((prev) =>
      prev.map((g) =>
        g.student_id === studentId && g.subject_id === subjectId ? { ...g, ...patch } : g
      )
    );
  };

  const closeGradesModal = () => {
    setGradesModalVisible(false);
    setGradesModalStudentId(null);
  };

  const openGradesModal = (studentId?: number) => {
    if (!assessmentBackendId) {
      setToast({ visible: true, type: "error", message: "Salve a avaliação antes de lançar notas." });
      return;
    }
    if (!form.school_class_id) {
      setToast({ visible: true, type: "error", message: "Selecione uma turma." });
      return;
    }
    if (form.subject_ids.length === 0) {
      setToast({ visible: true, type: "error", message: "Selecione ao menos uma disciplina." });
      return;
    }
    setGradesModalStudentId(studentId ?? null);
    setGradesModalVisible(true);
  };

  const pageTitle = isEdit ? "Editar avaliação" : "Nova avaliação";
  const cardShadow = {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  } as const;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (isEdit && loadFailed) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
      >
        <ScreenBreadcrumb
          items={[
            { label: "Avaliações presenciais", onPress: () => navigate("avaliacoes-oficiais") },
            { label: "Erro ao carregar" },
          ]}
        />
        <View
          className="bg-white rounded-2xl p-6 items-center"
          style={cardShadow}
        >
          <Ionicons name="alert-circle-outline" size={40} color="#E5E7EB" />
          <Text className="text-base font-semibold text-gray-900 text-center mt-3">
            Não foi possível carregar esta avaliação.
          </Text>
          <Text className="text-sm text-gray-500 text-center mt-2">
            Verifique sua conexão e tente novamente para evitar sobrescrever dados existentes.
          </Text>
          <TouchableOpacity
            onPress={() => navigate("avaliacoes-oficiais")}
            className="mt-5 px-5 py-2.5 rounded-xl border border-gray-200"
            activeOpacity={0.8}
          >
            <Text className="text-sm font-semibold text-gray-700">Voltar para lista</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBreadcrumb
        items={[
          { label: "Avaliações presenciais", onPress: () => navigate("avaliacoes-oficiais") },
          { label: pageTitle },
        ]}
      />

      <View
        className="mb-6"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-800">{pageTitle}</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Cadastro da avaliação e lançamento de notas para o boletim
          </Text>
        </View>
        <Badge
          slug={status}
          label={status === "published" ? "Publicada" : "Rascunho"}
        />
      </View>

      <View className="bg-white rounded-2xl p-6 mb-5" style={cardShadow}>
        <View className="flex-row items-center gap-2 mb-5">
          <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
            <Ionicons name="clipboard-outline" size={16} color="#7C3AED" />
          </View>
          <Text className="text-base font-semibold text-gray-800">Dados da avaliação</Text>
        </View>

        <SearchableSelect
          label="Turma"
          required
          value={form.school_class_id}
          options={classes}
          onChange={(v) => setField("school_class_id", v)}
          placeholder="Selecione a turma..."
          modalTitle="Selecionar turma"
          error={errors.school_class_id}
        />

        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 mb-1">
            Disciplinas <Text className="text-red-500">*</Text>
          </Text>
          <Text className="text-xs text-gray-400 mb-3">
            Selecione as disciplinas avaliadas. O lançamento de notas é feito por disciplina.
          </Text>
          {subjectOptions.length === 0 ? (
            <Text className="text-sm text-gray-400">Nenhuma disciplina disponível</Text>
          ) : (
            <View className="gap-2">
              {subjectOptions.map((subject) => {
                const selected = form.subject_ids.includes(subject.id);
                const disabled = status === "published";
                return (
                  <TouchableOpacity
                    key={subject.id}
                    onPress={() => !disabled && toggleSubject(subject.id)}
                    activeOpacity={0.7}
                    disabled={disabled}
                    className={`flex-row items-center gap-3 px-4 py-3 rounded-xl border ${
                      selected ? "bg-violet-50 border-violet-200" : "bg-gray-50 border-gray-100"
                    }`}
                    style={{ opacity: disabled ? 0.65 : 1 }}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={20}
                      color={selected ? "#7C3AED" : "#9CA3AF"}
                    />
                    <Text
                      className={`text-sm font-medium ${
                        selected ? "text-violet-700" : "text-gray-700"
                      }`}
                    >
                      {subject.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {errors.subject_ids ? (
            <Text className="text-xs text-red-500 mt-1">{errors.subject_ids}</Text>
          ) : null}
          {form.subject_ids.length > 0 ? (
            <Text className="text-xs text-green-600 mt-2">
              {form.subject_ids.length} disciplina{form.subject_ids.length !== 1 ? "s" : ""} selecionada
              {form.subject_ids.length !== 1 ? "s" : ""}
            </Text>
          ) : null}
        </View>

        <FormInput
          label="Título"
          required
          value={form.title}
          onChangeText={(v) => setField("title", v)}
          error={errors.title}
        />
        <SearchableSelect
          label="Tipo"
          value={form.kind}
          options={kindOptions}
          onChange={(v) => setField("kind", v)}
          placeholder="Selecione o tipo..."
          showSelectedPreview={false}
        />
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: isMobile ? undefined : 0 }}>
            <DatePickerInput
              label="Data da avaliação"
              required
              value={form.assessment_date}
              onChangeText={(v) => setField("assessment_date", v)}
              error={errors.assessment_date}
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? undefined : 0 }}>
            <FormInput
              label="Nota máxima (soma das disciplinas)"
              value={form.max_score}
              onChangeText={(v) => setField("max_score", v)}
              error={errors.max_score}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? undefined : 0 }}>
            <FormInput
              label="Peso"
              value={form.weight}
              onChangeText={(v) => setField("weight", v)}
              error={errors.weight}
              keyboardType="numeric"
            />
          </View>
        </View>

        <SearchableSelect
          label="Classificação"
          value={form.exam_type_id}
          options={examTypes}
          onChange={(v) => setField("exam_type_id", v)}
          placeholder="Opcional"
          showSelectedPreview={false}
        />

        <FormInput
          label="Observações"
          value={form.notes}
          onChangeText={(v) => setField("notes", v)}
          multiline
          numberOfLines={3}
        />

        <View
          className="flex-row flex-wrap gap-3 pt-4 mt-2 border-t border-gray-100"
          style={{ justifyContent: isMobile ? "center" : "flex-start" }}
        >
          <TouchableOpacity
            onPress={() => navigate("avaliacoes-oficiais")}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white"
            activeOpacity={0.85}
          >
            <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={save}
            disabled={saving || status === "published"}
            className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
            activeOpacity={0.85}
            style={{ opacity: saving || status === "published" ? 0.6 : 1 }}
          >
            {saving ? <ActivityIndicator size="small" color="white" /> : null}
            <Text className="text-sm font-bold text-white">
              {saving ? "Salvando..." : "Salvar avaliação"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPublishModalVisible(true)}
            disabled={!assessmentBackendId || publishing || status === "published"}
            className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 ${
              status === "published" ? "bg-emerald-600" : "bg-amber-500"
            }`}
            activeOpacity={0.85}
            style={{ opacity: !assessmentBackendId || publishing || status === "published" ? 0.6 : 1 }}
          >
            <Ionicons
              name={status === "published" ? "checkmark-circle" : "megaphone-outline"}
              size={16}
              color="white"
            />
            <Text className="text-sm font-bold text-white">
              {status === "published" ? "Publicada" : "Publicar"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-white rounded-2xl p-6 mb-5" style={cardShadow}>
        <View
          className="mb-5"
          style={{
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View className="flex-row items-center gap-2 flex-1">
            <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
              <Ionicons name="school-outline" size={16} color="#7C3AED" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-800">Notas da turma</Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Resumo por aluno e disciplina. Lançamento em lote ou pelo ícone em cada linha.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => openGradesModal()}
            disabled={status === "published"}
            className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center justify-center gap-2"
            activeOpacity={0.85}
            style={{ opacity: status === "published" ? 0.6 : 1 }}
          >
            <Ionicons name="create-outline" size={16} color="white" />
            <Text className="text-sm font-bold text-white">Lançar notas</Text>
          </TouchableOpacity>
        </View>

        <OfficialAssessmentGradesTable
          subjects={selectedSubjects}
          grades={grades}
          isMobile={isMobile}
          readOnly={status === "published"}
          onLaunchIndividual={(studentId) => openGradesModal(studentId)}
        />
      </View>

      <Modal
        visible={gradesModalVisible}
        title={
          gradesModalStudentId != null
            ? `Lançar nota — ${gradesModalStudentName ?? "Aluno"}`
            : "Lançar notas"
        }
        onClose={closeGradesModal}
        size="lg"
        compact
        footer={
          <View
            className="flex-row flex-wrap gap-2"
            style={{ justifyContent: isMobile ? "center" : "flex-end" }}
          >
            <TouchableOpacity
              onPress={closeGradesModal}
              className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveGrades}
              disabled={!assessmentBackendId || savingGrades || status === "published"}
              className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
              activeOpacity={0.85}
              style={{
                opacity: !assessmentBackendId || savingGrades || status === "published" ? 0.6 : 1,
              }}
            >
              {savingGrades ? <ActivityIndicator size="small" color="white" /> : null}
              <Ionicons name="save-outline" size={16} color="white" />
              <Text className="text-sm font-bold text-white">
                {savingGrades
                  ? "Salvando..."
                  : gradesModalStudentId != null
                    ? "Salvar nota"
                    : "Salvar notas"}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        <OfficialAssessmentGradeStepper
          subjects={selectedSubjects}
          grades={grades}
          maxScore={form.max_score}
          readOnly={status === "published"}
          savingGrades={savingGrades}
          canSaveGrades={!!assessmentBackendId}
          focusStudentId={gradesModalStudentId}
          onUpdateGrade={updateGradeField}
          hideSaveButton
        />
      </Modal>

      <ConfirmModal
        visible={publishModalVisible}
        title="Publicar avaliação"
        message="Tem certeza que deseja publicar? Após publicar, as notas não poderão mais ser alteradas."
        confirmLabel="Sim, publicar"
        cancelLabel="Voltar"
        iconName="megaphone-outline"
        tone="primary"
        onConfirm={publish}
        onCancel={() => setPublishModalVisible(false)}
        loading={publishing}
        confirmDisabled={publishSummary.launchedCount === 0}
      >
        <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <Text className="text-xs font-bold text-gray-700 uppercase mb-1">Resumo da avaliação</Text>
          <PublishSummaryRow label="Título" value={publishSummary.title} />
          <PublishSummaryRow label="Turma" value={publishSummary.classLabel} />
          <PublishSummaryRow label="Disciplinas" value={publishSummary.subjectNames} />
          <PublishSummaryRow label="Data" value={publishSummary.assessmentDate} />
          <PublishSummaryRow label="Tipo" value={publishSummary.kindLabel} />
          {publishSummary.examTypeLabel ? (
            <PublishSummaryRow label="Classificação" value={publishSummary.examTypeLabel} />
          ) : null}
          <PublishSummaryRow
            label="Nota máxima"
            value={`${publishSummary.maxScore} (soma das disciplinas)`}
          />
          <PublishSummaryRow label="Peso" value={publishSummary.weight} />
          <PublishSummaryRow
            label="Boletim"
            value={publishSummary.countsTowardsReportCard}
          />
          <PublishSummaryRow
            label="Alunos"
            value={
              publishSummary.studentTotal > 0
                ? `${publishSummary.launchedCount} com lançamento completo de ${publishSummary.studentTotal}`
                : "Nenhum aluno carregado"
            }
          />
        </View>
        {publishSummary.launchedCount === 0 ? (
          <Text className="text-xs text-amber-700 font-semibold text-center mt-2">
            Lance ao menos uma nota antes de publicar.
          </Text>
        ) : publishSummary.pendingCount > 0 ? (
          <Text className="text-xs text-amber-700 text-center mt-2">
            Ainda há {publishSummary.pendingCount} aluno
            {publishSummary.pendingCount !== 1 ? "s" : ""} com lançamento pendente. Você pode
            publicar mesmo assim.
          </Text>
        ) : null}
      </ConfirmModal>

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />
    </ScrollView>
  );
}
