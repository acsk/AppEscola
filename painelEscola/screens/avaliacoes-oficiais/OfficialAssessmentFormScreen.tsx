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
  subject_id: "",
  exam_type_id: "",
  max_score: "10",
  weight: "1",
  counts_towards_report_card: true,
  notes: "",
};

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
  const [subjects, setSubjects] = useState<{ value: string; label: string }[]>([]);
  const [examTypes, setExamTypes] = useState<{ value: string; label: string }[]>([]);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const [selectedReportCard, setSelectedReportCard] = useState<{
    student: { id: number; name: string; enrollment_number?: string | null };
    summary: { assessments_count: number; absences_count: number; weighted_average: number | null };
  } | null>(null);
  const [loadingReportStudentId, setLoadingReportStudentId] = useState<number | null>(null);

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
      api.get("/school-classes", { params: { per_page: 200 } }),
      api.get("/subjects", { params: { per_page: 200 } }),
      api.get("/admin/exam-types"),
    ]);

    const classesList = Array.isArray(classesRes.data?.data) ? classesRes.data.data : [];
    const subjectsList = Array.isArray(subjectsRes.data?.data) ? subjectsRes.data.data : [];
    const examTypesList = Array.isArray(examTypesRes.data?.body) ? examTypesRes.data.body : examTypesRes.data?.data ?? [];

    setClasses(classesList.map((c: any) => ({ value: String(c.id), label: String(c.name ?? `Turma #${c.id}`) })));
    setSubjects(subjectsList.map((s: any) => ({ value: String(s.id), label: String(s.name ?? `Disciplina #${s.id}`) })));
    setExamTypes((Array.isArray(examTypesList) ? examTypesList : []).map((e: any) => ({ value: String(e.id), label: String(e.label ?? e.slug ?? `Tipo #${e.id}`) })));
  }, []);

  const loadAssessment = useCallback(async () => {
    if (!assessmentId) return;
    const { data } = await api.get(`/official-assessments/${assessmentId}`);
    const body = data?.body ?? data?.data ?? data;
    setAssessmentBackendId(body.id);
    setStatus(body.status);
    setForm({
      title: body.title ?? "",
      kind: body.kind ?? "presencial_bimestral",
      assessment_date: isoToDisplay(body.assessment_date ?? ""),
      school_class_id: body.school_class_id ? String(body.school_class_id) : "",
      subject_id: body.subject_id ? String(body.subject_id) : "",
      exam_type_id: body.exam_type_id ? String(body.exam_type_id) : "",
      max_score: body.max_score != null ? String(body.max_score) : "10",
      weight: body.weight != null ? String(body.weight) : "1",
      counts_towards_report_card: !!body.counts_towards_report_card,
      notes: body.notes ?? "",
    });
    const gradeRows = Array.isArray(body.grades) ? body.grades : [];
    setGrades(
      gradeRows.map((g: any) => ({
        student_id: Number(g.student_id),
        student_name: String(g.student?.name ?? `Aluno #${g.student_id}`),
        enrollment_number: g.student?.enrollment_number ?? null,
        enrollment_id: g.enrollment_id ?? null,
        is_absent: !!g.is_absent,
        grade: g.grade != null ? String(g.grade) : "",
        notes: g.notes ?? "",
      }))
    );
  }, [assessmentId]);

  const loadStudentsForClass = useCallback(async (schoolClassId: string) => {
    if (!schoolClassId) {
      setGrades([]);
      return;
    }
    const { data } = await api.get("/reports/class-students", {
      params: { school_class_id: schoolClassId, per_page: 200 },
    });
    const items = Array.isArray(data?.body?.items) ? data.body.items : [];
    const active = items.filter((row: any) => String(row.enrollment_status ?? "").toLowerCase() === "active");
    const dedup = new Map<number, GradeDraftRow>();
    active.forEach((row: any) => {
      const id = Number(row.student_id);
      if (!Number.isFinite(id) || dedup.has(id)) return;
      const enrollmentIdRaw =
        row.enrollment_id ??
        row.enrollment?.id ??
        row.enrollment?.enrollment_id ??
        null;
      const enrollmentId = Number(enrollmentIdRaw);
      dedup.set(id, {
        student_id: id,
        student_name: String(row.student_name ?? `Aluno #${id}`),
        enrollment_number: row.enrollment_number ?? null,
        enrollment_id: Number.isFinite(enrollmentId) && enrollmentId > 0 ? enrollmentId : null,
        is_absent: false,
        grade: "",
        notes: "",
      });
    });
    setGrades((prev) => {
      const byId = new Map(prev.map((g) => [g.student_id, g]));
      return Array.from(dedup.values()).map((g) => byId.get(g.student_id) ?? g);
    });
  }, []);

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
    if (!isEdit && form.school_class_id) {
      loadStudentsForClass(form.school_class_id).catch(() => undefined);
    }
  }, [form.school_class_id, isEdit, loadStudentsForClass]);

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
        subject_id: form.subject_id ? Number(form.subject_id) : null,
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
    try {
      const payload = {
        grades: grades.map((g) => ({
          student_id: g.student_id,
          enrollment_id: g.enrollment_id,
          grade: g.is_absent || !g.grade ? null : Number(g.grade),
          is_absent: g.is_absent,
          notes: g.notes.trim() || null,
        })),
      };
      await api.post(`/official-assessments/${assessmentBackendId}/grades`, payload);
      setToast({ visible: true, type: "success", message: "Notas salvas com sucesso." });
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

  const updateGradeField = (studentId: number, patch: Partial<GradeDraftRow>) => {
    setGrades((prev) => prev.map((g) => (g.student_id === studentId ? { ...g, ...patch } : g)));
  };

  const openStudentReportCard = async (studentId: number) => {
    setLoadingReportStudentId(studentId);
    try {
      const { data } = await api.get(`/students/${studentId}/report-card`);
      const body = data?.body ?? data?.data ?? data;
      setSelectedReportCard({
        student: {
          id: Number(body?.student?.id ?? studentId),
          name: String(body?.student?.name ?? `Aluno #${studentId}`),
          enrollment_number: body?.student?.enrollment_number ?? null,
        },
        summary: {
          assessments_count: Number(body?.summary?.assessments_count ?? 0),
          absences_count: Number(body?.summary?.absences_count ?? 0),
          weighted_average:
            body?.summary?.weighted_average == null
              ? null
              : Number(body.summary.weighted_average),
        },
      });
    } catch (e: any) {
      setToast({
        visible: true,
        type: "error",
        message: e?.response?.data?.message ?? "Erro ao carregar boletim do aluno.",
      });
    } finally {
      setLoadingReportStudentId(null);
    }
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
              label="Nota máxima"
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

        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: isMobile ? undefined : 0 }}>
            <SearchableSelect
              label="Disciplina"
              value={form.subject_id}
              options={subjects}
              onChange={(v) => setField("subject_id", v)}
              placeholder="Opcional"
              showSelectedPreview={false}
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? undefined : 0 }}>
            <SearchableSelect
              label="Classificação"
              value={form.exam_type_id}
              options={examTypes}
              onChange={(v) => setField("exam_type_id", v)}
              placeholder="Opcional"
              showSelectedPreview={false}
            />
          </View>
        </View>

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
        <View className="flex-row items-center gap-2 mb-5">
          <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
            <Ionicons name="school-outline" size={16} color="#7C3AED" />
          </View>
          <Text className="text-base font-semibold text-gray-800">Lançamento de notas</Text>
        </View>
        {selectedReportCard && (
          <View className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <Text className="text-sm font-semibold text-violet-900">
              Boletim: {selectedReportCard.student.name}
            </Text>
            <Text className="text-xs text-violet-700 mt-1">
              Avaliações publicadas: {selectedReportCard.summary.assessments_count} • Faltas:{" "}
              {selectedReportCard.summary.absences_count} • Média ponderada:{" "}
              {selectedReportCard.summary.weighted_average ?? "—"}
            </Text>
          </View>
        )}
        {grades.length === 0 ? (
          <Text className="text-sm text-gray-500">Selecione uma turma para carregar alunos.</Text>
        ) : (
          <View className="gap-2">
            {grades.map((g) => (
              <View key={g.student_id} className="border border-gray-200 rounded-xl p-3">
                <Text className="text-sm font-semibold text-gray-800">
                  {g.student_name} {g.enrollment_number ? `(${g.enrollment_number})` : ""}
                </Text>
                <TouchableOpacity
                  onPress={() => openStudentReportCard(g.student_id)}
                  disabled={loadingReportStudentId === g.student_id}
                  className="self-start mt-1"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-violet-700">
                    {loadingReportStudentId === g.student_id ? "Carregando boletim..." : "Ver boletim do aluno"}
                  </Text>
                </TouchableOpacity>
                <View className="flex-row gap-3 mt-2">
                  <View className="w-28">
                    <FormInput
                      label="Nota"
                      value={g.grade}
                      onChangeText={(v) => updateGradeField(g.student_id, { grade: v })}
                      editable={!g.is_absent && status !== "published"}
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => updateGradeField(g.student_id, { is_absent: !g.is_absent, grade: !g.is_absent ? "" : g.grade })}
                    disabled={status === "published"}
                    className={`h-10 mt-6 px-3 rounded-lg items-center justify-center ${
                      g.is_absent ? "bg-red-100" : "bg-gray-100"
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${g.is_absent ? "text-red-700" : "text-gray-700"}`}>
                      {g.is_absent ? "Faltou" : "Presente"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              onPress={saveGrades}
              disabled={!assessmentBackendId || savingGrades || status === "published"}
              className="mt-3 self-start px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
              activeOpacity={0.85}
              style={{
                opacity: !assessmentBackendId || savingGrades || status === "published" ? 0.6 : 1,
              }}
            >
              {savingGrades ? <ActivityIndicator size="small" color="white" /> : null}
              <Text className="text-sm font-bold text-white">
                {savingGrades ? "Salvando notas..." : "Salvar notas"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ConfirmModal
        visible={publishModalVisible}
        title="Publicar avaliação"
        message="Após publicar, as notas não poderão mais ser alteradas. Deseja continuar?"
        confirmLabel="Publicar agora"
        iconName="checkmark-circle-outline"
        tone="primary"
        onConfirm={publish}
        onCancel={() => setPublishModalVisible(false)}
        loading={publishing}
      />

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />
    </ScrollView>
  );
}
