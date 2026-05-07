import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import { maskTime, isoToDisplay, displayToISO } from "../../utils/masks";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { usePeriods, domainToOptions } from "../../hooks/useDomains";

// ── Types ─────────────────────────────────────────────────────────────────────

type Course = { id: number; name: string };
type Subject = { id: number; name: string };
type Teacher = { id: number; name: string };

type Schedule = {
  id: number;
  subject_id: number | null;
  teacher_id: number | null;
  teacher_ids?: number[];
  subject?: { id: number; name: string } | null;
  teacher?: { id: number; name: string } | null;
  teachers?: Array<{ id: number; name: string }>;
  weekday: string;
  start_time: string;
  end_time: string;
  room: string | null;
};

type ClassForm = {
  course_id: string;
  name: string;
  start_date: string;
  end_date: string;
  year: string;
  period: string;
  capacity: string;
  status: string;
};

type ScheduleForm = {
  subject_id: string;
  teacher_ids: string[];
  weekday: string;
  start_time: string;
  end_time: string;
  room: string;
};

const CURRENT_YEAR = String(new Date().getFullYear());

const EMPTY_CLASS: ClassForm = {
  course_id: "",
  name: "",
  start_date: "",
  end_date: "",
  year: CURRENT_YEAR,
  period: "",
  capacity: "",
  status: "active",
};

const EMPTY_SCHEDULE: ScheduleForm = {
  subject_id: "",
  teacher_ids: [],
  weekday: "monday",
  start_time: "",
  end_time: "",
  room: "",
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  classId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SchoolClassFormScreen({ classId, navigate }: Props) {
  const isEdit = classId !== null;
  const scrollRef = useRef<ScrollView>(null);

  // ── Lookup data ──────────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const periods = usePeriods();
  const periodOptions = domainToOptions(periods);

  const courseOptions = useMemo(
    () => courses.map((c) => ({ value: String(c.id), label: (c.name ?? "").toUpperCase() })),
    [courses]
  );

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ value: String(s.id), label: (s.name ?? "").toUpperCase() })),
    [subjects]
  );

  const teacherOptions = useMemo(
    () => teachers.map((t) => ({ value: String(t.id), label: (t.name ?? "").toUpperCase() })),
    [teachers]
  );

  const subjectNameById = useMemo(() => {
    const map = new Map<number, string>();
    subjects.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [subjects]);

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    teachers.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [teachers]);

  // ── Class form ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(isEdit);
  const [form, setForm] = useState<ClassForm>(EMPTY_CLASS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ── Schedules ────────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(EMPTY_SCHEDULE);
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [deleteScheduleId, setDeleteScheduleId] = useState<number | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  // Saved class id (after create)
  const [savedClassId, setSavedClassId] = useState<number | null>(classId);

  // ── Load on mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const extractList = (payload: any): any[] => {
      const root = payload?.body ?? payload;
      if (Array.isArray(root?.data)) return root.data;
      if (Array.isArray(root)) return root;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    };

    (async () => {
      try {
        const [{ data: coursesRaw }, { data: subjectsRaw }, { data: teachersRaw }] = await Promise.all([
          api.get("/courses", { params: { status: "active", per_page: 200 } }),
          api.get("/subjects", { params: { status: "active", per_page: 200 } }),
          api.get("/users", {
            params: { role: "professor", per_page: 200 },
          }),
        ]);

        const coursesData = extractList(coursesRaw);
        const subjectsData = extractList(subjectsRaw);
        const teachersData = extractList(teachersRaw);

        setCourses(Array.isArray(coursesData) ? coursesData : []);
        setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
        setTeachers(
          (Array.isArray(teachersData) ? teachersData : []).map((t: any) => ({
            id: t.id,
            name: t.name,
          }))
        );
      } catch {}
    })();

    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        const { data: raw } = await api.get(`/school-classes/${classId}`);
        const data = raw.body ?? raw;
        setForm({
          course_id: String(data.course_id ?? data.course?.id ?? ""),
          name: (data.name ?? "").toUpperCase(),
          start_date: data.start_date ?? "",
          end_date: data.end_date ?? "",
          year: String(data.year ?? CURRENT_YEAR),
          period: data.period ?? "",
          capacity: String(data.capacity ?? ""),
          status: data.status ?? "active",
        });
        const sorted = [...(data.schedules ?? [])].sort(
          (a, b) =>
            WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday)
        );
        setSchedules(sorted);
        setSavedClassId(classId);
      } catch {}
      setLoading(false);
    })();
  }, [classId]);

  // ── Save class ────────────────────────────────────────────────────────────────
  const saveClass = async () => {
    const localErrors: Record<string, string> = {};
    if (!form.course_id) localErrors.course_id = "Selecione o curso.";
    if (!form.name.trim()) localErrors.name = "Nome é obrigatório.";
    if (!form.start_date) localErrors.start_date = "Data de início é obrigatória.";
    if (!form.end_date) localErrors.end_date = "Data de término é obrigatória.";
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = {
        course_id: Number(form.course_id),
        name: form.name.toUpperCase(),
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
      };
      if (form.year) payload.year = Number(form.year);
      if (form.period) payload.period = form.period;
      if (form.capacity) payload.capacity = Number(form.capacity);

      if (isEdit) {
        await api.put(`/school-classes/${savedClassId}`, payload);
      } else {
        const { data: raw } = await api.post("/school-classes", payload);
        const data = raw.body ?? raw;
        setSavedClassId(data.id);
        setSchedules(data.schedules ?? []);
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data.errors ?? {}));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }
    setSaving(false);
  };

  // ── Schedule CRUD ─────────────────────────────────────────────────────────────
  const openAddSchedule = () => {
    setEditScheduleId(null);
    setScheduleForm(EMPTY_SCHEDULE);
    setScheduleErrors({});
    setScheduleModal(true);
  };

  const openEditSchedule = (s: Schedule) => {
    const teacherIds =
      Array.isArray(s.teacher_ids) && s.teacher_ids.length > 0
        ? s.teacher_ids.map((id) => String(id))
        : Array.isArray(s.teachers) && s.teachers.length > 0
        ? s.teachers.map((t) => String(t.id))
        : s.teacher_id != null
        ? [String(s.teacher_id)]
        : [];

    setEditScheduleId(s.id);
    setScheduleForm({
      subject_id: s.subject_id != null ? String(s.subject_id) : "",
      teacher_ids: teacherIds,
      weekday: s.weekday,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      room: (s.room ?? "").toUpperCase(),
    });
    setScheduleErrors({});
    setScheduleModal(true);
  };

  const saveSchedule = async () => {
    const e: Record<string, string> = {};
    if (!scheduleForm.subject_id) e.subject_id = "Selecione a disciplina.";
    if (scheduleForm.teacher_ids.length === 0) e.teacher_ids = "Selecione ao menos um professor.";
    if (!scheduleForm.start_time) e.start_time = "Hora de início obrigatória.";
    if (!scheduleForm.end_time) e.end_time = "Hora de término obrigatória.";
    if (Object.keys(e).length > 0) { setScheduleErrors(e); return; }

    setSavingSchedule(true);
    setScheduleErrors({});
    try {
      const normalizedTeacherIds = scheduleForm.teacher_ids.map((id) => Number(id));

      const payload = {
        subject_id: Number(scheduleForm.subject_id),
        teacher_ids: normalizedTeacherIds,
        teacher_id: normalizedTeacherIds[0],
        weekday: scheduleForm.weekday,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        room: scheduleForm.room.trim().toUpperCase() || undefined,
      };

      let updated: Schedule;
      if (editScheduleId) {
        const { data: rawPut } = await api.put(`/class-schedules/${editScheduleId}`, payload);
        updated = rawPut.body ?? rawPut;
        setSchedules((prev) =>
          prev.map((s) => (s.id === editScheduleId ? updated : s))
        );
      } else {
        const { data: rawPost } = await api.post(
          `/school-classes/${savedClassId}/schedules`,
          payload
        );
        updated = rawPost.body ?? rawPost;
        setSchedules((prev) =>
          [...prev, updated].sort(
            (a, b) =>
              WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday)
          )
        );
      }
      setScheduleModal(false);
    } catch (err: any) {
      if (err.response?.status === 422) {
        setScheduleErrors(parseApiErrors(err.response.data.errors ?? {}));
      }
    }
    setSavingSchedule(false);
  };

  const deleteSchedule = async () => {
    if (!deleteScheduleId) return;
    setDeletingSchedule(true);
    try {
      await api.delete(`/class-schedules/${deleteScheduleId}`);
      setSchedules((prev) => prev.filter((s) => s.id !== deleteScheduleId));
      setDeleteScheduleId(null);
    } catch {}
    setDeletingSchedule(false);
  };

  const fmtTime = (t: string) => t.slice(0, 5);


  const toggleScheduleTeacher = (teacherId: string) => {
    setScheduleForm((prev) => ({
      ...prev,
      teacher_ids: prev.teacher_ids.includes(teacherId)
        ? prev.teacher_ids.filter((id) => id !== teacherId)
        : [...prev.teacher_ids, teacherId],
    }));
    setScheduleErrors((prev) => ({ ...prev, teacher_ids: "" }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Breadcrumb */}
      <View className="flex-row items-center gap-2 mb-6">
        <TouchableOpacity
          onPress={() => navigate("turmas")}
          className="flex-row items-center gap-1.5"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Turmas</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">
          {isEdit ? "Editar Turma" : "Nova Turma"}
        </Text>
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">
          {isEdit ? "Editar Turma" : "Nova Turma"}
        </Text>
        <Text className="text-sm text-gray-500">
          Dados da turma e horários de aula
        </Text>
      </View>

      {!!savedClassId && (
        <View className="flex-row gap-3 mb-5">
          <View className="px-4 py-2.5 rounded-xl bg-violet-600">
            <Text className="text-sm font-semibold text-white">Dados e Horários</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigate("turmas-frequencia", { classId: savedClassId })}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
            activeOpacity={0.8}
          >
            <Text className="text-sm font-semibold text-gray-700">Frequência</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <View>
          {/* ── Card: Dados da Turma ── */}
          <View
            className="bg-white rounded-2xl p-6 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
                <Ionicons name="grid-outline" size={16} color="#7C3AED" />
              </View>
              <Text className="text-base font-semibold text-gray-800">
                Dados da Turma
              </Text>
            </View>

            {/* Curso */}
            <View className="mb-3">
              <SearchableSelect
                label="Curso"
                required
                value={form.course_id}
                onChange={(value) => {
                  setForm({ ...form, course_id: value });
                  setErrors((prev) => ({ ...prev, course_id: "" }));
                }}
                options={courseOptions}
                placeholder="SELECIONE O CURSO"
                modalTitle="Selecionar Curso"
                error={errors.course_id}
              />
            </View>

            <FormInput
              label="Nome da Turma"
              required
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v.toUpperCase() })}
              error={errors.name}
              placeholder="EX: TURMA 1"
            />

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <DatePickerInput
                  label="Data de Início"
                  required
                  value={isoToDisplay(form.start_date)}
                  onChangeText={(v) => setForm({ ...form, start_date: displayToISO(v) })}
                  error={errors.start_date}
                />
              </View>
              <View className="flex-1">
                <DatePickerInput
                  label="Data de Término"
                  required
                  value={isoToDisplay(form.end_date)}
                  onChangeText={(v) => setForm({ ...form, end_date: displayToISO(v) })}
                  error={errors.end_date}
                />
              </View>
            </View>

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <FormInput
                  label="Ano Letivo"
                  value={form.year}
                  onChangeText={(v) => setForm({ ...form, year: v })}
                  error={errors.year}
                  placeholder="2026"
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 mb-1.5">
                  Período
                </Text>
                <select
                  value={form.period}
                  onChange={(e: any) =>
                    setForm({ ...form, period: e.target.value })
                  }
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: form.period ? "#374151" : "#9CA3AF",
                    backgroundColor: "white",
                  }}
                >
                  <option value="">Selecione o período</option>
                  {periodOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            <View className="flex-row gap-4 mt-1">
              <View className="flex-1">
                <FormInput
                  label="Capacidade"
                  value={form.capacity}
                  onChangeText={(v) => setForm({ ...form, capacity: v })}
                  error={errors.capacity}
                  placeholder="Ex: 20"
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 mb-1.5">
                  Status
                </Text>
                <select
                  value={form.status}
                  onChange={(e: any) =>
                    setForm({ ...form, status: e.target.value })
                  }
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: "#374151",
                    backgroundColor: "white",
                  }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            {/* Save class button */}
            <View className="flex-row justify-end gap-3 mt-4">
              <TouchableOpacity
                onPress={() => navigate("turmas")}
                className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white"
                activeOpacity={0.8}
              >
                <Text className="text-sm font-semibold text-gray-700">
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveClass}
                disabled={saving}
                className="flex-row items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600"
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="white" />
                    <Text className="text-sm font-bold text-white">
                      {isEdit ? "Salvar Alterações" : "Criar Turma"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Card: Horários ── */}
          {savedClassId ? (
            <>
              <View
                className="bg-white rounded-2xl p-6 mb-5"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  elevation: 1,
                }}
              >
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 bg-amber-100 rounded-lg items-center justify-center">
                    <Ionicons name="time-outline" size={16} color="#D97706" />
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-gray-800">
                      Horários
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {schedules.length} horário
                      {schedules.length !== 1 ? "s" : ""} cadastrado
                      {schedules.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={openAddSchedule}
                  className="flex-row items-center gap-1.5 bg-amber-500 px-4 py-2 rounded-xl"
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="white" />
                  <Text className="text-sm font-semibold text-white">
                    Adicionar Horário
                  </Text>
                </TouchableOpacity>
              </View>

              {schedules.length === 0 ? (
                <View className="items-center py-8">
                  <Ionicons name="time-outline" size={32} color="#E5E7EB" />
                  <Text className="text-gray-400 text-sm mt-2">
                    Nenhum horário cadastrado
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    Clique em "Adicionar Horário" para começar
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {schedules.map((s) => (
                    <View
                      key={s.id}
                      className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3"
                    >
                      <View className="w-28">
                        <Text className="text-sm font-semibold text-violet-700">
                          {WEEKDAY_LABELS[s.weekday] ?? s.weekday}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5 flex-1">
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color="#6B7280"
                        />
                        <Text className="text-sm text-gray-700">
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs text-gray-600" numberOfLines={1}>
                          {s.subject?.name ?? (s.subject_id ? subjectNameById.get(s.subject_id) : null) ?? "Sem disciplina"}
                        </Text>
                        <Text className="text-xs text-gray-500" numberOfLines={1}>
                          {Array.isArray(s.teachers) && s.teachers.length > 0
                            ? s.teachers.map((t) => t.name).join(", ")
                            : Array.isArray(s.teacher_ids) && s.teacher_ids.length > 0
                            ? s.teacher_ids
                                .map((id) => teacherNameById.get(id))
                                .filter(Boolean)
                                .join(", ") || "Sem professor"
                            : s.teacher?.name ?? (s.teacher_id ? teacherNameById.get(s.teacher_id) : null) ?? "Sem professor"}
                        </Text>
                      </View>
                      {s.room && (
                        <View className="flex-row items-center gap-1 flex-1">
                          <Ionicons
                            name="location-outline"
                            size={13}
                            color="#9CA3AF"
                          />
                          <Text className="text-xs text-gray-500">{s.room}</Text>
                        </View>
                      )}
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => openEditSchedule(s)}
                          className="p-1.5 bg-violet-50 rounded-lg"
                        >
                          <Ionicons
                            name="pencil-outline"
                            size={14}
                            color="#7C3AED"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setDeleteScheduleId(s.id)}
                          className="p-1.5 bg-red-50 rounded-lg"
                        >
                          <Ionicons
                            name="trash-outline"
                            size={14}
                            color="#EF4444"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              </View>

            </>
          ) : (
            <View className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex-row items-center gap-3">
              <Ionicons name="information-circle-outline" size={20} color="#3B82F6" />
              <Text className="text-sm text-blue-600 flex-1">
                Após criar a turma, você poderá adicionar os horários de aula.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Schedule modal */}
      <Modal
        visible={scheduleModal}
        title={editScheduleId ? "Editar Horário" : "Novo Horário"}
        onClose={() => setScheduleModal(false)}
        size="md"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setScheduleModal(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveSchedule}
              disabled={savingSchedule}
              className="px-5 py-2.5 rounded-xl bg-amber-500"
            >
              {savingSchedule ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <View className="mb-3">
          <SearchableSelect
            label="Disciplina"
            required
            value={scheduleForm.subject_id}
            onChange={(value) => {
              setScheduleForm({ ...scheduleForm, subject_id: value });
              setScheduleErrors((prev) => ({ ...prev, subject_id: "" }));
            }}
            options={subjectOptions}
            placeholder="SELECIONE A DISCIPLINA"
            modalTitle="Selecionar Disciplina"
            error={scheduleErrors.subject_id}
          />
        </View>

        <View className="mb-3">
          <Text className="text-xs font-medium text-gray-600 mb-1.5">
            Professores <Text className="text-red-500">*</Text>
          </Text>

          <View
            style={{
              borderWidth: 1,
              borderColor: scheduleErrors.teacher_ids ? "#EF4444" : "#E5E7EB",
              borderRadius: 8,
              padding: 10,
              maxHeight: 180,
              backgroundColor: "white",
            }}
          >
            <ScrollView>
              {teachers.map((t) => {
                const value = String(t.id);
                const selected = scheduleForm.teacher_ids.includes(value);

                return (
                  <TouchableOpacity
                    key={t.id}
                    className="flex-row items-center py-1.5"
                    onPress={() => toggleScheduleTeacher(value)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={18}
                      color={selected ? "#7C3AED" : "#9CA3AF"}
                    />
                    <Text className="text-sm text-gray-700 ml-2">{t.name.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {!!scheduleErrors.teacher_ids && (
            <Text className="text-xs text-red-500 mt-1">{scheduleErrors.teacher_ids}</Text>
          )}

          {teachers.length === 0 && (
            <Text className="text-xs text-amber-600 mt-1">
              Nenhum professor encontrado. Verifique se há usuários com perfil PROFESSOR.
            </Text>
          )}
        </View>

        <View className="mb-3">
          <Text className="text-xs font-medium text-gray-600 mb-1.5">
            Dia da Semana <Text className="text-red-500">*</Text>
          </Text>
          <select
            value={scheduleForm.weekday}
            onChange={(e: any) =>
              setScheduleForm({ ...scheduleForm, weekday: e.target.value })
            }
            style={{
              width: "100%",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "white",
            }}
          >
            {WEEKDAY_ORDER.map((w) => (
              <option key={w} value={w}>
                {WEEKDAY_LABELS[w]}
              </option>
            ))}
          </select>
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Hora de Início"
              required
              value={scheduleForm.start_time}
              onChangeText={(v) =>
                setScheduleForm({ ...scheduleForm, start_time: maskTime(v) })
              }
              error={scheduleErrors.start_time}
              placeholder="14:00"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Hora de Término"
              required
              value={scheduleForm.end_time}
              onChangeText={(v) =>
                setScheduleForm({ ...scheduleForm, end_time: maskTime(v) })
              }
              error={scheduleErrors.end_time}
              placeholder="15:30"
              keyboardType="numeric"
            />
          </View>
        </View>

        <FormInput
          label="Sala"
          value={scheduleForm.room}
          onChangeText={(v) => setScheduleForm({ ...scheduleForm, room: v.toUpperCase() })}
          error={scheduleErrors.room}
          placeholder="EX: SALA 2"
        />
      </Modal>

      <ConfirmModal
        visible={!!deleteScheduleId}
        title="Remover Horário"
        message="Este horário será removido permanentemente."
        onConfirm={deleteSchedule}
        onCancel={() => setDeleteScheduleId(null)}
        loading={deletingSchedule}
      />
    </ScrollView>
  );
}
