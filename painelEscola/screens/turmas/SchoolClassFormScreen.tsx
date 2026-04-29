import React, { useState, useEffect, useRef } from "react";
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
import { maskTime } from "../../utils/masks";
import FormInput from "../../components/ui/FormInput";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { usePeriods, domainToOptions } from "../../hooks/useDomains";

// ── Types ─────────────────────────────────────────────────────────────────────

type Course = { id: number; name: string };

type Schedule = {
  id: number;
  weekday: string;
  start_time: string;
  end_time: string;
  room: string | null;
};

type ClassForm = {
  course_id: string;
  name: string;
  year: string;
  period: string;
  capacity: string;
  status: string;
};

type ScheduleForm = {
  weekday: string;
  start_time: string;
  end_time: string;
  room: string;
};

const CURRENT_YEAR = String(new Date().getFullYear());

const EMPTY_CLASS: ClassForm = {
  course_id: "",
  name: "",
  year: CURRENT_YEAR,
  period: "",
  capacity: "",
  status: "active",
};

const EMPTY_SCHEDULE: ScheduleForm = {
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
  const periods = usePeriods();
  const periodOptions = domainToOptions(periods);

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
    (async () => {
      try {
        const { data } = await api.get("/courses", {
          params: { status: "active", per_page: 200 },
        });
        setCourses(data.data ?? []);
      } catch {}
    })();

    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/school-classes/${classId}`);
        setForm({
          course_id: String(data.course_id ?? data.course?.id ?? ""),
          name: data.name ?? "",
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
        name: form.name,
        status: form.status,
      };
      if (form.year) payload.year = Number(form.year);
      if (form.period) payload.period = form.period;
      if (form.capacity) payload.capacity = Number(form.capacity);

      if (isEdit) {
        await api.put(`/school-classes/${savedClassId}`, payload);
      } else {
        const { data } = await api.post("/school-classes", payload);
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
    setEditScheduleId(s.id);
    setScheduleForm({
      weekday: s.weekday,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      room: s.room ?? "",
    });
    setScheduleErrors({});
    setScheduleModal(true);
  };

  const saveSchedule = async () => {
    const e: Record<string, string> = {};
    if (!scheduleForm.start_time) e.start_time = "Hora de início obrigatória.";
    if (!scheduleForm.end_time) e.end_time = "Hora de término obrigatória.";
    if (Object.keys(e).length > 0) { setScheduleErrors(e); return; }

    setSavingSchedule(true);
    setScheduleErrors({});
    try {
      const payload = {
        weekday: scheduleForm.weekday,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        room: scheduleForm.room.trim() || undefined,
      };

      let updated: Schedule;
      if (editScheduleId) {
        const { data } = await api.put(`/class-schedules/${editScheduleId}`, payload);
        updated = data;
        setSchedules((prev) =>
          prev.map((s) => (s.id === editScheduleId ? updated : s))
        );
      } else {
        const { data } = await api.post(
          `/school-classes/${savedClassId}/schedules`,
          payload
        );
        updated = data;
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
              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                Curso <Text className="text-red-500">*</Text>
              </Text>
              <select
                value={form.course_id}
                onChange={(e: any) =>
                  setForm({ ...form, course_id: e.target.value })
                }
                style={{
                  width: "100%",
                  border: `1px solid ${errors.course_id ? "#EF4444" : "#E5E7EB"}`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontSize: 14,
                  color: form.course_id ? "#374151" : "#9CA3AF",
                  backgroundColor: "white",
                }}
              >
                <option value="">Selecione o curso</option>
                {courses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.course_id && (
                <Text className="text-xs text-red-500 mt-1">
                  {errors.course_id}
                </Text>
              )}
            </View>

            <FormInput
              label="Nome da Turma"
              required
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              error={errors.name}
              placeholder="Ex: TURMA 1"
            />

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
            <View
              className="bg-white rounded-2xl p-6"
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
          onChangeText={(v) => setScheduleForm({ ...scheduleForm, room: v })}
          error={scheduleErrors.room}
          placeholder="Ex: Sala 2"
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
