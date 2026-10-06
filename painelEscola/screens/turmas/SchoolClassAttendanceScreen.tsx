import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import AttendanceDateBar from "../../components/ui/AttendanceDateBar";
import FormInput from "../../components/ui/FormInput";
import ToastBanner from "../../components/ui/ToastBanner";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";
import Tabs from "../../components/ui/Tabs";

type Props = {
  classId: number | null;
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type Student = {
  id: number;
  name: string;
  enrollment_number?: string | null;
};

type SchoolClass = {
  id: number;
  name: string;
  course?: { id: number; name: string } | null;
  start_date?: string | null;
  end_date?: string | null;
  schedules?: Array<{ id: number; weekday: string; start_time: string; end_time: string }>;
};

type AttendanceStatus = "present" | "absent" | "late" | "excused";

type AttendanceRow = {
  status: AttendanceStatus;
  notes: string;
};

const STATUS_BUTTONS: Array<{
  value: AttendanceStatus;
  label: string;
  activeClass: string;
  activeTextClass: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    value: "present",
    label: "Presente",
    activeClass: "bg-success-tint border-success",
    activeTextClass: "text-success",
    icon: "checkmark-circle",
  },
  {
    value: "absent",
    label: "Falta",
    activeClass: "bg-danger-tint border-danger",
    activeTextClass: "text-danger",
    icon: "close-circle",
  },
  {
    value: "late",
    label: "Atraso",
    activeClass: "bg-warning-tint border-warning",
    activeTextClass: "text-warning",
    icon: "time",
  },
  {
    value: "excused",
    label: "Justificado",
    activeClass: "bg-brand-tint border-border",
    activeTextClass: "text-brand",
    icon: "document-text",
  },
];

const todayISO = () => {
  const current = new Date();
  const yyyy = current.getFullYear();
  const mm = String(current.getMonth() + 1).padStart(2, "0");
  const dd = String(current.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const extractList = (payload: any): any[] => {
  const root = payload?.body ?? payload;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root)) return root;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const WEEKDAY_SLUGS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const toDateAtMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

const toMinutes = (time: string | null | undefined) => {
  if (!time) return null;
  const [hh, mm] = time.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const getWeekdaySlug = (isoDate: string) => {
  const day = toDateAtMidnight(isoDate).getDay();
  return WEEKDAY_SLUGS[day] ?? "monday";
};

/** Turma na coluna legada ou na pivot enrollment_school_classes. */
const enrollmentBelongsToClass = (enrollment: any, targetClassId: number): boolean => {
  const legacyId = enrollment.school_class?.id ?? enrollment.school_class_id;
  if (Number(legacyId) === Number(targetClassId)) {
    return true;
  }
  const pivotIds: number[] = Array.isArray(enrollment.school_class_ids)
    ? enrollment.school_class_ids.map(Number)
    : Array.isArray(enrollment.school_classes)
      ? enrollment.school_classes.map((c: { id: number }) => Number(c.id))
      : [];
  return pivotIds.includes(Number(targetClassId));
};

export default function SchoolClassAttendanceScreen({ classId, navigate }: Props) {
  const { contentPadding } = useResponsiveLayout();
  const scrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(todayISO());
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<Record<number, AttendanceRow>>({});
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const closeToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const presentCount = useMemo(
    () => Object.values(rows).filter((row) => row.status === "present").length,
    [rows]
  );

  const dateContext = useMemo(() => {
    if (!schoolClass || !attendanceDate) {
      return {
        isWithinRange: false,
        hasScheduleOnDay: false,
        canSaveNow: false,
        message: "Selecione uma data válida.",
      };
    }

    const selectedDate = toDateAtMidnight(attendanceDate);
    const classStart = schoolClass.start_date ? toDateAtMidnight(schoolClass.start_date) : null;
    const classEnd = schoolClass.end_date ? toDateAtMidnight(schoolClass.end_date) : null;
    const isWithinRange =
      (!classStart || selectedDate >= classStart) &&
      (!classEnd || selectedDate <= classEnd);

    const weekdaySlug = getWeekdaySlug(attendanceDate);
    const daySchedules = (schoolClass.schedules ?? []).filter(
      (schedule) => schedule.weekday === weekdaySlug
    );
    const hasScheduleOnDay = daySchedules.length > 0;

    if (!isWithinRange) {
      return {
        isWithinRange,
        hasScheduleOnDay,
        canSaveNow: false,
        message: "Data fora do período da turma.",
      };
    }

    if (!hasScheduleOnDay) {
      return {
        isWithinRange,
        hasScheduleOnDay,
        canSaveNow: false,
        message: "Esta turma não possui horário cadastrado para este dia.",
      };
    }

    const firstStartMinutes = daySchedules
      .map((schedule) => toMinutes(schedule.start_time))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b)[0];

    if (firstStartMinutes == null) {
      return {
        isWithinRange,
        hasScheduleOnDay,
        canSaveNow: false,
        message: "Não foi possível determinar o horário inicial do dia.",
      };
    }

    const today = toDateAtMidnight(todayISO());
    let canSaveNow = false;

    if (selectedDate < today) {
      canSaveNow = true;
    } else if (selectedDate > today) {
      canSaveNow = false;
    } else {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      canSaveNow = nowMinutes >= firstStartMinutes;
    }

    return {
      isWithinRange,
      hasScheduleOnDay,
      canSaveNow,
      message: canSaveNow
        ? ""
        : "Lançamento permitido somente após o início da primeira aula do dia.",
    };
  }, [schoolClass, attendanceDate]);

  const loadData = async (targetDate: string) => {
    if (!classId) return;

    setLoading(true);
    setNotice("");

    try {
      const [{ data: classRaw }, { data: enrollmentsRaw }, { data: attendanceRaw }] = await Promise.all([
        api.get(`/school-classes/${classId}`),
        api.get("/enrollments", {
          params: { per_page: 500, status: "active", school_class_id: classId },
        }),
        api.get(`/school-classes/${classId}/attendances`, {
          params: { attendance_date: targetDate },
        }),
      ]);

      const klass = classRaw.body ?? classRaw.data ?? classRaw;
      const classData: SchoolClass = {
        id: klass.id,
        name: klass.name ?? `TURMA #${classId}`,
        course: klass.course ?? null,
        start_date: klass.start_date ?? null,
        end_date: klass.end_date ?? null,
        schedules: Array.isArray(klass.schedules) ? klass.schedules : [],
      };

      setSchoolClass(classData);

      const selectedDate = toDateAtMidnight(targetDate);
      const classStart = classData.start_date ? toDateAtMidnight(classData.start_date) : null;
      const classEnd = classData.end_date ? toDateAtMidnight(classData.end_date) : null;
      const isWithinRange =
        (!classStart || selectedDate >= classStart) &&
        (!classEnd || selectedDate <= classEnd);

      const weekdaySlug = getWeekdaySlug(targetDate);
      const hasScheduleOnDay = (classData.schedules ?? []).some(
        (schedule) => schedule.weekday === weekdaySlug
      );

      if (!isWithinRange || !hasScheduleOnDay) {
        setStudents([]);
        setRows({});
        setNotice(
          !isWithinRange
            ? "Data fora do período da turma."
            : "Esta turma não possui horário cadastrado para este dia."
        );
        setLoading(false);
        return;
      }

      const enrollmentList = extractList(enrollmentsRaw);
      const nextStudents = enrollmentList
        .filter(
          (enrollment: any) =>
            enrollmentBelongsToClass(enrollment, classId) && enrollment.student?.id,
        )
        .map((enrollment: any) => ({
          id: Number(enrollment.student.id),
          name: enrollment.student.name ?? `ALUNO #${enrollment.student.id}`,
          enrollment_number:
            enrollment.enrollment_number ?? enrollment.student.enrollment_number ?? null,
        }))
        .sort((a: Student, b: Student) => a.name.localeCompare(b.name, "pt-BR"));

      const attendanceList = extractList(attendanceRaw);
      const attendanceMap = new Map<number, any>();
      attendanceList.forEach((record: any) => {
        const studentId = Number(record.student_id ?? record.student?.id);
        if (studentId) attendanceMap.set(studentId, record);
      });

      const nextRows: Record<number, AttendanceRow> = {};
      nextStudents.forEach((student) => {
        const found = attendanceMap.get(student.id);
        nextRows[student.id] = {
          status: (found?.status as AttendanceStatus) || "present",
          notes: found?.notes ?? "",
        };
      });

      setStudents(nextStudents);
      setRows(nextRows);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || "Não foi possível carregar a frequencia.");
      setStudents([]);
      setRows({});
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData(attendanceDate);
  }, [classId, attendanceDate]);

  const setStudentStatus = (studentId: number, status: AttendanceStatus) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: {
        status,
        notes: prev[studentId]?.notes ?? "",
      },
    }));
  };

  const setStudentNotes = (studentId: number, notes: string) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status ?? "present",
        notes,
      },
    }));
  };

  const saveAttendance = async () => {
    if (!classId || students.length === 0) {
      setNotice("Não ha alunos matriculados nesta turma.");
      return;
    }

    if (!dateContext.canSaveNow) {
      setNotice(dateContext.message || "Lançamento não permitido para esta data/hora.");
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const { data } = await api.post(`/school-classes/${classId}/attendances`, {
        attendance_date: attendanceDate,
        records: students.map((student) => ({
          student_id: student.id,
          status: rows[student.id]?.status ?? "present",
          notes: rows[student.id]?.notes?.trim() ? rows[student.id].notes.trim() : null,
        })),
      });

      const successMessage = data?.message || "Frequencia lancada com sucesso.";
      setToast({ visible: true, type: "success", message: successMessage });
    } catch (e: any) {
      const errorMessage = e?.response?.data?.message || "Não foi possível salvar a frequencia.";
      setNotice(errorMessage);
      setToast({ visible: true, type: "error", message: errorMessage });
    }

    setSaving(false);
  };

  if (!classId) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm text-ink-muted">Turma inválida.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
      <ScreenBreadcrumb items={[{ label: "Turmas", onPress: () => navigate("turmas") }, { label: "Frequência" }]} />

      <View className="mb-6">
        <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Frequência da turma</Text>
        <Text className="text-sm text-ink-muted">
          {schoolClass ? `${schoolClass.name} • ${schoolClass.course?.name ?? "Sem curso"}` : "Lancamento diario rapido por aluno"}
        </Text>
      </View>

      <View className="mb-6">
        <Tabs
          accessibilityLabel="Seções da turma"
          items={[
            { id: "dados", label: "Dados e horários" },
            { id: "frequencia", label: "Frequência" },
          ]}
          value="frequencia"
          onChange={(id) => id === "dados" && navigate("turmas-form", { classId })}
        />
      </View>

      <View
        className="bg-surface rounded-ds-md p-6 border border-border"
        style={{ }}
      >
        <View className="flex-row items-center justify-between gap-4 mb-4" style={{ flexWrap: "wrap" as any }}>
          <View style={{ minWidth: 190 }}>
            <Text className="text-base font-semibold text-ink">Lançamento diário</Text>
            <Text className="text-xs text-ink-subtle">
              {students.length} aluno{students.length !== 1 ? "s" : ""} • {presentCount} presente{presentCount !== 1 ? "s" : ""}
            </Text>
          </View>

          <View
            className="flex-row gap-3 items-center justify-end"
            style={{ flexWrap: "wrap" as any, flexShrink: 1 }}
          >
            <View style={{ width: 360, maxWidth: "100%" }}>
              <AttendanceDateBar
                value={attendanceDate}
                onChange={setAttendanceDate}
                disabled={loading || saving}
              />
            </View>

            <TouchableOpacity
              onPress={saveAttendance}
              className="h-14 px-5 rounded-ds-md bg-brand flex-row items-center justify-center gap-2"
              activeOpacity={0.85}
              disabled={saving || loading || !dateContext.canSaveNow}
              style={{ opacity: saving || loading || !dateContext.canSaveNow ? 0.7 : 1 }}
              accessibilityLabel="Salvar frequência"
            >
              {saving ? (
                <ActivityIndicator size="small" color="var(--ds-on-brand)" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="var(--ds-on-brand)" />
                  <Text className="text-sm font-medium text-on-brand">Salvar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {!dateContext.canSaveNow && !!dateContext.message && (
          <Text className="text-xs text-warning mb-3">{dateContext.message}</Text>
        )}

        {!!notice && <Text className="text-sm text-ink-muted mb-4">{notice}</Text>}

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
          </View>
        ) : students.length === 0 ? (
          <View className="items-center py-16">
            <Ionicons name="people-outline" size={32} color="var(--ds-border-strong)" />
            <Text className="text-sm text-ink-subtle mt-2">Nenhum aluno matriculado nesta turma.</Text>
          </View>
        ) : (
          <View className="gap-4">
            {students.map((student) => {
              const row = rows[student.id] ?? { status: "present" as AttendanceStatus, notes: "" };

              return (
                <View key={student.id} className="rounded-ds-md border border-border bg-surface-sunken p-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <View>
                      <Text className="text-base font-semibold text-ink">{student.name}</Text>
                      <Text className="text-xs text-ink-subtle mt-0.5">
                        {student.enrollment_number || `ID ${student.id}`}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2 mb-3" style={{ flexWrap: "wrap" as any }}>
                    {STATUS_BUTTONS.map((option) => {
                      const selected = row.status === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() => setStudentStatus(student.id, option.value)}
                          className={`px-3 py-2 rounded-ds-md border flex-row items-center gap-1.5 ${
                            selected ? option.activeClass : "bg-surface border-border"
                          }`}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={option.icon}
                            size={15}
                            color={selected ? "var(--ds-ink)" : "var(--ds-ink-subtle)"}
                          />
                          <Text className={`text-sm font-semibold ${selected ? option.activeTextClass : "text-ink-muted"}`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <FormInput
                    label="Observações"
                    value={row.notes}
                    onChangeText={(value) => setStudentNotes(student.id, value)}
                    placeholder="Opcional"
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>
      </ScrollView>

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={closeToast}
      />
    </View>
  );
}
