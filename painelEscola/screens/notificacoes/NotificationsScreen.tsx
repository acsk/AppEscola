import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import MessageModal from "../../components/ui/MessageModal";
import { parseApiErrors } from "../../utils/apiErrors";
import DateTimePickerInput from "../../components/ui/DateTimePickerInput";
import { displayDateTimeToISO } from "../../utils/masks";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  fetchNotificationBroadcasts,
  fetchNotificationSettings,
  fetchNotificationTypes,
  previewNotificationRecipients,
  sendNotification,
  updateNotificationCalendarSettings,
  type NotificationAudienceType,
  type NotificationBroadcast,
  type NotificationTypeKey,
  type SendNotificationPayload,
} from "../../services/notifications";
import type { WithNavigate } from "../../types/navigation";

const AUDIENCE_LABELS: Record<NotificationAudienceType, string> = {
  tenant: "Todos os alunos (com app)",
  course: "Por curso",
  school_class: "Por turma",
  student: "Um aluno",
  students: "Vários alunos",
};

type TabId = "send" | "history" | "settings";

type CourseOption = { id: number; name: string };
type SchoolClassOption = { id: number; name: string; course?: { name?: string } };
type StudentOption = { id: number; name: string; enrollment_number?: string | null };

export default function NotificationsScreen({ navigate: _navigate }: WithNavigate) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [tab, setTab] = useState<TabId>("send");

  const [typesMeta, setTypesMeta] = useState<Record<string, { label: string; icon: string }>>({});
  const [audienceTypes, setAudienceTypes] = useState<NotificationAudienceType[]>([]);
  const [calendarEnabledTypes, setCalendarEnabledTypes] = useState<NotificationTypeKey[]>([]);
  const [calendarTypeLabels, setCalendarTypeLabels] = useState<
    Partial<Record<NotificationTypeKey, string>>
  >({});
  const [settingsDraft, setSettingsDraft] = useState<NotificationTypeKey[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [form, setForm] = useState({
    type: "general" as NotificationTypeKey,
    title: "",
    body: "",
    audience_type: "tenant" as NotificationAudienceType,
    course_id: "",
    school_class_id: "",
    student_id: "",
    student_ids: [] as number[],
    action: "",
    exam_id: "",
    invoice_id: "",
    show_on_calendar: false,
    starts_at: "",
    ends_at: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClassOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");

  const [broadcasts, setBroadcasts] = useState<NotificationBroadcast[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [messageModal, setMessageModal] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({ visible: false, type: "info", title: "", message: "" });

  const typeOptions = useMemo(
    () =>
      Object.entries(typesMeta).map(([value, meta]) => ({
        value,
        label: meta.label,
      })),
    [typesMeta]
  );

  const audienceOptions = useMemo(
    () =>
      audienceTypes.map((value) => ({
        value,
        label: AUDIENCE_LABELS[value] ?? value,
      })),
    [audienceTypes]
  );

  const courseOptions = useMemo(
    () => courses.map((c) => ({ value: String(c.id), label: c.name })),
    [courses]
  );

  const schoolClassOptions = useMemo(
    () =>
      schoolClasses.map((c) => ({
        value: String(c.id),
        label: c.course?.name ? `${c.name} — ${c.course.name}` : c.name,
      })),
    [schoolClasses]
  );

  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: String(s.id),
        label: s.enrollment_number
          ? `${s.name} (${s.enrollment_number})`
          : s.name,
      })),
    [students]
  );

  const canShowCalendarForType = useMemo(
    () => calendarEnabledTypes.includes(form.type),
    [calendarEnabledTypes, form.type]
  );

  const filteredStudentsForMulti = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students.slice(0, 50);
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          String(s.enrollment_number ?? "").includes(q)
      )
      .slice(0, 50);
  }, [studentSearch, students]);

  const buildPayload = useCallback((): SendNotificationPayload => {
    const payload: SendNotificationPayload = {
      type: form.type,
      title: form.title.trim(),
      body: form.body.trim(),
      audience_type: form.audience_type,
    };

    if (form.audience_type === "course" && form.course_id) {
      payload.course_id = Number(form.course_id);
    }
    if (form.audience_type === "school_class" && form.school_class_id) {
      payload.school_class_id = Number(form.school_class_id);
    }
    if (form.audience_type === "student" && form.student_id) {
      payload.student_id = Number(form.student_id);
    }
    if (form.audience_type === "students" && form.student_ids.length) {
      payload.student_ids = form.student_ids;
    }

    const data: SendNotificationPayload["data"] = {};
    if (form.action.trim()) data.action = form.action.trim();
    if (form.exam_id.trim()) data.exam_id = Number(form.exam_id);
    if (form.invoice_id.trim()) data.invoice_id = Number(form.invoice_id);
    if (Object.keys(data).length) payload.data = data;

    if (form.show_on_calendar) {
      payload.show_on_calendar = true;
      payload.starts_at = displayDateTimeToISO(form.starts_at);
      payload.ends_at = displayDateTimeToISO(form.ends_at);
    }

    return payload;
  }, [form]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const settings = await fetchNotificationSettings();
      setTypesMeta(settings.types ?? {});
      setCalendarEnabledTypes(settings.calendar_enabled_types ?? []);
      setCalendarTypeLabels(settings.calendar_type_labels ?? {});
      setSettingsDraft(settings.calendar_enabled_types ?? []);
    } catch {
      setMessageModal({
        visible: true,
        type: "error",
        title: "Erro",
        message: "Não foi possível carregar as configurações.",
      });
    }
    setSettingsLoading(false);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await fetchNotificationTypes();
      setTypesMeta(meta.types ?? {});
      setAudienceTypes(meta.audience_types ?? []);
      setCalendarEnabledTypes(meta.calendar_enabled_types ?? []);
      setCalendarTypeLabels(meta.calendar_type_labels ?? {});
    } catch {
      setTypesMeta({
        general: { label: "Comunicado geral", icon: "megaphone" },
        class_announcement: { label: "Aviso da turma", icon: "groups" },
        billing_due: { label: "Vencimento", icon: "receipt" },
        exam_pending: { label: "Simulado pendente", icon: "assignment" },
        exam_result: { label: "Resultado", icon: "grade" },
      });
      setAudienceTypes(["tenant", "course", "school_class", "student", "students"]);
    }
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const [coursesRes, classesRes, studentsRes] = await Promise.all([
        api.get("/courses", { params: { status: "active", per_page: 500 } }),
        api.get("/school-classes", { params: { status: "active", per_page: 500 } }),
        api.get("/students", { params: { status: "active", per_page: 500 } }),
      ]);

      const coursesList = coursesRes.data?.body ?? coursesRes.data?.data ?? coursesRes.data;
      const classesList = classesRes.data?.body ?? classesRes.data?.data ?? classesRes.data;
      const studentsList = studentsRes.data?.body ?? studentsRes.data?.data ?? studentsRes.data;

      const courseRows = Array.isArray(coursesList?.data)
        ? coursesList.data
        : Array.isArray(coursesList)
        ? coursesList
        : [];
      const classRows = Array.isArray(classesList?.data)
        ? classesList.data
        : Array.isArray(classesList)
        ? classesList
        : [];
      const studentRows = Array.isArray(studentsList?.data)
        ? studentsList.data
        : Array.isArray(studentsList)
        ? studentsList
        : [];

      setCourses(
        courseRows
          .filter((c: any) => c?.id)
          .map((c: any) => ({ id: Number(c.id), name: String(c.name) }))
      );
      setSchoolClasses(
        classRows
          .filter((c: any) => c?.id)
          .map((c: any) => ({
            id: Number(c.id),
            name: String(c.name),
            course: c.course,
          }))
      );
      setStudents(
        studentRows
          .filter((s: any) => s?.id && s?.user_id)
          .map((s: any) => ({
            id: Number(s.id),
            name: String(s.name),
            enrollment_number: s.enrollment_number ?? null,
          }))
      );
    } catch {
      setCourses([]);
      setSchoolClasses([]);
      setStudents([]);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchNotificationBroadcasts(historyPage, 20);
      setBroadcasts(res.items ?? []);
      setHistoryMeta(
        res.pagination ?? {
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: 0,
        }
      );
    } catch {
      setBroadcasts([]);
    }
    setHistoryLoading(false);
  }, [historyPage]);

  useEffect(() => {
    loadMeta();
    loadLookups();
  }, [loadMeta, loadLookups]);

  useEffect(() => {
    if (tab === "settings") {
      loadSettings();
    }
  }, [tab, loadSettings]);

  useEffect(() => {
    if (!canShowCalendarForType && form.show_on_calendar) {
      setForm((p) => ({
        ...p,
        show_on_calendar: false,
        starts_at: "",
        ends_at: "",
      }));
    }
  }, [canShowCalendarForType, form.show_on_calendar]);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  const handlePreview = async () => {
    setFieldErrors({});
    setPreviewLoading(true);
    setPreviewCount(null);
    try {
      const res = await previewNotificationRecipients(buildPayload());
      setPreviewCount(res.recipients_count ?? 0);
    } catch (e: any) {
      const raw = e?.response?.data?.errors ?? e?.response?.data?.body?.errors;
      if (raw) setFieldErrors(parseApiErrors(raw));
      setMessageModal({
        visible: true,
        type: "error",
        title: "Pré-visualização",
        message:
          e?.response?.data?.message ??
          "Não foi possível calcular os destinatários.",
      });
    }
    setPreviewLoading(false);
  };

  const handleSend = async () => {
    setFieldErrors({});
    setSending(true);
    try {
      const sent = await sendNotification(buildPayload());
      setMessageModal({
        visible: true,
        type: "success",
        title: "Enviado",
        message: `Notificação enviada para ${sent.recipients_count} aluno(s).`,
      });
      setForm((prev) => ({
        ...prev,
        title: "",
        body: "",
        student_ids: [],
        action: "",
        exam_id: "",
        invoice_id: "",
        show_on_calendar: false,
        starts_at: "",
        ends_at: "",
      }));
      setPreviewCount(null);
      setTab("history");
      setHistoryPage(1);
    } catch (e: any) {
      const raw = e?.response?.data?.errors ?? e?.response?.data?.body?.errors;
      if (raw) setFieldErrors(parseApiErrors(raw));
      setMessageModal({
        visible: true,
        type: "error",
        title: "Falha no envio",
        message:
          e?.response?.data?.message ??
          "Não foi possível enviar a notificação.",
      });
    }
    setSending(false);
  };

  const toggleCalendarTypeSetting = (typeKey: NotificationTypeKey) => {
    setSettingsDraft((prev) =>
      prev.includes(typeKey) ? prev.filter((t) => t !== typeKey) : [...prev, typeKey]
    );
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const result = await updateNotificationCalendarSettings(settingsDraft);
      setCalendarEnabledTypes(result.calendar_enabled_types);
      setSettingsDraft(result.calendar_enabled_types);
      setMessageModal({
        visible: true,
        type: "success",
        title: "Salvo",
        message: "Tipos habilitados para o calendário foram atualizados.",
      });
    } catch (e: any) {
      setMessageModal({
        visible: true,
        type: "error",
        title: "Erro",
        message: e?.response?.data?.message ?? "Não foi possível salvar.",
      });
    }
    setSettingsSaving(false);
  };

  const toggleStudentSelection = (id: number) => {
    setForm((prev) => {
      const exists = prev.student_ids.includes(id);
      return {
        ...prev,
        student_ids: exists
          ? prev.student_ids.filter((x) => x !== id)
          : [...prev.student_ids, id],
      };
    });
  };

  const formatAudience = (b: NotificationBroadcast) => {
    const p = b.audience_params ?? {};
    switch (b.audience_type) {
      case "course":
        return `Curso #${p.course_id ?? "—"}`;
      case "school_class":
        return `Turma #${p.school_class_id ?? "—"}`;
      case "student":
        return `Aluno #${p.student_id ?? "—"}`;
      case "students":
        return `${(p.student_ids as number[] | undefined)?.length ?? 0} aluno(s)`;
      default:
        return "Todos (tenant)";
    }
  };

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: "#EEEEFF" }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Notificações</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Envie avisos para o app mobile dos alunos
          </Text>
        </View>
      </View>

      <View className="flex-row bg-white rounded-xl p-1 mb-4 border border-gray-100 self-start">
        {(
          [
            { id: "send" as TabId, label: "Nova mensagem" },
            { id: "history" as TabId, label: "Histórico" },
            { id: "settings" as TabId, label: "Configurações" },
          ] as const
        ).map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg ${tab === t.id ? "bg-violet-600" : ""}`}
          >
            <Text
              className={`text-sm font-semibold ${
                tab === t.id ? "text-white" : "text-gray-500"
              }`}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "settings" ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-5">
          <Text className="text-base font-bold text-gray-800 mb-1">
            Notificações no calendário
          </Text>
          <Text className="text-sm text-gray-500 mb-4">
            Escolha quais tipos de notificação podem ser enviados também para a agenda
            do aluno (com data de início e fim).
          </Text>

          {settingsLoading ? (
            <ActivityIndicator color="#7C3AED" />
          ) : (
            <>
              {Object.entries(typesMeta).map(([typeKey, meta]) => {
                const key = typeKey as NotificationTypeKey;
                const selected = settingsDraft.includes(key);
                const calendarLabel = calendarTypeLabels[key];

                return (
                  <TouchableOpacity
                    key={typeKey}
                    className="flex-row items-start gap-3 py-3 border-b border-gray-100"
                    onPress={() => toggleCalendarTypeSetting(key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={22}
                      color={selected ? "#7C3AED" : "#9CA3AF"}
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-800">{meta.label}</Text>
                      {calendarLabel ? (
                        <Text className="text-xs text-gray-500 mt-0.5">
                          No calendário: {calendarLabel}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={handleSaveSettings}
                disabled={settingsSaving}
                className="mt-4 flex-row items-center justify-center gap-2 bg-violet-600 py-3 rounded-xl"
              >
                {settingsSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text className="text-sm font-semibold text-white">Salvar configurações</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      {tab === "send" ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-5">
          {canShowCalendarForType ? (
            <View className="mb-4 p-4 rounded-xl border border-violet-100 bg-violet-50">
              <TouchableOpacity
                className="flex-row items-center gap-2"
                onPress={() =>
                  setForm((p) => ({
                    ...p,
                    show_on_calendar: !p.show_on_calendar,
                  }))
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name={form.show_on_calendar ? "checkbox" : "square-outline"}
                  size={22}
                  color="#7C3AED"
                />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-violet-900">
                    Exibir também no calendário
                  </Text>
                  <Text className="text-xs text-violet-700 mt-0.5">
                    O aluno verá no sino e na agenda (com data início e fim).
                  </Text>
                </View>
              </TouchableOpacity>

              {form.show_on_calendar ? (
                <View className="mt-4">
                  <DateTimePickerInput
                    label="Início no calendário"
                    value={form.starts_at}
                    onChangeText={(v) => setForm((p) => ({ ...p, starts_at: v }))}
                    error={fieldErrors.starts_at}
                    required
                  />
                  <DateTimePickerInput
                    label="Fim no calendário"
                    value={form.ends_at}
                    onChangeText={(v) => setForm((p) => ({ ...p, ends_at: v }))}
                    error={fieldErrors.ends_at}
                    required
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <Text className="text-xs text-gray-600">
                O tipo &quot;{typesMeta[form.type]?.label ?? form.type}&quot; não está
                habilitado para o calendário. Ajuste em Configurações.
              </Text>
            </View>
          )}

          <FormSelect
            label="Tipo"
            value={form.type}
            options={typeOptions}
            onChange={(v) => setForm((p) => ({ ...p, type: v as NotificationTypeKey }))}
            required
          />
          <FormInput
            label="Título"
            value={form.title}
            onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
            error={fieldErrors.title}
            required
            placeholder="Ex.: Aula cancelada amanhã"
          />
          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-700 mb-1.5">
              Mensagem <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={form.body}
              onChangeText={(v) => setForm((p) => ({ ...p, body: v }))}
              multiline
              numberOfLines={5}
              placeholder="Texto exibido no app do aluno..."
              style={{
                borderWidth: 1,
                borderColor: fieldErrors.body ? "#FCA5A5" : "#E5E7EB",
                borderRadius: 12,
                padding: 12,
                minHeight: 120,
                textAlignVertical: "top",
                fontSize: 14,
                color: "#111827",
              }}
            />
            {fieldErrors.body ? (
              <Text className="text-xs text-red-500 mt-1">{fieldErrors.body}</Text>
            ) : null}
          </View>

          <FormSelect
            label="Público"
            value={form.audience_type}
            options={audienceOptions}
            onChange={(v) => {
              setPreviewCount(null);
              setForm((p) => ({
                ...p,
                audience_type: v as NotificationAudienceType,
              }));
            }}
            required
          />

          {form.audience_type === "course" ? (
            <FormSelect
              label="Curso"
              value={form.course_id}
              options={courseOptions}
              onChange={(v) => setForm((p) => ({ ...p, course_id: v }))}
              error={fieldErrors.course_id}
              placeholder="Selecione o curso"
              required
            />
          ) : null}

          {form.audience_type === "school_class" ? (
            <FormSelect
              label="Turma"
              value={form.school_class_id}
              options={schoolClassOptions}
              onChange={(v) => setForm((p) => ({ ...p, school_class_id: v }))}
              error={fieldErrors.school_class_id}
              placeholder="Selecione a turma"
              required
            />
          ) : null}

          {form.audience_type === "student" ? (
            <FormSelect
              label="Aluno"
              value={form.student_id}
              options={studentOptions}
              onChange={(v) => setForm((p) => ({ ...p, student_id: v }))}
              error={fieldErrors.student_id}
              placeholder="Somente alunos com acesso ao app"
              required
            />
          ) : null}

          {form.audience_type === "students" ? (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">
                Alunos selecionados ({form.student_ids.length})
              </Text>
              <TextInput
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="Buscar por nome ou matrícula..."
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              />
              <View
                style={{
                  maxHeight: 220,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <ScrollView nestedScrollEnabled>
                  {filteredStudentsForMulti.map((s) => {
                    const selected = form.student_ids.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => toggleStudentSelection(s.id)}
                        className={`flex-row items-center px-3 py-2.5 border-b border-gray-50 ${
                          selected ? "bg-violet-50" : ""
                        }`}
                      >
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={20}
                          color={selected ? "#7C3AED" : "#9CA3AF"}
                        />
                        <Text className="ml-2 text-sm text-gray-700 flex-1">{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {fieldErrors.student_ids ? (
                <Text className="text-xs text-red-500 mt-1">{fieldErrors.student_ids}</Text>
              ) : null}
            </View>
          ) : null}

          <Text className="text-sm font-bold text-gray-700 mb-2 mt-2">
            Ação no app (opcional)
          </Text>
          <FormSelect
            label="Ao tocar na notificação"
            value={form.action}
            options={[
              { value: "", label: "Apenas abrir mensagem" },
              { value: "open_exam", label: "Abrir simulado" },
              { value: "open_finance", label: "Abrir financeiro" },
            ]}
            onChange={(v) => setForm((p) => ({ ...p, action: v }))}
          />
          {form.action === "open_exam" ? (
            <FormInput
              label="ID do simulado"
              value={form.exam_id}
              onChangeText={(v) => setForm((p) => ({ ...p, exam_id: v }))}
              keyboardType="numeric"
            />
          ) : null}
          {form.action === "open_finance" ? (
            <FormInput
              label="ID da cobrança"
              value={form.invoice_id}
              onChangeText={(v) => setForm((p) => ({ ...p, invoice_id: v }))}
              keyboardType="numeric"
            />
          ) : null}

          {previewCount !== null ? (
            <View className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-violet-800">
                <Text className="font-bold">{previewCount}</Text> aluno(s) receberão esta
                notificação.
              </Text>
            </View>
          ) : null}

          <View className={`flex-row gap-2 ${isMobile ? "flex-col" : ""}`}>
            <TouchableOpacity
              onPress={handlePreview}
              disabled={previewLoading}
              className="flex-1 rounded-xl border border-violet-200 bg-violet-50 py-3 items-center"
            >
              {previewLoading ? (
                <ActivityIndicator color="#7C3AED" />
              ) : (
                <Text className="text-sm font-semibold text-violet-700">
                  Pré-visualizar destinatários
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending}
              className="flex-1 rounded-xl bg-violet-600 py-3 items-center"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">Enviar notificação</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {tab === "history" ? (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {historyLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : broadcasts.length === 0 ? (
            <View className="py-16 items-center px-6">
              <Ionicons name="notifications-off-outline" size={40} color="#9CA3AF" />
              <Text className="text-gray-500 mt-3 text-center">
                Nenhum envio registrado ainda.
              </Text>
            </View>
          ) : (
            broadcasts.map((b) => (
              <View
                key={b.id}
                className="px-4 py-4 border-b border-gray-50"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-base font-bold text-gray-800">{b.title}</Text>
                    <Text className="text-sm text-gray-500 mt-1" numberOfLines={2}>
                      {b.body}
                    </Text>
                  </View>
                  <Badge label={`${b.recipients_count}`} variant="info" />
                </View>
                <View className="flex-row flex-wrap gap-2 mt-2">
                  <Badge
                    label={typesMeta[b.type]?.label ?? b.type_label ?? b.type}
                    variant="default"
                  />
                  <Badge label={formatAudience(b)} variant="secondary" />
                  {b.show_on_calendar ? (
                    <Badge label="No calendário" variant="info" />
                  ) : null}
                </View>
                <Text className="text-xs text-gray-400 mt-2">
                  {b.sent_by?.name ? `${b.sent_by.name} · ` : ""}
                  {b.created_at
                    ? new Date(b.created_at).toLocaleString("pt-BR")
                    : ""}
                </Text>
              </View>
            ))
          )}
          {!historyLoading && historyMeta.last_page > 1 ? (
            <View className="p-4">
              <Pagination
                currentPage={historyMeta.current_page}
                lastPage={historyMeta.last_page}
                total={historyMeta.total}
                perPage={historyMeta.per_page}
                onPageChange={setHistoryPage}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <MessageModal
        visible={messageModal.visible}
        type={messageModal.type}
        title={messageModal.title}
        message={messageModal.message}
        onClose={() => setMessageModal((p) => ({ ...p, visible: false }))}
      />
    </ScrollView>
  );
}
