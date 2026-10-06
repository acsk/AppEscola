import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { usePaymentMethods } from "../../hooks/useDomains";
import {
  manualPaymentMethodOptions,
  requiresCardPaymentReference,
} from "../../utils/paymentMethods";
import {
  currencyToFloat,
  displayToISO,
  isoToDisplay,
  parsePaymentDueDay,
} from "../../utils/masks";
import SearchableSelect from "../../components/ui/SearchableSelect";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useBillingSettings } from "../../hooks/useBillingSettings";
import { unwrapApi } from "../../types/api";
import type {
  BundleSummary,
  CoursePlanSummary,
  CourseSummary,
  EnrollmentFormScreenProps,
  SchoolClassWithSchedules,
  StudentPickerItem,
  SubscribeInvoiceResult,
} from "../../types/matriculas";
import type { GuardianRef } from "../../types/entities";
import ScreenBreadcrumb from "../../components/ui/ScreenBreadcrumb";

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sext",
  saturday: "S\u00e1b",
  sunday: "Dom",
};

const fmtTime = (t: string) => t.slice(0, 5);

const classScheduleLabel = (sc: SchoolClassWithSchedules): string => {
  if (!sc.schedules || sc.schedules.length === 0) return "";
  return sc.schedules
    .map((s) => `${WEEKDAY_SHORT[s.weekday] ?? s.weekday} ${fmtTime(s.start_time)}\u2013${fmtTime(s.end_time)}`)
    .join(" · ");
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/** Taxa cadastrada no plano (vazio/zero = sem taxa). */
const parseEnrollmentFeeAmount = (
  value: string | number | undefined | null
): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const n =
    typeof value === "string"
      ? parseFloat(value.replace(",", "."))
      : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const todayDisplay = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};

export default function EnrollmentFormScreen({ navigate }: EnrollmentFormScreenProps) {
  const { contentPadding } = useResponsiveLayout();
  const scrollRef = useRef<ScrollView>(null);

  // ── Billing/Enrollment rules (source of truth: backend) ────────────────────
  const {
    billing: billingRules,
    enrollment: enrollmentRules,
  } = useBillingSettings();

  const chargesEnrollmentFee = billingRules.charges_enrollment_fee !== false; // default true
  const enrollmentFeeCoversFirstMonth = billingRules.enrollment_fee_covers_first_month === true;
  const chargeFirstMonthlyAtEnrollment =
    billingRules.charge_first_monthly_at_enrollment !== false;
  const allowMonthliesBeforeFeePaid = billingRules.allow_monthlies_before_fee_paid !== false;
  const defaultPaymentDueDay = Number.isFinite(Number(billingRules.default_payment_due_day))
    ? Number(billingRules.default_payment_due_day)
    : null;
  const requireCpfToEnroll = enrollmentRules.require_cpf_to_enroll === true;
  const requireGuardianForMinors = enrollmentRules.require_guardian_for_minors === true;

  // ── Mode ────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"plan" | "bundle">("plan");

  // ── Lookup data ─────────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [plans, setPlans] = useState<CoursePlanSummary[]>([]);
  const [classes, setClasses] = useState<SchoolClassWithSchedules[]>([]);
  const [bundles, setBundles] = useState<BundleSummary[]>([]);
  const [guardians, setGuardians] = useState<GuardianRef[]>([]);

  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingBundles, setLoadingBundles] = useState(false);

  const paymentMethods = usePaymentMethods();
  const paymentMethodOptions = manualPaymentMethodOptions(paymentMethods);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [studentId, setStudentId] = useState("");
  const [studentDetail, setStudentDetail] = useState<StudentPickerItem | null>(null);
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
  const [dueDay, setDueDay] = useState("");
  const [dueDayTouched, setDueDayTouched] = useState(false);

  // Payment toggle
  const [payNow, setPayNow] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayDisplay());
  const [payNotes, setPayNotes] = useState("");

  // ── State ────────────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | {
    enrollmentNumbers: string[];
    invoice: SubscribeInvoiceResult;
    bundleName?: string;
  }>(null);

  // ── Load lookups on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [cRes, clRes] = await Promise.all([
          api.get("/courses", { params: { status: "active", per_page: 200 } }),
          api.get("/school-classes", { params: { status: "active", per_page: 200 } }),
        ]);
        setCourses(cRes.data.data ?? []);
        setClasses(clRes.data.data ?? []);
      } catch {}
    })();
  }, []);

  // Load guardians when student changes
  useEffect(() => {
    if (!studentId) {
      setGuardians([]);
      setGuardianId("");
      setStudentDetail(null);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/students/${studentId}`);
        const student = unwrapApi<Record<string, unknown>>(data);
        const guardianRows = Array.isArray(student.guardians) ? student.guardians : [];
        const g = guardianRows.map((r: any) => ({
          id: r.guardian?.id ?? r.id,
          name: r.guardian?.name ?? r.name,
          document: r.guardian?.document ?? r.document ?? null,
        }));
        setGuardians(g);
        setGuardianId(g.length > 0 ? String(g[0].id) : "");
        setStudentDetail({
          id: Number(student.id),
          name: String(student.name ?? ""),
          enrollment_number: (student.enrollment_number as string) ?? null,
          document: (student.document as string) ?? null,
          birth_date: (student.birth_date as string) ?? null,
        });
      } catch {}
    })();
  }, [studentId]);

  const searchStudents = useCallback(async (query: string) => {
    const { data } = await api.get("/students", {
      params: {
        status: "active",
        search: query.trim() || undefined,
        per_page: 50,
      },
    });
    const unwrapped = unwrapApi<{ data?: StudentPickerItem[] } | StudentPickerItem[]>(data);
    const list: StudentPickerItem[] = Array.isArray(unwrapped)
      ? unwrapped
      : (unwrapped?.data ?? []);
    return list.map((s) => ({
      value: String(s.id),
      label: s.name,
      sublabel: s.enrollment_number ?? undefined,
    }));
  }, []);

  // Pré-preencher vencimento com o default do tenant (regra do backend)
  useEffect(() => {
    if (dueDayTouched) return;
    if (defaultPaymentDueDay == null) return;
    setDueDay(String(defaultPaymentDueDay));
  }, [defaultPaymentDueDay, dueDayTouched]);

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

  const planEnrollmentFeeAmount =
    mode === "plan" && selectedPlan
      ? parseEnrollmentFeeAmount(selectedPlan.enrollment_fee_amount)
      : null;

  const planMonthlyEquivalent =
    mode === "plan" && selectedPlan?.monthly_equivalent != null
      ? parseFloat(String(selectedPlan.monthly_equivalent))
      : null;

  /** Taxa de matrícula no ato (plano com valor cadastrado ou pacote). */
  const showEnrollmentFeePayment =
    chargesEnrollmentFee &&
    (mode === "bundle" || planEnrollmentFeeAmount !== null);

  /** Plano sem taxa: 1ª mensalidade na matrícula (ex. curso 30 dias). */
  const showFirstMonthlyPayment =
    mode === "plan" &&
    chargeFirstMonthlyAtEnrollment &&
    planEnrollmentFeeAmount === null &&
    (planMonthlyEquivalent ?? 0) > 0;

  const showInitialPayment = showEnrollmentFeePayment || showFirstMonthlyPayment;
  const initialPaymentKind: "enrollment_fee" | "first_monthly" = showEnrollmentFeePayment
    ? "enrollment_fee"
    : "first_monthly";

  const classesForCourse = (cId: number) =>
    classes.filter((cl) => cl.course?.id === cId);

  // ── Derived: idade / menor ───────────────────────────────────────────────────
  const isMinor = (() => {
    const bd = studentDetail?.birth_date;
    if (!bd) return false;
    const d = new Date(bd + "T00:00:00");
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age < 18;
  })();

  const onlyDigits = (s: string) => s.replace(/\D+/g, "");
  const hasCpfStudent = !!studentDetail?.document && onlyDigits(studentDetail.document).length >= 11;
  const selectedGuardian = guardians.find((g) => String(g.id) === guardianId);
  const hasCpfGuardian = !!selectedGuardian?.document && onlyDigits(selectedGuardian.document).length >= 11;
  const hasPayerCpf = guardianId ? hasCpfGuardian : hasCpfStudent;

  // ── Monthly equivalent preview ───────────────────────────────────────────────
  const baseEquivalent = () => {
    if (mode === "plan" && selectedPlan)
      return parseFloat(selectedPlan.monthly_equivalent);
    if (mode === "bundle" && selectedBundle)
      return parseFloat(selectedBundle.monthly_equivalent);
    return null;
  };

  const discountedInitialCharge = () => {
    const disc = currencyToFloat(discount || "0");
    if (mode === "bundle") {
      const base = baseEquivalent();
      if (base === null) return null;
      return Math.max(0, base - disc);
    }
    if (showFirstMonthlyPayment) {
      const base = baseEquivalent();
      if (base === null) return null;
      return Math.max(0, base - disc);
    }
    if (planEnrollmentFeeAmount === null) return null;
    return Math.max(0, planEnrollmentFeeAmount - disc);
  };

  useEffect(() => {
    if (!showInitialPayment) {
      setPayNow(false);
      setPayMethod("");
      setPayReference("");
      setPayNotes("");
    }
  }, [showInitialPayment, planId, bundleId, mode]);

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

    // Regras vindas do backend
    if (requireGuardianForMinors && isMinor && !guardianId) {
      e.guardian_id =
        "Aluno menor de idade: selecione um responsável financeiro.";
    }
    if (requireCpfToEnroll && studentId && !hasPayerCpf) {
      e.cpf = guardianId
        ? "CPF do responsável financeiro é obrigatório para concluir a matrícula."
        : "CPF do aluno (pagador) é obrigatório para concluir a matrícula.";
    }

    if (showInitialPayment && payNow && !payMethod) {
      e.payment_method = "Selecione o método de pagamento.";
    }
    if (
      showInitialPayment &&
      payNow &&
      requiresCardPaymentReference(payMethod) &&
      !payReference.trim()
    ) {
      e.payment_reference = "Informe o identificador da transação no cartão.";
    }
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
    setBusinessError(null);

    try {
      const enrollmentPayment =
        showInitialPayment && payNow
          ? {
              payment_method: payMethod,
              paid_at: displayToISO(paidAt) ?? todayISO(),
              payment_reference: payReference.trim() || undefined,
              notes: payNotes.trim() || undefined,
            }
          : undefined;

      const pickPrimaryInvoice = (invoices: any[] | undefined) => {
        const list = invoices ?? [];
        return (
          list.find((i) => i.type === "enrollment_fee") ??
          list.find((i) => i.type === "monthly") ??
          list[0] ??
          null
        );
      };

      if (mode === "plan") {
        const payload: Record<string, any> = {
          student_id: Number(studentId),
          school_class_id: Number(classId),
          course_plan_id: Number(planId),
          discount_amount: currencyToFloat(discount || "0"),
          payment_due_day: parsePaymentDueDay(dueDay) ?? undefined,
          guardian_id: guardianId ? Number(guardianId) : undefined,
        };
        if (startDate) payload.start_date = displayToISO(startDate) ?? startDate;
        if (endDate) payload.end_date = displayToISO(endDate) ?? endDate;
        payload.enrollment_payment = enrollmentPayment ?? {};

        const { data } = await api.post("/enrollments/subscribe", payload);
        setResult({
          enrollmentNumbers: [data.enrollment_number].filter(Boolean),
          invoice: pickPrimaryInvoice(data.invoices),
        });
      } else {
        const schoolClassIds = selectedBundle!.courses.map(
          (c) => Number(bundleClassMap[c.id])
        );
        const payload: Record<string, any> = {
          student_id: Number(studentId),
          bundle_id: Number(bundleId),
          school_class_ids: schoolClassIds,
          discount_amount: currencyToFloat(discount || "0"),
          payment_due_day: parsePaymentDueDay(dueDay) ?? undefined,
          guardian_id: guardianId ? Number(guardianId) : undefined,
        };
        if (startDate) payload.start_date = displayToISO(startDate) ?? startDate;
        if (endDate) payload.end_date = displayToISO(endDate) ?? endDate;
        payload.enrollment_payment = enrollmentPayment ?? {};

        const { data } = await api.post("/enrollments/subscribe-bundle", payload);
        const bundleEnrollment = data.enrollment ?? data.enrollments?.[0];
        setResult({
          enrollmentNumbers: [bundleEnrollment?.enrollment_number].filter(Boolean),
          invoice: data.enrollment_fee,
          bundleName: data.bundle?.name,
        });
      }
    } catch (e: any) {
      const status = e.response?.status;
      const data = e.response?.data;
      if (status === 422) {
        const fieldErrors = data?.errors ?? {};
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(parseApiErrors(fieldErrors));
        }
        // Mensagem de regra de negócio (ex.: bloqueio por taxa pendente
        // quando allow_monthlies_before_fee_paid = false).
        if (data?.message) {
          setBusinessError(data.message);
        }
      } else if (status === 403) {
        setBusinessError(
          data?.message || "Sem permissão para realizar esta matrícula."
        );
      } else if (status === 404) {
        setBusinessError(data?.message || "Recurso não encontrado.");
      } else {
        setBusinessError(
          data?.message || "Falha ao realizar matrícula. Tente novamente."
        );
      }
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }

    setSaving(false);
  };

  // ── Success screen ───────────────────────────────────────────────────────────
  if (result) {
    const isPaid = result.invoice?.status === "paid";
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
      >
        <View className="items-center py-8">
          <View className="w-20 h-20 bg-success-tint rounded-full items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={48} color="#1C6A45" />
          </View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight mb-1">
            Matrícula realizada!
          </Text>
          <Text className="text-sm text-ink-muted text-center">
            {mode === "bundle"
              ? `Pacote ${result.bundleName ?? ""} — matrícula ${result.enrollmentNumbers[0] ?? ""} criada`
              : "Matrícula criada com sucesso"}
          </Text>
        </View>

        {result.enrollmentNumbers.length > 0 && (
          <View
            className="bg-surface rounded-ds-md p-5 mb-4 border border-border"
            style={{ }}
          >
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
              Número(s) de Matrícula
            </Text>
            {result.enrollmentNumbers.map((n, i) => (
              <View key={i} className="flex-row items-center gap-2 mb-2">
                <View className="w-6 h-6 bg-brand-tint rounded-full items-center justify-center">
                  <Text className="text-xs font-semibold text-brand">{i + 1}</Text>
                </View>
                <Text className="text-lg font-semibold text-brand tracking-widest">
                  {n}
                </Text>
              </View>
            ))}
          </View>
        )}

        {result.invoice && (
          <View
            className="bg-surface rounded-ds-md p-5 mb-6 border border-border"
            style={{ }}
          >
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
              {result.invoice.type === "monthly"
                ? "Primeira mensalidade"
                : "Taxa de matrícula"}
            </Text>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-ink-muted">Valor</Text>
              <Text className="text-base font-semibold text-ink">
                {fmtBRL(result.invoice.amount)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-ink-muted">Vencimento</Text>
              <Text className="text-sm text-ink">
                {result.invoice.due_date
                  ? new Date(result.invoice.due_date + "T00:00:00").toLocaleDateString("pt-BR")
                  : "—"}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-ink-muted">Status</Text>
              <View
                className={`px-3 py-1 rounded-full ${
                  isPaid ? "bg-success-tint" : "bg-warning-tint"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isPaid ? "text-success" : "text-warning"
                  }`}
                >
                  {isPaid ? "Pago" : "Pendente"}
                </Text>
              </View>
            </View>
            {result.invoice.paid_at && (
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-sm text-ink-muted">Pago em</Text>
                <Text className="text-sm text-ink">
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
              setDiscount("0");
              setDueDay(defaultPaymentDueDay != null ? String(defaultPaymentDueDay) : "");
              setDueDayTouched(false);
              setPayNow(false);
              setStartDate(""); setEndDate(""); setOverrideDates(false); setPayNotes("");
              setBusinessError(null);
            }}
            className="flex-row items-center gap-2 px-6 py-3 rounded-ds-md border border-border bg-brand-tint"
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#1C3D63" />
            <Text className="text-sm font-semibold text-brand">
              Nova matrícula
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigate("matriculas")}
            className="flex-row items-center gap-2 px-6 py-3 rounded-ds-md bg-brand"
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={16} color="white" />
            <Text className="text-sm font-semibold text-white">Ver matrículas</Text>
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
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBreadcrumb items={[{ label: "Matrículas", onPress: () => navigate("matriculas") }, { label: "Nova matrícula" }]} />

      <View className="mb-6">
        <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Nova matrícula</Text>
        <Text className="text-sm text-ink-muted">
          Matrícula por plano individual ou pacote de cursos
        </Text>
      </View>

      {businessError && (
        <View className="flex-row items-start gap-2 bg-danger-tint border border-danger rounded-ds-md px-4 py-3 mb-4">
          <Ionicons name="alert-circle" size={18} color="#B0261B" />
          <Text className="flex-1 text-sm text-danger">{businessError}</Text>
          <TouchableOpacity onPress={() => setBusinessError(null)} activeOpacity={0.7}>
            <Ionicons name="close" size={16} color="#B0261B" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mode selector ── */}
      <View className="flex-row gap-3 mb-5">
        {(["plan", "bundle"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-ds-md border-2 ${
              mode === m
                ? "bg-brand border-brand"
                : "bg-surface border-border"
            }`}
          >
            <Ionicons
              name={m === "plan" ? "document-text-outline" : "albums-outline"}
              size={18}
              color={mode === m ? "white" : "#4B5463"}
            />
            <Text
              className={`text-sm font-semibold ${
                mode === m ? "text-white" : "text-ink-muted"
              }`}
            >
              {m === "plan" ? "Plano individual" : "Pacote de cursos"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Card: Dados da Matrícula ── */}
      <View
        className="bg-surface rounded-ds-md p-6 mb-5 border border-border"
        style={{ }}
      >
        <View className="flex-row items-center gap-2 mb-5">
          <Text className="text-base font-semibold text-ink">
            Dados da matrícula
          </Text>
        </View>

        {/* Aluno */}
        <SearchableSelect
          label="Aluno"
          required
          placeholder="Selecione o aluno..."
          modalTitle="Selecionar aluno"
          options={[]}
          onSearch={searchStudents}
          selectedOption={
            studentDetail
              ? {
                  value: String(studentDetail.id),
                  label: studentDetail.name,
                  sublabel: studentDetail.enrollment_number ?? undefined,
                }
              : undefined
          }
          value={studentId}
          onChange={(v) => { setStudentId(v); setGuardianId(""); }}
          error={errors.student_id}
        />

        {/* Responsável financeiro */}
        {guardians.length > 0 && (
          <View className="mb-3">
            <Text className="text-xs font-medium text-ink-muted mb-1.5">
              Responsável financeiro
            </Text>
            <select
              value={guardianId}
              onChange={(e: any) => setGuardianId(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #D9DDE3",
                borderRadius: 4,
                padding: "9px 12px",
                fontSize: 14,
                color: "#111722",
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
            {errors.guardian_id && (
              <Text className="text-xs text-danger mt-1">{errors.guardian_id}</Text>
            )}
          </View>
        )}

        {/* Aviso: menor de idade exige responsável (regra do backend) */}
        {studentId && requireGuardianForMinors && isMinor && !guardianId && (
          <View className="flex-row items-start gap-2 bg-warning-tint border border-warning rounded-ds-md px-3 py-2 mb-3">
            <Ionicons name="warning-outline" size={14} color="#8A5200" />
            <Text className="flex-1 text-xs text-warning">
              Aluno menor de idade. Selecione um <Text className="font-semibold">responsável financeiro</Text> para concluir a matrícula.
            </Text>
          </View>
        )}

        {/* Aviso: CPF obrigatório (regra do backend) */}
        {studentId && requireCpfToEnroll && !hasPayerCpf && (
          <View className="flex-row items-start gap-2 bg-warning-tint border border-warning rounded-ds-md px-3 py-2 mb-3">
            <Ionicons name="warning-outline" size={14} color="#8A5200" />
            <Text className="flex-1 text-xs text-warning">
              {guardianId
                ? "CPF do responsável financeiro é obrigatório para concluir a matrícula. Atualize o cadastro do responsável."
                : "CPF do aluno (pagador) é obrigatório para concluir a matrícula. Atualize o cadastro do aluno ou vincule um responsável financeiro."}
            </Text>
          </View>
        )}

        {errors.cpf && (
          <Text className="text-xs text-danger mb-2">{errors.cpf}</Text>
        )}

        {/* ── PLAN mode fields ── */}
        {mode === "plan" && (
          <>
            <View className="flex-row gap-4 mb-3">
              <View className="flex-1">
                <Text className="text-xs font-medium text-ink-muted mb-1.5">
                  Curso <Text className="text-danger">*</Text>
                </Text>
                <select
                  value={courseId}
                  onChange={(e: any) => { setCourseId(e.target.value); setPlanId(""); }}
                  style={{
                    width: "100%",
                    border: `1px solid ${errors.course_id ? "#B0261B" : "#D9DDE3"}`,
                    borderRadius: 4,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: courseId ? "#111722" : "#5F6878",
                    backgroundColor: "white",
                  }}
                >
                  <option value="">Selecione o curso</option>
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
                {errors.course_id && (
                  <Text className="text-xs text-danger mt-1">{errors.course_id}</Text>
                )}
              </View>

              <View className="flex-1">
                <Text className="text-xs font-medium text-ink-muted mb-1.5">
                  Plano <Text className="text-danger">*</Text>
                </Text>
                {loadingPlans ? (
                  <View style={{ height: 40 }} className="items-center justify-center">
                    <ActivityIndicator size="small" color="#1C3D63" />
                  </View>
                ) : (
                  <select
                    value={planId}
                    onChange={(e: any) => setPlanId(e.target.value)}
                    disabled={!courseId || plans.length === 0}
                    style={{
                      width: "100%",
                      border: `1px solid ${errors.course_plan_id ? "#B0261B" : "#D9DDE3"}`,
                      borderRadius: 4,
                      padding: "9px 12px",
                      fontSize: 14,
                      color: planId ? "#111722" : "#5F6878",
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
                  <Text className="text-xs text-danger mt-1">{errors.course_plan_id}</Text>
                )}
              </View>
            </View>

            {selectedPlan && (
              <View className="space-y-2 mb-3">
                <View className="flex-row items-center gap-2 bg-brand-tint rounded-ds-md px-3 py-2">
                  <Ionicons name="information-circle-outline" size={14} color="#1C3D63" />
                  <Text className="text-xs text-brand">
                    {selectedPlan.cycle_label} · {fmtBRL(selectedPlan.price)} · equivalente a{" "}
                    <Text className="font-semibold">{fmtBRL(selectedPlan.monthly_equivalent)}/mês</Text>
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 bg-warning-tint border border-warning rounded-ds-md px-3 py-2">
                  <Ionicons name="pricetag-outline" size={14} color="#8A5200" />
                  <Text className="text-xs text-warning">
                    Taxa de matrícula do plano: <Text className="font-semibold">
                      {selectedPlan.enrollment_fee_amount
                        ? fmtBRL(selectedPlan.enrollment_fee_amount)
                        : "não definida"}
                    </Text>
                  </Text>
                </View>
              </View>
            )}

            <View className="mb-3">
              <SearchableSelect
                label="Turma"
                required
                placeholder="Selecione a turma"
                modalTitle="Selecionar turma"
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
              <Text className="text-xs font-medium text-ink-muted mb-1.5">
                Pacote <Text className="text-danger">*</Text>
              </Text>
              {loadingBundles ? (
                <View style={{ height: 40 }} className="items-center justify-center">
                  <ActivityIndicator size="small" color="#1C3D63" />
                </View>
              ) : (
                <select
                  value={bundleId}
                  onChange={(e: any) => setBundleId(e.target.value)}
                  style={{
                    width: "100%",
                    border: `1px solid ${errors.bundle_id ? "#B0261B" : "#D9DDE3"}`,
                    borderRadius: 4,
                    padding: "9px 12px",
                    fontSize: 14,
                    color: bundleId ? "#111722" : "#5F6878",
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
                <Text className="text-xs text-danger mt-1">{errors.bundle_id}</Text>
              )}
            </View>

            {selectedBundle && (
              <>
                <View className="flex-row items-center gap-2 bg-warning-tint rounded-ds-md px-3 py-2 mb-4">
                  <Ionicons name="albums-outline" size={14} color="#8A5200" />
                  <Text className="text-xs text-warning">
                    {selectedBundle.cycle_label} · {fmtBRL(selectedBundle.price)} ·{" "}
                    <Text className="font-semibold">
                      {fmtBRL(selectedBundle.monthly_equivalent)}/mês
                    </Text>{" "}
                    · {selectedBundle.courses.length} curso(s)
                  </Text>
                </View>

                <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
                  Turma por curso
                </Text>
                {selectedBundle.courses.map((c) => {
                  const courseClasses = classesForCourse(c.id);
                  return (
                    <View key={c.id} className="mb-3">
                      <Text className="text-xs font-medium text-ink-muted mb-1.5">
                        {c.name} <Text className="text-danger">*</Text>
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
            className={`w-4 h-4 rounded-ds-md border items-center justify-center ${
              overrideDates ? "bg-brand border-brand" : "border-border-strong"
            }`}
          >
            {overrideDates && <Ionicons name="checkmark" size={11} color="white" />}
          </View>
          <Text className="text-xs font-medium text-ink-muted">
            Sobrescrever datas da turma (opcional)
          </Text>
        </TouchableOpacity>

        {overrideDates && (
          <View className="flex-row gap-4 mb-3">
            <View className="flex-1">
              <DatePickerInput
                label="Data de início"
                value={startDate}
                onChangeText={setStartDate}
                error={errors.start_date}
              />
            </View>
            <View className="flex-1">
              <DatePickerInput
                label="Data de término"
                value={endDate}
                onChangeText={setEndDate}
                error={errors.end_date}
              />
            </View>
          </View>
        )}

        {!overrideDates && (
          <View className="flex-row items-center gap-1.5 bg-brand-tint border border-border rounded-ds-md px-3 py-2 mb-3">
            <Ionicons name="information-circle-outline" size={14} color="#1C3D63" />
            <Text className="text-xs text-brand">
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
              placeholder="0,00"
              valueFormat="currency"
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Vencimento (dia do mês)"
              value={dueDay}
              onChangeText={(t) => { setDueDay(t); setDueDayTouched(true); }}
              error={errors.payment_due_day}
              placeholder="1 a 28"
              valueFormat="dueDay"
            />
          </View>
        </View>

        {/* Price preview */}
        {showInitialPayment && discountedInitialCharge() !== null && (
          <View className="flex-row items-center gap-2 bg-success-tint border border-success rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="cash-outline" size={14} color="#1C6A45" />
            <Text className="text-xs text-success">
              {initialPaymentKind === "first_monthly"
                ? "Primeira mensalidade estimada"
                : "Taxa de matrícula estimada"}
              :{" "}
              <Text className="font-semibold">{fmtBRL(discountedInitialCharge()!)}</Text>
              {currencyToFloat(discount || "0") > 0 && (
                <Text className="text-green-500">
                  {" "}(desconto de {fmtBRL(currencyToFloat(discount || "0"))})
                </Text>
              )}
            </Text>
          </View>
        )}

        {showEnrollmentFeePayment && enrollmentFeeCoversFirstMonth && (
          <View className="flex-row items-center gap-2 bg-brand-tint border border-border rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="information-circle-outline" size={14} color="#1C3D63" />
            <Text className="text-xs text-brand">
              A taxa de matrícula equivale ao primeiro mês. As mensalidades serão geradas <Text className="font-semibold">a partir do 2º mês</Text>.
            </Text>
          </View>
        )}

        {!chargesEnrollmentFee && (
          <View className="flex-row items-center gap-2 bg-surface-sunken border border-border rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="information-circle-outline" size={14} color="#4B5463" />
            <Text className="text-xs text-ink-muted">
              Este tenant não cobra taxa de matrícula. Apenas as mensalidades serão geradas conforme o plano.
            </Text>
          </View>
        )}

        {mode === "plan" &&
          selectedPlan &&
          planEnrollmentFeeAmount === null &&
          chargeFirstMonthlyAtEnrollment && (
          <View className="flex-row items-center gap-2 bg-brand-tint border border-border rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="information-circle-outline" size={14} color="#1C3D63" />
            <Text className="text-xs text-brand">
              Este plano não cobra taxa de matrícula. A{" "}
              <Text className="font-semibold">primeira mensalidade</Text> será gerada na matrícula
              (ideal para cursos curtos, ex. 30 dias).
            </Text>
          </View>
        )}

        {mode === "plan" &&
          selectedPlan &&
          planEnrollmentFeeAmount === null &&
          !chargeFirstMonthlyAtEnrollment && (
          <View className="flex-row items-center gap-2 bg-surface-sunken border border-border rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="information-circle-outline" size={14} color="#4B5463" />
            <Text className="text-xs text-ink-muted">
              Este plano não possui taxa de matrícula. Gere as mensalidades depois em Cobranças.
            </Text>
          </View>
        )}

        {!allowMonthliesBeforeFeePaid && showEnrollmentFeePayment && (
          <View className="flex-row items-start gap-2 bg-warning-tint border border-warning rounded-ds-md px-3 py-2 mt-3">
            <Ionicons name="alert-circle-outline" size={14} color="#8A5200" />
            <Text className="flex-1 text-xs text-warning">
              Mensalidades só serão geradas após a quitação da taxa de matrícula.
            </Text>
          </View>
        )}
      </View>

      {/* ── Pagamento no ato (taxa ou 1ª mensalidade) ── */}
      {showInitialPayment && (
      <View
        className="bg-surface rounded-ds-md p-6 mb-5 border border-border"
        style={{ }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <View>
              <Text className="text-base font-semibold text-ink">
                {initialPaymentKind === "first_monthly"
                  ? "Primeira mensalidade"
                  : "Taxa de matrícula"}
              </Text>
              <Text className="text-xs text-ink-subtle">
                {initialPaymentKind === "first_monthly"
                  ? "Substitui a taxa de matrícula neste plano"
                  : "Uma invoice será criada automaticamente"}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-ink-muted">
              {payNow ? "Pagar agora" : "Deixar pendente"}
            </Text>
            <Switch
              value={payNow}
              onValueChange={setPayNow}
              trackColor={{ false: "#D9DDE3", true: "#1C3D63" }}
              thumbColor="white"
            />
          </View>
        </View>

        {!payNow && (
          <View className="flex-row items-center gap-2 bg-warning-tint rounded-ds-md px-3 py-2">
            <Ionicons name="time-outline" size={14} color="#8A5200" />
            <Text className="text-xs text-warning">
              A invoice será criada como <Text className="font-semibold">pendente</Text> e poderá ser paga depois.
            </Text>
          </View>
        )}

        {payNow && (
          <View className="gap-3">
            <View>
              <Text className="text-xs font-medium text-ink-muted mb-1.5">
                Método de Pagamento <Text className="text-danger">*</Text>
              </Text>
              <select
                value={payMethod}
                onChange={(e: any) => setPayMethod(e.target.value)}
                style={{
                  width: "100%",
                  border: `1px solid ${errors.payment_method ? "#B0261B" : "#D9DDE3"}`,
                  borderRadius: 4,
                  padding: "9px 12px",
                  fontSize: 14,
                  color: payMethod ? "#111722" : "#5F6878",
                  backgroundColor: "white",
                }}
              >
                <option value="">Selecione o método</option>
                {paymentMethodOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {errors.payment_method && (
                <Text className="text-xs text-danger mt-1">{errors.payment_method}</Text>
              )}
            </View>

            {requiresCardPaymentReference(payMethod) ? (
              <FormInput
                label="Identificador da transação"
                required
                value={payReference}
                onChangeText={setPayReference}
                error={errors.payment_reference}
                placeholder="NSU, autorização ou comprovante"
              />
            ) : null}

            <DatePickerInput
              label="Data do pagamento"
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

            <View className="flex-row items-center gap-2 bg-success-tint border border-success rounded-ds-md px-3 py-2">
              <Ionicons name="checkmark-circle-outline" size={14} color="#1C6A45" />
              <Text className="text-xs text-success">
                A invoice será marcada como <Text className="font-semibold">paga</Text>.
              </Text>
            </View>
          </View>
        )}
      </View>
      )}

      {/* ── Actions ── */}
      <View className="flex-row justify-end gap-3">
        <TouchableOpacity
          onPress={() => navigate("matriculas")}
          className="px-6 py-3 rounded-ds-md border border-border bg-surface"
          activeOpacity={0.8}
        >
          <Text className="text-sm font-semibold text-ink">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={saving}
          className="flex-row items-center gap-2 px-8 py-3 rounded-ds-md bg-brand"
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="white" />
              <Text className="text-sm font-semibold text-white">Matricular</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
