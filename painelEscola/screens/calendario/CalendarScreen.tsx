import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DateTimePickerInput from "../../components/ui/DateTimePickerInput";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import MessageModal from "../../components/ui/MessageModal";
import { parseApiErrors } from "../../utils/apiErrors";
import { displayDateTimeToISO, isoToDisplayDateTime } from "../../utils/masks";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  fetchCalendarTypes,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarEventType,
  type CalendarPayload,
} from "../../services/calendar";
import type { WithNavigate } from "../../types/navigation";
import CalendarColorLegend from "../../components/calendar/CalendarColorLegend";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type FormState = {
  type: CalendarEventType;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  all_day: string;
  audience_type: string;
  course_id: string;
  school_class_id: string;
  location: string;
};

const EMPTY_FORM: FormState = {
  type: "school",
  title: "",
  description: "",
  starts_at: "",
  ends_at: "",
  all_day: "false",
  audience_type: "tenant",
  course_id: "",
  school_class_id: "",
  location: "",
};

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventsOnDay(events: CalendarEvent[], day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return events.filter((ev) => {
    const a = new Date(ev.starts_at);
    const b = ev.ends_at ? new Date(ev.ends_at) : a;
    return a <= end && b >= start;
  });
}

export default function CalendarScreen({ navigate: _navigate }: WithNavigate) {
  const { contentPadding } = useResponsiveLayout();
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [typesMeta, setTypesMeta] = useState<Record<string, { label: string; color: string }>>({});
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [message, setMessage] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({ visible: false, type: "info", title: "", message: "" });

  const rangeFrom = toKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const rangeTo = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCalendarEvents(rangeFrom, rangeTo);
      setEvents(res.items ?? []);
    } catch {
      setEvents([]);
    }
    setLoading(false);
  }, [rangeFrom, rangeTo]);

  const loadMeta = useCallback(async () => {
    try {
      const [typesRes, coursesRes, classesRes] = await Promise.all([
        fetchCalendarTypes(),
        api.get("/courses", { params: { status: "active", per_page: 500 } }),
        api.get("/school-classes", { params: { status: "active", per_page: 500 } }),
      ]);
      setTypesMeta(typesRes.types ?? {});
      const coursesList = coursesRes.data?.body ?? coursesRes.data;
      const classesList = classesRes.data?.body ?? classesRes.data;
      const courseRows = Array.isArray(coursesList?.data) ? coursesList.data : coursesList ?? [];
      const classRows = Array.isArray(classesList?.data) ? classesList.data : classesList ?? [];
      setCourses(courseRows.map((c: any) => ({ id: Number(c.id), name: String(c.name) })));
      setClasses(classRows.map((c: any) => ({ id: Number(c.id), name: String(c.name) })));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const weeks = useMemo(() => {
    const start = monthStart(month);
    const offset = start.getDay() === 0 ? 6 : start.getDay() - 1;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const dayEvents = useMemo(() => eventsOnDay(events, selectedDay), [events, selectedDay]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      starts_at: isoToDisplayDateTime(
        new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 9, 0).toISOString()
      ),
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    if (!event.is_editable) {
      setMessage({
        visible: true,
        type: "info",
        title: "Evento sincronizado",
        message:
          event.source_type === "invoice"
            ? "Este evento veio de uma cobrança. Altere o vencimento ou status na tela de cobranças."
            : "Este evento veio de um simulado. Edite as datas no cadastro do simulado.",
      });
      return;
    }
    setEditing(event);
    setForm({
      type: event.type,
      title: event.title,
      description: event.description ?? "",
      starts_at: isoToDisplayDateTime(event.starts_at),
      ends_at: event.ends_at ? isoToDisplayDateTime(event.ends_at) : "",
      all_day: event.all_day ? "true" : "false",
      audience_type: event.audience_type,
      course_id: event.course_id ? String(event.course_id) : "",
      school_class_id: event.school_class_id ? String(event.school_class_id) : "",
      location: event.location ?? "",
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const buildPayload = (): CalendarPayload => ({
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    starts_at: displayDateTimeToISO(form.starts_at),
    ends_at: form.ends_at.trim() ? displayDateTimeToISO(form.ends_at) : null,
    all_day: form.all_day === "true",
    audience_type: form.audience_type as CalendarPayload["audience_type"],
    course_id: form.course_id ? Number(form.course_id) : null,
    school_class_id: form.school_class_id ? Number(form.school_class_id) : null,
    location: form.location.trim() || undefined,
    is_published: true,
  });

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = buildPayload();
      if (editing) {
        await updateCalendarEvent(editing.id, payload);
      } else {
        await createCalendarEvent(payload);
      }
      setModalOpen(false);
      loadEvents();
    } catch (e: any) {
      const raw = e?.response?.data?.errors ?? e?.response?.data?.body?.errors;
      if (raw) setFieldErrors(parseApiErrors(raw));
      setMessage({
        visible: true,
        type: "error",
        title: "Erro",
        message: e?.response?.data?.message ?? "Não foi possível salvar o evento.",
      });
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCalendarEvent(deleteTarget.id);
      setDeleteTarget(null);
      loadEvents();
    } catch (e: any) {
      setMessage({
        visible: true,
        type: "error",
        title: "Erro",
        message: e?.response?.data?.message ?? "Não foi possível remover.",
      });
    }
  };

  const typeOptions = Object.entries(typesMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#EEEEFF" }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Calendário</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Eventos, simulados e vencimentos (sincronizados automaticamente)
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center gap-2 bg-violet-600 px-4 py-2.5 rounded-xl"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-sm font-semibold text-white">Novo evento</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <Ionicons name="chevron-back" size={22} color="#7C3AED" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-800 capitalize">
            {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </Text>
          <TouchableOpacity
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <Ionicons name="chevron-forward" size={22} color="#7C3AED" />
          </TouchableOpacity>
        </View>

        <View className="flex-row mb-2">
          {WEEKDAYS.map((w) => (
            <Text key={w} className="flex-1 text-center text-xs font-bold text-gray-400">
              {w}
            </Text>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={`w-${wi}`} className="flex-row">
            {week.map((day, di) => {
              if (!day) {
                return <View key={`e-${wi}-${di}`} className="flex-1 h-12" />;
              }
              const selected =
                day.getDate() === selectedDay.getDate() &&
                day.getMonth() === selectedDay.getMonth();
              const dayItems = eventsOnDay(events, day);
              return (
                <TouchableOpacity
                  key={toKey(day)}
                  className={`flex-1 items-center py-1 rounded-lg ${selected ? "bg-violet-100" : ""}`}
                  onPress={() => setSelectedDay(day)}
                >
                  <Text className={`text-sm font-bold ${selected ? "text-violet-700" : "text-gray-700"}`}>
                    {day.getDate()}
                  </Text>
                  {dayItems.length > 0 ? (
                    <View className="flex-row gap-0.5 mt-1 justify-center">
                      {dayItems.slice(0, 3).map((ev) => (
                        <View
                          key={ev.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              ev.type_color ?? typesMeta[ev.type]?.color ?? "#7C3AED",
                          }}
                        />
                      ))}
                    </View>
                  ) : (
                    <View className="h-1.5 mt-1" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <CalendarColorLegend typesMeta={typesMeta} />
      </View>

      <Text className="text-base font-bold text-gray-800 mb-2 capitalize">
        {selectedDay.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
      </Text>

      {loading ? (
        <ActivityIndicator color="#7C3AED" />
      ) : dayEvents.length === 0 ? (
        <Text className="text-sm text-gray-500">Nenhum evento neste dia.</Text>
      ) : (
        dayEvents.map((ev) => (
          <TouchableOpacity
            key={ev.id}
            onPress={() => openEdit(ev)}
            className="bg-white border border-gray-100 rounded-xl p-4 mb-2 flex-row items-start gap-3"
          >
            <View
              style={{
                width: 4,
                alignSelf: "stretch",
                borderRadius: 2,
                backgroundColor: ev.type_color ?? typesMeta[ev.type]?.color ?? "#7C3AED",
              }}
            />
            <View className="flex-1">
              <Text className="text-xs font-bold text-gray-400">{ev.type_label}</Text>
              <Text className="text-base font-bold text-gray-800">{ev.title}</Text>
              <Text className="text-xs text-gray-500 mt-1">
                {new Date(ev.starts_at).toLocaleString("pt-BR")}
                {ev.source_type === "exam"
                  ? " · Sincronizado do simulado"
                  : ev.source_type === "invoice"
                  ? " · Vencimento de cobrança"
                  : ""}
              </Text>
            </View>
            {ev.is_editable ? (
              <TouchableOpacity onPress={() => setDeleteTarget(ev)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        ))
      )}

      <Modal
        visible={modalOpen}
        title={editing ? "Editar evento" : "Novo evento"}
        onClose={() => setModalOpen(false)}
        size="lg"
      >
        <FormSelect
          label="Tipo"
          value={form.type}
          options={typeOptions}
          onChange={(v) => setForm((p) => ({ ...p, type: v as CalendarEventType }))}
          required
        />
        <FormInput
          label="Título"
          value={form.title}
          onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
          error={fieldErrors.title}
          required
        />
        <FormInput
          label="Descrição"
          value={form.description}
          onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
          multiline
        />
        <DateTimePickerInput
          label="Início"
          value={form.starts_at}
          onChangeText={(v) => setForm((p) => ({ ...p, starts_at: v }))}
          error={fieldErrors.starts_at}
          required
        />
        <DateTimePickerInput
          label="Fim"
          value={form.ends_at}
          onChangeText={(v) => setForm((p) => ({ ...p, ends_at: v }))}
          error={fieldErrors.ends_at}
        />
        <FormInput
          label="Local"
          value={form.location}
          onChangeText={(v) => setForm((p) => ({ ...p, location: v }))}
          placeholder="Ex.: Sala 3 — unidade centro"
        />
        <FormSelect
          label="Público"
          value={form.audience_type}
          options={[
            { value: "tenant", label: "Toda a escola" },
            { value: "course", label: "Curso" },
            { value: "school_class", label: "Turma" },
          ]}
          onChange={(v) => setForm((p) => ({ ...p, audience_type: v }))}
        />
        {form.audience_type === "course" ? (
          <FormSelect
            label="Curso"
            value={form.course_id}
            options={courses.map((c) => ({ value: String(c.id), label: c.name }))}
            onChange={(v) => setForm((p) => ({ ...p, course_id: v }))}
            error={fieldErrors.course_id}
            required
          />
        ) : null}
        {form.audience_type === "school_class" ? (
          <FormSelect
            label="Turma"
            value={form.school_class_id}
            options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
            onChange={(v) => setForm((p) => ({ ...p, school_class_id: v }))}
            error={fieldErrors.school_class_id}
            required
          />
        ) : null}
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          className="mt-2 bg-violet-600 rounded-xl py-3 items-center"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">Salvar</Text>
          )}
        </TouchableOpacity>
      </Modal>

      <ConfirmModal
        visible={!!deleteTarget}
        title="Remover evento"
        message="Deseja remover este evento do calendário?"
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />

      <MessageModal
        visible={message.visible}
        type={message.type}
        title={message.title}
        message={message.message}
        onClose={() => setMessage((p) => ({ ...p, visible: false }))}
      />
    </ScrollView>
  );
}
