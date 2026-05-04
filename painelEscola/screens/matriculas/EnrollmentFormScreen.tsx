import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import FormInput from "../../components/ui/FormInput";
import DatePickerInput from "../../components/ui/DatePickerInput";
import {
  usePaymentMethods,
  domainToOptions,
} from "../../hooks/useDomains";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import SearchableSelect from "../../components/ui/SearchableSelect";

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "S\u00e1b",
  sunday: "Dom",
};

const fmtTime = (t: string) => t.slice(0, 5);

const classScheduleLabel = (sc: SchoolClass): string => {
  if (!sc.schedules || sc.schedules.length === 0) return "";
  return sc.schedules
    .map((s) => `${WEEKDAY_SHORT[s.weekday] ?? s.weekday} ${fmtTime(s.start_time)}\u2013${fmtTime(s.end_time)}`)
    .join(" · ");
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Student = { id: number; name: string; enrollment_number?: string };
type SchoolClass = {
  id: number;
  name: string;
  course?: { id: number; name: string };
  schedules?: { id: number; weekday: string; start_time: string; end_time: string }[];
};
type Course = { id: number; name: string };
type CoursePlan = {
  id: number;
  name: string;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  monthly_equivalent: string;
};
type Bundle = {
  id: number;
  name: string;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  monthly_equivalent: string;
  courses: { id: number; name: string }[];
};
type Guardian = { id: number; name: string };

type InvoiceResult = {
  id: number;
  description: string;
  amount: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const todayDisplay = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EnrollmentFormScreen({ navigate }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  // ── Mode ────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"plan" | "bundle">("plan");

  // ── Lookup data ─────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [plans, setPlans] = useState<CoursePlan[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);

  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingBundles, setLoadingBundles] = useState(false);

  const paymentMethods = usePaymentMethods();
  const paymentMethodOptions = domainToOptions(paymentMethods);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [studentId, setStudentId] = useState("");
  const [guardianId, setGuardianId] = useState("");

  // Plan mode
  const [courseId, setCourseId] = useState("");
  const [planId, setPlanId] = useState("");
  const [classId, setClassId] = useState("");

  // Bundle mode
  const [bundleId, setBundleId] = useState("");
  // bundleClassMap: courseId → classId
  const [bundleClassMap, setBundleClassMap] = useState<Record<number, string>>({});

  // Common
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [overrideDates, setOverrideDates] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [dueDay, setDueDay] = useState("10");

  // Payment toggle
  const [payNow, setPayNow] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [paidAt, setPaidAt] = useState(todayDisplay());
  const [payNotes, setPayNotes] = useState("");

  // ── State ────────────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | {
    enrollmentNumbers: string[];
    invoice: InvoiceResult;
    bundleName?: string;
  }>(null);

  // ── Load lookups on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [sRes, cRes, clRes, gRes] = await Promise.all([
          api.get("/students", { params: { per_page: 500 } }),
          api.get("/courses", { params: { status: "active", per_page: 200 } }),
          api.get("/school-classes", { params: { status: "active", per_page: 200 } }),
          api.get("/students", { params: { per_page: 500 } }), // guardians loaded per student below
        ]);
        setStudents(sRes.data.data ?? []);
        setCourses(cRes.data.data ?? []);
        setClasses(clRes.data.data ?? []);
      } catch {}
    })();
  }, []);

  // Load guardians when student changes
  useEffect(() => {
    if (!studentId) { setGuardians([]); setGuardianId(""); return; }
    (async () => {
      try {
        const { data } = await api.get(`/students/${studentId}`);
        const g = (data.guardians ?? []).map((r: any) => ({
          id: r.guardian.id,
          name: r.guardian.name,
        }));
        setGuardians(g);
        setGuardianId(g.length > 0 ? String(g[0].id) : "");
      } catch {}
    })();
  }, [studentId]);

  // Load plans when course changes
  useEffect(() => {
    if (!courseId) { setPlans([]); setPlanId(""); return; }
    setLoadingPlans(true);
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/plans`);
        const rawPlans: any[] = data.data ?? data ?? [];
        const activePlans = Array.isArray(rawPlans)
          ? rawPlans.filter((p: any) => p.status === "active")
          : [];
        setPlans(activePlans);
        setPlanId(activePlans.length > 0 ? String(activePlans[0].id) : "");
      } catch {}
      setLoadingPlans(false);
    })();
  }, [courseId]);

  // Load bundles on bundle mode switch
  useEffect(() => {
    if (mode !== "bundle" || bundles.length > 0) return;
    setLoadingBundles(true);
    (async () => {
      try {
        const { data } = await api.get("/course-bundles", {
          params: { status: "active", per_page: 200 },
        });
        setBundles(data.data ?? []);
      } catch {}
      setLoadingBundles(false);
    })();
  }, [mode]);

  // Reset bundle class map when bundle changes
  useEffect(() => {
    setBundleClassMap({});
  }, [bundleId]);

  // ── Selected data helpers ────────────────────────────────────────────────────

  const selectedPlan = plans.find((p) => String(p.id) === planId);
  const selectedBundle = bundles.find((b) => String(b.id) === bundleId);

  const classesForCourse = (cId: number) =>
    classes.filter((cl) => cl.course?.id === cId);

  // ── Monthly equivalent preview ───────────────────────────────────────────────
  const baseEquivalent = () => {
    if (mode === "plan" && selectedPlan)
      return parseFloat(selectedPlan.monthly_equivalent);
    if (mode === "bundle" && selectedBundle)
      return parseFloat(selectedBundle.monthly_equivalent);
    return null;
  };

  const discountedEquivalent = () => {
    const base = baseEquivalent();
    if (base === null) return null;
    const disc = parseFloat(discount.replace(",", ".")) || 0;
    return Math.max(0, base - disc);
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!studentId) e.student_id = "Selecione o aluno.";

    if (mode === "plan") {
      if (!courseId) e.course_id = "Selecione o curso.";
      if (!planId) e.course_plan_id = "Selecione o plano.";
      if (!classId) e.school_class_id = "Selecione a turma.";
    } else {
      if (!bundleId) e.bundle_id = "Selecione o pacote.";
      if (selectedBundle) {
        for (const c of selectedBundle.courses) {
          if (!bundleClassMap[c.id])
            e[`class_${c.id}`] = `Selecione a turma para ${c.name}.`;
        }
      }
    }

    if (payNow && !payMethod) e.payment_method = "Selecione o método de pagamento.";
    return e;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = async () => {
    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const enrollmentPayment = payNow
        ? {
            payment_method: payMethod,
            paid_at: displayToISO(paidAt) ?? todayISO(),
            notes: payNotes.trim() || undefined,
          }
        : undefined;

      if (mode === "plan") {
        const payload: Record<string, any> = {
          student_id: Number(studentId),
          school_class_id: Number(classId),
          course_plan_id: Number(planId),
          discount_amount: parseFloat(discount.replace(",", ".")) || 0,
          payment_due_day: dueDay ? Number(dueDay) : undefined,
          guardian_id: guardianId ? Number(guardianId) : undefined,
        };
        if (startDate) payload.start_date = displayToISO(startDate) ?? startDate;
        if (endDate) payload.end_date = displayToISO(endDate) ?? endDate;
        if (enrollmentPayment) payload.enrollment_payment = enrollmentPayment;

        const { data } = await api.post("/enrollments/subscribe", payload);
        setResult({
          enrollmentNumbers: [data.enrollment_number].filter(Boolean),
          invoice: data.invoices?.[0] ?? null,
        });
      } else {
        const schoolClassIds = selectedBundle!.courses.map(
          (c) => Number(bundleClassMap[c.id])
        );
        const payload: Record<string, any> = {
          student_id: Number(studentId),
          bundle_id: Number(bundleId),
          school_class_ids: schoolClassIds,
          discount_amount: parseFloat(discount.replace(",", ".")) || 0,
          payment_due_day: dueDay ? Number(dueDay) : undefined,
          guardian_id: guardianId ? Number(guardianId) : undefined,
        };
        if (startDate) payload.start_date = displayToISO(startDate) ?? startDate;
        if (endDate) payload.end_date = displayToISO(endDate) ?? endDate;
        if (enrollmentPayment) payload.enrollment_payment = enrollmentPayment;

        const { data } = await api.post("/enrollments/subscribe-bundle", payload);
        setResult({
          enrollmentNumbers: (data.enrollments ?? []).map(
            (e: any) => e.enrollment_number
          ).filter(Boolean),
          invoice: data.enrollment_fee,
          bundleName: data.bundle?.name,
        });
      }
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data.errors ?? {}));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }

    setSaving(false);
  };

  // ── Success screen ───────────────────────────────────────────────────────────
  if (result) {
    const isPaid = result.invoice?.status === "paid";
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      >
        <View className="items-center py-8">
          <View className="w-20 h-20 bg-green-100 rounded-full items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
          </View>
          <Text className="text-2xl font-bold text-gray-800 mb-1">
            Matrícula realizada!
          </Text>
          <Text className="text-sm text-gray-500 text-center">
            {mode === "bundle"
              ? `Pacote ${result.bundleName ?? ""} — ${result.enrollmentNumbers.length} matrícula(s) criada(s)`
              : "Matrícula criada com sucesso"}
          </Text>
        </View>

        {result.enrollmentNumbers.length > 0 && (
          <View
            className="bg-white rounded-2xl p-5 mb-4"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
          >
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Número(s) de Matrícula
            </Text>
            {result.enrollmentNumbers.map((n, i) => (
              <View key={i} className="flex-row items-center gap-2 mb-2">
                <View className="w-6 h-6 bg-violet-100 rounded-full items-center justify-center">
                  <Text className="text-xs font-bold text-violet-600">{i + 1}</Text>
                </View>
                <Text className="text-lg font-bold text-violet-700 tracking-widest">
                  {n}
                </Text>
              </View>
            ))}
          </View>
        )}

        {result.invoice && (
          <View
            className="bg-white rounded-2xl p-5 mb-6"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
          >
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Taxa de Matrícula
            </Text>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-gray-600">Valor</Text>
              <Text className="text-base font-bold text-gray-800">
                {fmtBRL(result.invoice.amount)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-gray-600">Vencimento</Text>
              <Text className="text-sm text-gray-700">
                {result.invoice.due_date
                  ? new Date(result.invoice.due_date + "T00:00:00").toLocaleDateString("pt-BR")
                  : "—"}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-600">Status</Text>
              <View
                className={`px-3 py-1 rounded-full ${
                  isPaid ? "bg-green-100" : "bg-amber-100"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isPaid ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {isPaid ? "Pago" : "Pendente"}
                </Text>
              </View>
            </View>
            {result.invoice.paid_at && (
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-sm text-gray-600">Pago em</Text>
                <Text className="text-sm text-gray-700">
                  {new Date(result.invoice.paid_at + "T00:00:00").toLocaleDateString("pt-BR")}
                </Text>
              </View>
            )}
          </View>
        )}

        <View className="flex-row gap-3 justify-center">
          <TouchableOpacity
            onPress={() => {
              setResult(null);
              setStudentId(""); setCourseId(""); setPlanId(""); setClassId("");
              setBundleId(""); setBundleClassMap({}); setGuardianId("");
              setDiscount("0"); setDueDay("10"); setPayNow(false);
              setStartDate(""); setEndDate(""); setOverrideDates(false); setPayNotes("");
            }}
            className="flex-row items-center gap-2 px-6 py-3 rounded-xl border border-violet-200 bg-violet-50"
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#7C3AED" />
            <Text className="text-sm font-semibold text-violet-600">
              Nova Matrícula
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigate("matriculas")}
            className="flex-row items-center gap-2 px-6 py-3 rounded-xl bg-violet-600"
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={16} color="white" />
            <Text className="text-sm font-bold text-white">Ver Matrículas</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

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
          onPress={() => navigate("matriculas")}
          className="flex-row items-center gap-1.5"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#7C3AED" />
          <Text className="text-sm font-medium text-violet-600">Matrículas</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
        <Text className="text-sm text-gray-500">Nova Matrícula</Text>
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">Nova Matrícula</Text>
        <Text className="text-sm text-gray-500">
          Matrícula por plano individual ou pacote de cursos
        </Text>
      </View>

      {/* ── Mode selector ── */}
      <View className="flex-row gap-3 mb-5">
        {(["plan", "bundle"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border-2 ${
              mode === m
                ? "bg-violet-600 border-violet-600"
                : "bg-white border-gray-200"
            }`}
          >
            <Ionicons
              name={m === "plan" ? "document-text-outline" : "albums-outline"}
              size={18}
              color={mode === m ? "white" : "#6B7280"}
            />
            <Text
              className={`text-sm font-semibold ${
                mode === m ? "text-white" : "text-gray-600"
              }`}
            >
              {m === "plan" ? "Plano Individual" : "Pacote de Cursos"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Card: Dados da Matrícula ── */}
      <View
        className="bg-white rounded-2xl p-6 mb-5"
        style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
      >
        <View className="flex-row items-center gap-2 mb-5">
          <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">
            <Ionicons name="person-outline" size={16} color="#7C3AED" />
          </View>
          <Text className="text-base font-semibold text-gray-800">
            Dados da Matrícula
          </Text>
        </View>

        {/* Aluno */}
        <SearchableSelect
          label="Aluno"
          required
          placeholder="Selecione o aluno..."
          modalTitle="Selecionar Aluno"
          options={students.map((s) => ({
            value: String(s.id),
            label: s.name,
            sublabel: s.enrollment_number ?? undefined,
          }))}
          value={studentId}
          onChange={(v) => { setStudentId(v); setGuardianId(""); }}
          error={errors.student_id}
        />

        {/* Responsável financeiro */}
        {guardians.length > 0 && (
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-600 mb-1.5">
              Responsável Financeiro
            </Text>
            <select
              value={guardianId}
              onChange={(e: any) => setGuardianId(e.target.value)}
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
              <option value="">Nenhum (usar padrão)</option>
              {guardians.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </View>
        )}

        {/* ── PLAN mode fields ── */}
        {mode === "plan" && (
          <>
            <View className="flex-row gap-4 mb-3">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 mb-1.5">
                  Curso <Text className="text-red-500">*</Text>
                </Text>
                <select
                  value={courseId}
                  onChange={(e: any) => { setCourseId(e.target.value); setPlanId(""); }}
                  style={{
                    width: "100%",
                    border: `1px solid ${errors.course_id ? "#EF4444" : "#E5E7EB"}`,
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: courseId ? "#374151" : "#9CA3AF",
                    backgroundColor: "white",
                  }}
                >
                  <option value="">Selecione o curso</option>
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
                {errors.course_id && (
                  <Text className="text-xs text-red-500 mt-1">{errors.course_id}</Text>
                )}
              </View>

              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-600 mb-1.5">
                  Plano <Text className="text-red-500">*</Text>
                </Text>
                {loadingPlans ? (
                  <View style={{ height: 40 }} className="items-center justify-center">
                    <ActivityIndicator size="small" color="#7C3AED" />
                  </View>
                ) : (
                  <select
                    value={planId}
                    onChange={(e: any) => setPlanId(e.target.value)}
                    disabled={!courseId || plans.length === 0}
                    style={{
                      width: "100%",
                      border: `1px solid ${errors.course_plan_id ? "#EF4444" : "#E5E7EB"}`,
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 14,
                      color: planId ? "#374151" : "#9CA3AF",
                      backgroundColor: "white",
                      opacity: !courseId ? 0.6 : 1,
                    }}
                  >
                    <option value="">
                      {!courseId
                        ? "Selecione o curso primeiro"
                        : plans.length === 0
                        ? "Nenhum plano ativo"
                        : "Selecione o plano"}
                    </option>
                    {plans.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} — {p.cycle_label} — {fmtBRL(p.price)}
                      </option>
                    ))}
                  </select>
                )}
                {errors.course_plan_id && (
                  <Text className="text-xs text-red-500 mt-1">{errors.course_plan_id}</Text>
                )}
              </View>
            </View>

            {selectedPlan && (
              <View className="flex-row items-center gap-2 bg-violet-50 rounded-lg px-3 py-2 mb-3">
                <Ionicons name="information-circle-outline" size={14} color="#7C3AED" />
                <Text className="text-xs text-violet-600">
                  {selectedPlan.cycle_label} · {fmtBRL(selectedPlan.price)} · equivalente a{" "}
                  <Text className="font-bold">{fmtBRL(selectedPlan.monthly_equivalent)}/mês</Text>
                </Text>
              </View>
            )}

            <View className="mb-3">
              <SearchableSelect
                label="Turma"
                required
                placeholder="Selecione a turma"
                modalTitle="Selecionar Turma"
                value={classId}
                onChange={setClassId}
                error={errors.school_class_id}
                options={(courseId ? classesForCourse(Number(courseId)) : classes).map((cl) => ({
                  value: String(cl.id),
                  label: cl.name + (cl.course ? ` — ${cl.course.name}` : ""),
                  sublabel: classScheduleLabel(cl) || undefined,
                }))}
              />
            </View>
          </>
        )}

        {/* ── BUNDLE mode fields ── */}
        {mode === "bundle" && (
          <>
            <View className="mb-3">
              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                Pacote <Text className="text-red-500">*</Text>
              </Text>
              {loadingBundles ? (
                <View style={{ height: 40 }} className="items-center justify-center">
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : (
                <select
                  value={bundleId}
                  onChange={(e: any) => setBundleId(e.target.value)}
                  style={{
                    width: "100%",
                    border: `1px solid ${errors.bundle_id ? "#EF4444" : "#E5E7EB"}`,
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: bundleId ? "#374151" : "#9CA3AF",
                    backgroundColor: "white",
                  }}
                >
                  <option value="">Selecione o pacote</option>
                  {bundles.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} — {b.cycle_label} — {fmtBRL(b.price)}
                    </option>
                  ))}
                </select>
              )}
              {errors.bundle_id && (
                <Text className="text-xs text-red-500 mt-1">{errors.bundle_id}</Text>
              )}
            </View>

            {selectedBundle && (
              <>
                <View className="flex-row items-center gap-2 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                  <Ionicons name="albums-outline" size={14} color="#D97706" />
                  <Text className="text-xs text-amber-700">
                    {selectedBundle.cycle_label} · {fmtBRL(selectedBundle.price)} ·{" "}
                    <Text className="font-bold">
                      {fmtBRL(selectedBundle.monthly_equivalent)}/mês
                    </Text>{" "}
                    · {selectedBundle.courses.length} curso(s)
                  </Text>
                </View>

                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Turma por Curso
                </Text>
                {selectedBundle.courses.map((c) => {
                  const courseClasses = classesForCourse(c.id);
                  return (
                    <View key={c.id} className="mb-3">
                      <Text className="text-xs font-medium text-gray-600 mb-1.5">
                        {c.name} <Text className="text-red-500">*</Text>
                      </Text>
                      <SearchableSelect
                        placeholder="Selecione a turma"
                        modalTitle={`Turma — ${c.name}`}
                        value={bundleClassMap[c.id] ?? ""}
                        onChange={(v) =>
                          setBundleClassMap((prev) => ({ ...prev, [c.id]: v }))
                        }
                        error={errors[`class_${c.id}`]}
                        options={(courseClasses.length > 0 ? courseClasses : classes).map((cl) => ({
                          value: String(cl.id),
                          label: cl.name,
                          sublabel: classScheduleLabel(cl) || undefined,
                        }))}
                      />
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Dates — inherited from class, override optional */}
        <TouchableOpacity
          onPress={() => {
            const next = !overrideDates;
            setOverrideDates(next);
            if (!next) { setStartDate(""); setEndDate(""); }
          }}
          activeOpacity={0.8}
          className="flex-row items-center gap-2 mb-3"
        >
          <View
            className={`w-4 h-4 rounded border items-center justify-center ${
              overrideDates ? "bg-violet-600 border-violet-600" : "border-gray-400"
            }`}
          >
            {overrideDates && <Ionicons name="checkmark" size={11} color="white" />}
          </View>
          <Text className="text-xs font-medium text-gray-600">
            Sobrescrever datas da turma (opcional)
          </Text>
        </TouchableOpacity>

        {overrideDates && (
          <View className="flex-row gap-4 mb-3">
            <View className="flex-1">
              <DatePickerInput
                label="Data de Início"
                value={startDate}
                onChangeText={setStartDate}
                error={errors.start_date}
              />
            </View>
            <View className="flex-1">
              <DatePickerInput
                label="Data de Término"
                value={endDate}
                onChangeText={setEndDate}
                error={errors.end_date}
              />
            </View>
          </View>
        )}

        {!overrideDates && (
          <View className="flex-row items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
            <Ionicons name="information-circle-outline" size={14} color="#3B82F6" />
            <Text className="text-xs text-blue-600">
              As datas serão herdadas automaticamente da turma selecionada.
            </Text>
          </View>
        )}

        {/* Discount + Due day */}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Desconto (R$)"
              value={discount}
              onChangeText={setDiscount}
              error={errors.discount_amount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Vencimento (dia do mês)"
              value={dueDay}
              onChangeText={setDueDay}
              error={errors.payment_due_day}
              placeholder="1–28"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Price preview */}
        {discountedEquivalent() !== null && (
          <View className="flex-row items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mt-3">
            <Ionicons name="cash-outline" size={14} color="#16A34A" />
            <Text className="text-xs text-green-700">
              Taxa de matrícula estimada:{" "}
              <Text className="font-bold">{fmtBRL(discountedEquivalent()!)}</Text>
              {parseFloat(discount) > 0 && (
                <Text className="text-green-500">
                  {" "}(desconto de {fmtBRL(parseFloat(discount.replace(",", ".")) || 0)})
                </Text>
              )}
            </Text>
          </View>
        )}
      </View>

      {/* ── Card: Taxa de Matrícula ── */}
      <View
        className="bg-white rounded-2xl p-6 mb-5"
        style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 bg-green-100 rounded-lg items-center justify-center">
              <Ionicons name="cash-outline" size={16} color="#16A34A" />
            </View>
            <View>
              <Text className="text-base font-semibold text-gray-800">
                Taxa de Matrícula
              </Text>
              <Text className="text-xs text-gray-400">
                Uma invoice será criada automaticamente
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-gray-600">
              {payNow ? "Pagar agora" : "Deixar pendente"}
            </Text>
            <Switch
              value={payNow}
              onValueChange={setPayNow}
              trackColor={{ false: "#E5E7EB", true: "#7C3AED" }}
              thumbColor="white"
            />
          </View>
        </View>

        {!payNow && (
          <View className="flex-row items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
            <Ionicons name="time-outline" size={14} color="#D97706" />
            <Text className="text-xs text-amber-700">
              A invoice será criada como <Text className="font-bold">pendente</Text> e poderá ser paga depois.
            </Text>
          </View>
        )}

        {payNow && (
          <View className="gap-3">
            <View>
              <Text className="text-xs font-medium text-gray-600 mb-1.5">
                Método de Pagamento <Text className="text-red-500">*</Text>
              </Text>
              <select
                value={payMethod}
                onChange={(e: any) => setPayMethod(e.target.value)}
                style={{
                  width: "100%",
                  border: `1px solid ${errors.payment_method ? "#EF4444" : "#E5E7EB"}`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontSize: 14,
                  color: payMethod ? "#374151" : "#9CA3AF",
                  backgroundColor: "white",
                }}
              >
                <option value="">Selecione o método</option>
                {paymentMethodOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {errors.payment_method && (
                <Text className="text-xs text-red-500 mt-1">{errors.payment_method}</Text>
              )}
            </View>

            <DatePickerInput
              label="Data do Pagamento"
              value={paidAt}
              onChangeText={setPaidAt}
            />

            <FormInput
              label="Observação"
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder="Ex: Pago na recepção"
              multiline
            />

            <View className="flex-row items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
              <Text className="text-xs text-green-700">
                A invoice será marcada como <Text className="font-bold">paga</Text>.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Actions ── */}
      <View className="flex-row justify-end gap-3">
        <TouchableOpacity
          onPress={() => navigate("matriculas")}
          className="px-6 py-3 rounded-xl border border-gray-200 bg-white"
          activeOpacity={0.8}
        >
          <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={saving}
          className="flex-row items-center gap-2 px-8 py-3 rounded-xl bg-violet-600"
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="white" />
              <Text className="text-sm font-bold text-white">Matricular</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
