import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { PixLogoIcon } from "phosphor-react-native";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import MessageModal from "../../components/ui/MessageModal";
import { isoToDisplay, isoToDisplay as isoToDisplayDate, displayToISO, maskDate, maskCurrency, currencyToFloat, floatToCurrency } from "../../utils/masks";
import {
  useEnrollmentStatuses,
  useInvoiceStatuses,
  usePaymentMethods,
  useInvoiceTypes,
  domainToOptions,
} from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useAuth } from "../../contexts/AuthContext";
import {
  ChargeStatusResponse,
  GeneratedCharge,
  PaidChargeResponse,
  PaymentProvider,
  generateUnifiedCharge,
  getUnifiedChargeStatus,
  listPaymentProviders,
  payUnifiedCharge,
} from "../../services/payments";

// ── Types ─────────────────────────────────────────────────────────────────────

type Student = { id: number; name: string; enrollment_number?: string };
type SchoolClass = { id: number; name: string; course?: { id: number; name: string } };
type Guardian = { id: number; name: string };
type CoursePlan = { id: number; name: string; billing_cycle: string; cycle_label: string; price: string };

type Invoice = {
  id: number;
  description: string;
  amount: string;
  due_date: string;
  status: string;
  payment_method: string | null;
  notes: string | null;
  type: string | null;
  edit_reason?: string | null;
  created_by_user?: { id: number; name: string } | null;
  updated_by_user?: { id: number; name: string } | null;
  cora?: {
    charge_id?: string;
    status?: string;
    payment_url?: string;
    pix_copy_paste?: string;
    qr_code_image_url?: string;
    boleto_number?: string;
    boleto_digitable?: string;
  };
  student?: Student;
  guardian?: Guardian;
  enrollment_id: number | null;
};

type Enrollment = {
  id: number;
  enrollment_number: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  monthly_amount: string | null;
  discount_amount: string | null;
  payment_due_day: number | null;
  student?: Student;
  school_class?: SchoolClass;
  guardian?: Guardian;
  course_plan?: CoursePlan;
  created_at?: string;
  invoices?: Invoice[];
};

type EditForm = {
  student_id: string;
  school_class_id: string;
  start_date: string;
  end_date: string;
  status: string;
  monthly_amount: string;
  discount_amount: string;
  payment_due_day: string;
};

type InvoiceForm = {
  description: string;
  amount: string;
  due_date: string;
  status: string;
  type: string;
  payment_method: string;
  notes: string;
  edit_reason: string;
};

const EMPTY_EDIT: EditForm = {
  student_id: "",
  school_class_id: "",
  start_date: "",
  end_date: "",
  status: "active",
  monthly_amount: "",
  discount_amount: "",
  payment_due_day: "",
};

const EMPTY_INVOICE: InvoiceForm = {
  description: "",
  amount: "",
  due_date: "",
  status: "pending",
  type: "",
  payment_method: "",
  notes: "",
  edit_reason: "",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  cancelled: "Cancelado",
  concluded: "Concluído",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  credit_card: "Cartão Crédito",
  debit_card: "Cartão Débito",
  bank_slip: "Boleto",
  bank_transfer: "Transferência",
};

const TYPE_LABELS: Record<string, string> = {
  enrollment_fee: "Taxa de Matrícula",
  monthly: "Mensalidade",
  other: "Outro",
  uniform: "Fardamento",
  material: "Material Didático",
  transport: "Transporte",
  late_fee: "Multa/Juros",
};

const canGenerateChargeForInvoice = (invoice: Invoice | null) => {
  if (!invoice) return false;
  return invoice.status !== "paid" && invoice.status !== "cancelled";
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
  enrollmentId: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EnrollmentDetailScreen({ navigate, enrollmentId }: Props) {
  const { width, isMobile, contentPadding } = useResponsiveLayout();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit enrollment
  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  // Invoice CRUD
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceEditId, setInvoiceEditId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [cancelInvoiceId, setCancelInvoiceId] = useState<number | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [auditInvoice, setAuditInvoice] = useState<Invoice | null>(null);
  const [auditVisible, setAuditVisible] = useState(false);

  // Delete enrollment
  const [deleteEnrollmentVisible, setDeleteEnrollmentVisible] = useState(false);
  const [deletingEnrollment, setDeletingEnrollment] = useState(false);

  // Message modal
  const [msgModal, setMsgModal] = useState<{
    visible: boolean;
    type: "success" | "error" | "warning" | "info";
    title?: string;
    message: string;
  }>({ visible: false, type: "error", message: "" });
  const closeMsgModal = useCallback(() => setMsgModal((p) => ({ ...p, visible: false })), []);
  const showToast = useCallback(
    (type: "success" | "error" | "warning" | "info", message: string, title?: string) => {
      setMsgModal({ visible: true, type, title, message });
    },
    []
  );

  // Charge modal
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [chargeModalVisible, setChargeModalVisible] = useState(false);
  const [chargeInvoice, setChargeInvoice] = useState<Invoice | null>(null);
  const [chargeProvider, setChargeProvider] = useState("");
  const [chargeEnvironment, setChargeEnvironment] = useState<"stage" | "prod">("stage");
  const [chargeMethod, setChargeMethod] = useState("pix");
  const [chargeModalStep, setChargeModalStep] = useState<"select" | "result">("select");
  const [generatingCharge, setGeneratingCharge] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [payingCharge, setPayingCharge] = useState(false);
  const [chargeResult, setChargeResult] = useState<GeneratedCharge | null>(null);
  const [chargeStatusResult, setChargeStatusResult] = useState<ChargeStatusResponse | null>(null);
  const [paidChargeResult, setPaidChargeResult] = useState<PaidChargeResponse | null>(null);
  const [chargeActionError, setChargeActionError] = useState<string | null>(null);

  const { user } = useAuth();
  const isProductionHost =
    typeof window !== "undefined" && window.location.hostname !== "localhost";
  const isSuperAdmin = user?.role === "super_admin";
  // localhost → sempre stage; prod → sempre prod (super_admin pode escolher)
  const defaultChargeEnvironment: "stage" | "prod" = isProductionHost ? "prod" : "stage";
  const canSelectChargeEnvironment = isSuperAdmin;

  const enrollmentStatuses = useEnrollmentStatuses();
  const invoiceStatuses = useInvoiceStatuses();
  const invoiceTypes = useInvoiceTypes();
  const paymentMethods = usePaymentMethods();
  const statusOptions = domainToOptions(enrollmentStatuses).map((o) => ({
    ...o,
    label: ENROLLMENT_STATUS_LABELS[o.value] ?? o.label,
  }));
  const invoiceStatusOptions = domainToOptions(invoiceStatuses).map((o) => ({
    ...o,
    label: INVOICE_STATUS_LABELS[o.value] ?? o.label,
  }));
  const methodOptions = [
    { value: "", label: "Não informado" },
    ...domainToOptions(paymentMethods).map((o) => ({
      ...o,
      label: METHOD_LABELS[o.value] ?? o.label,
    })),
  ];
  const invoiceTypeOptions = [
    { value: "", label: "Não informado" },
    ...domainToOptions(invoiceTypes).map((o) => ({
      ...o,
      label: TYPE_LABELS[o.value] ?? o.label,
    })),
  ];

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/enrollments/${enrollmentId}`);
      setEnrollment(data.data ?? data);
    } catch {}
    setLoading(false);
  }, [enrollmentId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const list = await listPaymentProviders();
        const active = list.filter((item) => item.status !== "inactive");
        setProviders(active);
        if (active.length > 0) setChargeProvider(active[0].slug);
      } catch {}
    };
    loadProviders();
  }, []);

  const fetchLookups = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        api.get("/students", { params: { per_page: 200 } }),
        api.get("/school-classes", { params: { per_page: 200, status: "active" } }),
      ]);
      setStudents(sRes.data.data ?? []);
      setClasses(cRes.data.data ?? []);
    } catch {}
  };

  const openEdit = async () => {
    if (!enrollment) return;
    await fetchLookups();
    setEditForm({
      student_id: String(enrollment.student?.id ?? ""),
      school_class_id: String(enrollment.school_class?.id ?? ""),
      start_date: isoToDisplay(enrollment.start_date ?? ""),
      end_date: isoToDisplay(enrollment.end_date ?? ""),
      status: enrollment.status,
      monthly_amount: enrollment.monthly_amount ?? "",
      discount_amount: enrollment.discount_amount ?? "",
      payment_due_day: String(enrollment.payment_due_day ?? ""),
    });
    setEditErrors({});
    setEditVisible(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    setEditErrors({});
    try {
      const payload: Record<string, any> = {
        start_date: editForm.start_date,
        status: editForm.status,
      };
      if (editForm.end_date) payload.end_date = editForm.end_date;
      if (editForm.monthly_amount) payload.monthly_amount = parseFloat(editForm.monthly_amount);
      if (editForm.discount_amount) payload.discount_amount = parseFloat(editForm.discount_amount);
      if (editForm.payment_due_day) payload.payment_due_day = Number(editForm.payment_due_day);

      await api.put(`/enrollments/${enrollmentId}`, payload);
      setEditVisible(false);
      fetch();
    } catch (e: any) {
      if (e.response?.status === 422) {
        setEditErrors(parseApiErrors(e.response.data.errors ?? {}));
      }
    }
    setSaving(false);
  };

  const removeEnrollment = async () => {
    setDeletingEnrollment(true);
    try {
      await api.delete(`/enrollments/${enrollmentId}`);
      navigate("matriculas");
    } catch {}
    setDeletingEnrollment(false);
  };

  // ── Invoice actions ──────────────────────────────────────────────────────────

  const openCreateInvoice = () => {
    setInvoiceEditId(null);
    setInvoiceForm(EMPTY_INVOICE);
    setInvoiceErrors({});
    setInvoiceModalVisible(true);
  };

  const openEditInvoice = (inv: Invoice) => {
    setInvoiceEditId(inv.id);
    setInvoiceForm({
      description: inv.description,
      amount: floatToCurrency(inv.amount),
      due_date: isoToDisplayDate(inv.due_date),
      status: inv.status,
      type: inv.type ?? "",
      payment_method: inv.payment_method ?? "",
      notes: inv.notes ?? "",
      edit_reason: "",
    });
    setInvoiceErrors({});
    setInvoiceModalVisible(true);
  };

  const saveInvoice = async () => {
    setSavingInvoice(true);
    setInvoiceErrors({});
    try {
      const payload: Record<string, any> = {
        description: invoiceForm.description,
        amount: currencyToFloat(invoiceForm.amount),
        due_date: displayToISO(invoiceForm.due_date),
        status: invoiceForm.status,
        enrollment_id: enrollmentId,
        student_id: enrollment?.student?.id,
      };
      if (invoiceForm.type) payload.type = invoiceForm.type;
      if (invoiceForm.payment_method) payload.payment_method = invoiceForm.payment_method;
      if (invoiceForm.notes) payload.notes = invoiceForm.notes;
      if (invoiceEditId && invoiceForm.edit_reason) payload.edit_reason = invoiceForm.edit_reason;

      if (invoiceEditId) {
        await api.put(`/invoices/${invoiceEditId}`, payload);
      } else {
        await api.post("/invoices", payload);
      }
      setInvoiceModalVisible(false);
      fetch();
    } catch (e: any) {
      const errors = e.response?.data?.errors;
      if (e.response?.status === 422 && errors && Object.keys(errors).length > 0) {
        setInvoiceErrors(parseApiErrors(errors));
      } else {
        const msg = e.response?.data?.message ?? "Não foi possível salvar a cobrança.";
        showToast("error", msg);
      }
    }
    setSavingInvoice(false);
  };

  const cancelInvoice = async () => {
    if (!cancelInvoiceId) return;
    setCancellingInvoice(true);
    try {
      await api.post(`/invoices/${cancelInvoiceId}/cancel`);
      setCancelInvoiceId(null);
      fetch();
      showToast("success", "Cobrança cancelada com sucesso.", "Sucesso");
    } catch (e: any) {
      const msg = e.response?.data?.message ?? "Não foi possível cancelar a cobrança.";
      setCancelInvoiceId(null);
      showToast("error", msg, "Erro ao cancelar cobrança");
    }
    setCancellingInvoice(false);
  };

  const removeInvoice = async () => {
    if (!deleteInvoiceId) return;
    setDeletingInvoice(true);
    try {
      await api.delete(`/invoices/${deleteInvoiceId}`);
      setDeleteInvoiceId(null);
      fetch();
      showToast("success", "Cobrança excluída com sucesso.", "Sucesso");
    } catch (e: any) {
      const msg = e.response?.data?.message ?? "Não foi possível excluir a cobrança.";
      setDeleteInvoiceId(null);
      showToast("error", msg, "Erro ao excluir cobrança");
    }
    setDeletingInvoice(false);
  };

  // ── Charge actions ───────────────────────────────────────────────────────────

  const openChargeModal = (invoice: Invoice, preferredMethod?: "pix" | "boleto") => {
    const normalizedMethod =
      invoice.payment_method === "bank_slip" || invoice.payment_method === "boleto"
        ? "boleto"
        : "pix";
    const method = preferredMethod ?? normalizedMethod;

    // Se já existe cobrança gerada na invoice, pré-popular o resultado
    const existingResult: import("../../services/payments").GeneratedCharge | null =
      invoice.cora?.charge_id
        ? {
            invoice_id: invoice.id,
            provider: "cora",
            charge_id: invoice.cora.charge_id ?? "",
            status: invoice.cora.status ?? "",
            payment_url: invoice.cora.payment_url ?? null,
            pix_copy_paste: invoice.cora.pix_copy_paste ?? null,
            qr_code_image_url: invoice.cora.qr_code_image_url ?? null,
            boleto_number: invoice.cora.boleto_number ?? null,
            boleto_digitable: invoice.cora.boleto_digitable ?? null,
            expires_at: null,
          }
        : null;

    setChargeInvoice(invoice);
    setChargeResult(existingResult);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeModalStep(existingResult ? "result" : "select");
    setChargeActionError(
      canGenerateChargeForInvoice(invoice)
        ? null
        : "Não é possível gerar cobrança para uma fatura paga ou cancelada."
    );
    if (!chargeProvider && providers.length > 0) setChargeProvider(providers[0].slug);
    setChargeEnvironment(defaultChargeEnvironment);
    setChargeMethod(method);
    setChargeModalVisible(true);
  };

  const closeChargeModal = () => {
    setChargeModalVisible(false);
    setChargeInvoice(null);
    setChargeResult(null);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeActionError(null);
    setChargeModalStep("select");
  };

  const onGenerateCharge = async (methodOverride?: "pix" | "boleto") => {
    if (!chargeInvoice || !chargeProvider) return;
    const methodToGenerate = methodOverride ?? (chargeMethod as "pix" | "boleto");
    if (!canGenerateChargeForInvoice(chargeInvoice)) {
      setChargeActionError("Não é possível gerar cobrança para uma fatura paga ou cancelada.");
      return;
    }
    setChargeMethod(methodToGenerate);
    setGeneratingCharge(true);
    setChargeActionError(null);
    try {
      const result = await generateUnifiedCharge(chargeInvoice.id, {
        provider: chargeProvider,
        method: methodToGenerate,
        environment: chargeEnvironment,
      });
      setChargeResult(result);
      setChargeModalStep("result");
      fetch();
    } catch (e: any) {
      setChargeResult(null);
      setChargeActionError(e?.response?.data?.message ?? "Não foi possível gerar a cobrança.");
    }
    setGeneratingCharge(false);
  };

  const onCheckChargeStatus = async () => {
    if (!chargeInvoice) return;
    setCheckingStatus(true);
    setChargeActionError(null);
    try {
      const result = await getUnifiedChargeStatus(chargeInvoice.id);
      setChargeStatusResult(result);
      fetch();
    } catch (e: any) {
      setChargeStatusResult(null);
      setChargeActionError(e?.response?.data?.message ?? "Não foi possível consultar o status da cobrança.");
    }
    setCheckingStatus(false);
  };

  const onPayCharge = async () => {
    if (!chargeInvoice) return;
    if (chargeEnvironment !== "stage") {
      setChargeActionError("A simulação de pagamento está disponível apenas no ambiente de teste (stage).");
      return;
    }

    setPayingCharge(true);
    setChargeActionError(null);
    setPaidChargeResult(null);

    try {
      const result = await payUnifiedCharge(chargeInvoice.id, { environment: "stage" });
      setPaidChargeResult(result);
      await onCheckChargeStatus();
      fetch();
    } catch (e: any) {
      setChargeActionError(e?.response?.data?.message ?? "Não foi possível simular o pagamento da cobrança.");
    }

    setPayingCharge(false);
  };

  const copyPixCode = async () => {
    if (!chargeResult?.pix_copy_paste) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(chargeResult.pix_copy_paste);
    }
  };

  const fmt = (v: string | null) =>
    v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  const providerOptions = providers.map((item) => ({ value: item.slug, label: item.name }));
  const chargeMethodOptions = [
    { value: "pix", label: "Pix" },
    { value: "boleto", label: "Boleto" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (!enrollment) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-gray-500">Matrícula não encontrada.</Text>
        <TouchableOpacity
          onPress={() => navigate("matriculas")}
          className="mt-4 px-4 py-2 bg-violet-600 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const invoices = enrollment.invoices ?? [];
  const showInvoiceCards = isMobile || width < 1024;
  const money = (value: string | null) =>
    value && !Number.isNaN(parseFloat(value))
      ? `R$ ${parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : "—";

  const renderInvoiceActions = (item: Invoice) => (
    <View className="flex-row justify-end gap-1">
      {item.status !== "cancelled" && item.status !== "paid" && (
        <TouchableOpacity
          onPress={() => setCancelInvoiceId(item.id)}
          className="items-center justify-center bg-orange-50 rounded-lg"
          style={{ width: 30, height: 30 }}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={15} color="#F97316" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => {
          setAuditInvoice(item);
          setAuditVisible(true);
        }}
        className="items-center justify-center bg-blue-50 rounded-lg"
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons name="information-circle-outline" size={15} color="#2563EB" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => openEditInvoice(item)}
        className="items-center justify-center bg-violet-50 rounded-lg"
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => openChargeModal(item)}
        disabled={!canGenerateChargeForInvoice(item)}
        className={`items-center justify-center rounded-lg ${
          canGenerateChargeForInvoice(item) ? "bg-blue-50" : "bg-gray-100"
        }`}
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons
          name="card-outline"
          size={15}
          color={canGenerateChargeForInvoice(item) ? "#2563EB" : "#9CA3AF"}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setDeleteInvoiceId(item.id)}
        className="items-center justify-center bg-red-50 rounded-lg"
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={15} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  const renderTypeBadge = (type: string | null) => {
    if (!type) {
      return <Text className="text-xs text-gray-400">—</Text>;
    }

    const variantMap: Record<
      string,
      "success" | "warning" | "error" | "info" | "default" | "secondary"
    > = {
      enrollment_fee: "info",
      monthly: "default",
      uniform: "warning",
      material: "warning",
      transport: "warning",
      late_fee: "error",
      other: "secondary",
    };
    const variant = variantMap[type] ?? "secondary";

    return <Badge variant={variant} label={TYPE_LABELS[type] ?? type} />;
  };

  const renderInvoiceCard = (item: Invoice) => (
    <View key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={2}>
            {item.description}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">Vence {fmt(item.due_date)}</Text>
        </View>
        <Badge slug={item.status} label={INVOICE_STATUS_LABELS[item.status] ?? item.status} />
      </View>
      <View>{renderTypeBadge(item.type)}</View>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="text-xs text-gray-400 uppercase font-semibold">Valor</Text>
          <Text className="text-base font-bold text-gray-900">{money(item.amount)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-gray-400 uppercase font-semibold">Forma</Text>
          <Text className="text-sm text-gray-600">
            {item.payment_method ? (METHOD_LABELS[item.payment_method] ?? item.payment_method) : "—"}
          </Text>
        </View>
      </View>
      {!!item.cora?.charge_id && (
        <TouchableOpacity
          onPress={() => openChargeModal(item)}
          className="flex-row items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2"
          activeOpacity={0.8}
        >
          <Ionicons
            name={item.payment_method === "bank_slip" ? "barcode-outline" : "qr-code-outline"}
            size={14}
            color="#7C3AED"
          />
          <Text className="text-xs font-semibold text-violet-700 flex-1">
            Cobrança Cora
          </Text>
          <Text className="text-xs text-violet-500">{item.cora.status ?? "—"}</Text>
          <Ionicons name="chevron-forward-outline" size={13} color="#7C3AED" />
        </TouchableOpacity>
      )}
      {renderInvoiceActions(item)}
    </View>
  );

  const renderInfoBlock = (
    label: string,
    value: string,
    detail?: string | null,
    flex = 1
  ) => (
    <View className="bg-gray-50 rounded-xl px-3 py-2.5" style={{ flex }}>
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </Text>
      <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
        {value || "—"}
      </Text>
      {!!detail && (
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {detail}
        </Text>
      )}
    </View>
  );

  const renderFinanceBlock = (label: string, value: string) => (
    <View className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5">
      <Text className="text-xs text-gray-400 uppercase font-semibold mb-1">{label}</Text>
      <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderChargeOption = ({
    label,
    detail,
    icon,
    active,
    disabled,
    tone = "violet",
    onPress,
  }: {
    label: string;
    detail?: string;
    icon: any;
    active: boolean;
    disabled?: boolean;
    tone?: "violet" | "amber" | "blue";
    onPress: () => void;
  }) => {
    const colors = {
      violet: { border: "#7C3AED", bg: "#F5F3FF", text: "#6D28D9", soft: "#EDE9FE" },
      amber: { border: "#F59E0B", bg: "#FFFBEB", text: "#B45309", soft: "#FEF3C7" },
      blue: { border: "#2563EB", bg: "#EFF6FF", text: "#1D4ED8", soft: "#DBEAFE" },
    }[tone];
    const inactive = "#9CA3AF";

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.82}
        className="flex-1 rounded-xl border flex-row items-center"
        style={{
          minHeight: 50,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderColor: active ? colors.border : "#E5E7EB",
          backgroundColor: active ? colors.bg : disabled ? "#F9FAFB" : "#FFFFFF",
          opacity: disabled ? 0.65 : 1,
          gap: 10,
        }}
      >
        <View
          className="items-center justify-center rounded-lg"
          style={{
            width: 32,
            height: 32,
            backgroundColor: active ? colors.soft : "#F3F4F6",
          }}
        >
          <Ionicons name={icon} size={17} color={active ? colors.text : inactive} />
        </View>
        <View className="flex-1">
          <Text
            className="text-sm font-bold"
            style={{ color: active ? colors.text : inactive }}
            numberOfLines={1}
          >
            {label}
          </Text>
          {!!detail && (
            <Text
              className="text-xs"
              style={{ color: active ? colors.text : "#C7CDD7" }}
              numberOfLines={1}
            >
              {detail}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View
        className="mb-4"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => navigate("matriculas")}
            className="p-2 bg-gray-100 rounded-xl"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back-outline" size={18} color="#374151" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text
              className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-gray-800`}
              numberOfLines={1}
            >
              Matrícula {enrollment.enrollment_number ?? `#${enrollment.id}`}
            </Text>
            <Text className="text-sm text-gray-500" numberOfLines={1}>
              {enrollment.student?.name ?? "—"} · {enrollment.school_class?.name ?? "—"}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2" style={{ alignSelf: isMobile ? "stretch" : "auto" }}>
          <TouchableOpacity
            onPress={openEdit}
            className="flex-row items-center justify-center bg-violet-600 px-4 py-2 rounded-xl"
            style={{ flex: isMobile ? 1 : undefined }}
            activeOpacity={0.85}
          >
            <Ionicons name="pencil-outline" size={16} color="white" />
            <Text className="text-white font-semibold text-sm ml-1.5">Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDeleteEnrollmentVisible(true)}
            className="flex-row items-center justify-center bg-red-50 border border-red-200 px-4 py-2 rounded-xl"
            style={{ flex: isMobile ? 1 : undefined }}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
            <Text className="text-red-600 font-semibold text-sm ml-1.5">Excluir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Enrollment info card */}
      <View
        className="bg-white rounded-2xl mb-5"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
          padding: isMobile ? 14 : 16,
          gap: 12,
        }}
      >
        <View className="flex-row items-center justify-between bg-violet-50 rounded-xl px-3 py-2">
          <View>
            <Text className="text-xs text-violet-400 font-semibold uppercase tracking-wide">
              Nº Matrícula
            </Text>
            <Text
              className={`${isMobile ? "text-lg" : "text-xl"} font-bold text-violet-700 tracking-widest`}
              numberOfLines={1}
            >
              {enrollment.enrollment_number ?? "—"}
            </Text>
          </View>
          <Badge
            slug={enrollment.status}
            label={ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status}
          />
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            {renderInfoBlock(
              "Aluno",
              enrollment.student?.name ?? "—",
              [
                enrollment.student?.enrollment_number
                  ? `Matr.: ${enrollment.student.enrollment_number}`
                  : null,
                enrollment.guardian ? `Resp.: ${enrollment.guardian.name}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              1.25
            )}
            {renderInfoBlock(
              "Turma / Curso",
              enrollment.school_class?.name ?? "—",
              [
                enrollment.school_class?.course?.name,
                enrollment.course_plan
                  ? `Plano: ${enrollment.course_plan.name} · ${enrollment.course_plan.cycle_label}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
              1.25
            )}
            {renderInfoBlock("Início", fmt(enrollment.start_date), null, 0.7)}
            {renderInfoBlock("Término", fmt(enrollment.end_date ?? null), null, 0.7)}
          </View>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            {renderFinanceBlock("Mensalidade", money(enrollment.monthly_amount))}
            {renderFinanceBlock(
              "Desconto",
              enrollment.discount_amount && parseFloat(enrollment.discount_amount) > 0
                ? money(enrollment.discount_amount)
                : "—"
            )}
            {renderFinanceBlock(
              "Vencimento",
              enrollment.payment_due_day ? `Dia ${enrollment.payment_due_day}` : "—"
            )}
            {enrollment.created_at &&
              renderFinanceBlock("Criado em", fmt(enrollment.created_at.slice(0, 10)))}
          </View>
        </View>
      </View>

      {/* Cobranças */}
      <View
        className="mb-3"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View>
          <Text className="text-lg font-bold text-gray-800">Cobranças</Text>
          <Text className="text-sm text-gray-500">
            {invoices.length} cobrança{invoices.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreateInvoice}
          className="flex-row items-center justify-center bg-violet-600 px-4 py-2 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="white" />
          <Text className="text-white font-semibold text-sm ml-1">Nova Cobrança</Text>
        </TouchableOpacity>
      </View>

      {invoices.length === 0 ? (
        <View
          className="bg-white rounded-2xl items-center justify-center py-12"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <Ionicons name="cash-outline" size={36} color="#E5E7EB" />
          <Text className="text-gray-400 mt-3 text-sm">Nenhuma cobrança vinculada</Text>
        </View>
      ) : showInvoiceCards ? (
        <View className="gap-3">{invoices.map(renderInvoiceCard)}</View>
      ) : (
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            width: "100%",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-2.5">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2.2 }}>
              Descrição
            </Text>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 0.85 }}>
              Tipo
            </Text>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 0.75 }}>
              Valor
            </Text>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 0.85 }}>
              Vencimento
            </Text>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 0.7 }}>
              Forma
            </Text>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 0.7 }}>
              Status
            </Text>
            <View style={{ width: 132 }} />
          </View>

          {invoices.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row items-center px-4 py-2 border-b border-gray-50 ${
                i % 2 === 1 ? "bg-gray-50/40" : ""
              }`}
            >
              <Text className="text-xs font-semibold text-gray-800" style={{ flex: 2.2 }} numberOfLines={1}>
                {item.description}
              </Text>
              <View style={{ flex: 0.85 }}>{renderTypeBadge(item.type)}</View>
              <Text className="text-xs font-semibold text-gray-800" style={{ flex: 0.75 }}>
                {money(item.amount)}
              </Text>
              <Text className="text-xs text-gray-600" style={{ flex: 0.85 }}>
                {fmt(item.due_date)}
              </Text>
              <Text className="text-xs text-gray-600" style={{ flex: 0.7 }} numberOfLines={1}>
                {item.payment_method
                  ? (METHOD_LABELS[item.payment_method] ?? item.payment_method)
                  : "—"}
              </Text>
              <View style={{ flex: 0.7 }}>
                <Badge slug={item.status} label={INVOICE_STATUS_LABELS[item.status] ?? item.status} />
              </View>
              <View style={{ width: 132 }}>{renderInvoiceActions(item)}</View>
            </View>
          ))}
        </View>
      )}

      {/* ── Edit Enrollment Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={editVisible}
        title="Editar Matrícula"
        onClose={() => setEditVisible(false)}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setEditVisible(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveEdit}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              {saving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <View className="flex-row gap-4">
          <View className="flex-1">
            <DatePickerInput
              label="Data de Início"
              required
              value={editForm.start_date}
              onChangeText={() => {}}
              error={editErrors.start_date}
              disabled
            />
          </View>
          <View className="flex-1">
            <DatePickerInput
              label="Data de Término"
              value={editForm.end_date}
              onChangeText={() => {}}
              error={editErrors.end_date}
              disabled
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect
              label="Status"
              value={editForm.status}
              options={statusOptions}
              onChange={(v) => setEditForm({ ...editForm, status: v })}
              error={editErrors.status}
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Vencimento (dia)"
              value={editForm.payment_due_day}
              onChangeText={(v) => setEditForm({ ...editForm, payment_due_day: v })}
              error={editErrors.payment_due_day}
              placeholder="1-28"
              keyboardType="numeric"
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Mensalidade (R$)"
              value={editForm.monthly_amount}
              onChangeText={(v) => setEditForm({ ...editForm, monthly_amount: v })}
              error={editErrors.monthly_amount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Desconto (R$)"
              value={editForm.discount_amount}
              onChangeText={(v) => setEditForm({ ...editForm, discount_amount: v })}
              error={editErrors.discount_amount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </Modal>

      {/* ── Invoice Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={invoiceModalVisible}
        title={invoiceEditId ? "Editar Cobrança" : "Nova Cobrança"}
        onClose={() => setInvoiceModalVisible(false)}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setInvoiceModalVisible(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveInvoice}
              disabled={savingInvoice}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              {savingInvoice ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <FormInput
          label="Descrição"
          required
          value={invoiceForm.description}
          onChangeText={(v) => setInvoiceForm({ ...invoiceForm, description: v })}
          error={invoiceErrors.description}
          placeholder="Ex: Mensalidade Março/2026"
        />
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Valor (R$)"
              required
              value={invoiceForm.amount}
              onChangeText={(v) => setInvoiceForm({ ...invoiceForm, amount: maskCurrency(v) })}
              error={invoiceErrors.amount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <DatePickerInput
              label="Vencimento"
              required
              value={invoiceForm.due_date}
              onChangeText={(v) => setInvoiceForm({ ...invoiceForm, due_date: v })}
              error={invoiceErrors.due_date}
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect
              label="Status"
              value={invoiceForm.status}
              options={invoiceStatusOptions}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, status: v })}
              error={invoiceErrors.status}
            />
          </View>
          <View className="flex-1">
            <FormSelect
              label="Tipo"
              value={invoiceForm.type}
              options={invoiceTypeOptions}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, type: v })}
              error={invoiceErrors.type}
            />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect
              label="Forma de Pagamento"
              value={invoiceForm.payment_method}
              options={methodOptions}
              onChange={(v) => setInvoiceForm({ ...invoiceForm, payment_method: v })}
              error={invoiceErrors.payment_method}
            />
          </View>
        </View>
        <FormInput
          label="Observações"
          value={invoiceForm.notes}
          onChangeText={(v) => setInvoiceForm({ ...invoiceForm, notes: v })}
          error={invoiceErrors.notes}
          placeholder="Observações adicionais"
        />
        {invoiceEditId && (
          <>
            <View className="bg-gray-50 rounded-xl px-4 py-3 mt-4 mb-4">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Motivo da Alteração
              </Text>
              <FormInput
                label=""
                value={invoiceForm.edit_reason}
                onChangeText={(v) => setInvoiceForm({ ...invoiceForm, edit_reason: v })}
                error={invoiceErrors.edit_reason}
                placeholder="Por que está alterando esta cobrança?"
                multiline
              />
            </View>
          </>
        )}
      </Modal>

      {/* ── Charge Modal ─────────────────────────────────────────────────────── */}
      <Modal
        visible={chargeModalVisible}
        title="Checkout de pagamento"
        onClose={closeChargeModal}
        size="md"
        maxHeight="97%"
        headerContent={
          chargeInvoice ? (
            <View className="mt-3 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-row items-start gap-3 flex-1">
                  {chargeModalStep === "result" && (
                    <View
                      className={`w-9 h-9 rounded-xl items-center justify-center ${
                        chargeMethod === "pix" ? "bg-emerald-50" : "bg-blue-50"
                      }`}
                      style={chargeMethod === "pix" ? { width: 58, height: 58, borderRadius: 18 } : undefined}
                    >
                      {chargeMethod === "pix" ? (
                        <PixLogoIcon size={42} color="#059669" weight="fill" />
                      ) : (
                        <Ionicons name="barcode-outline" size={19} color="#2563EB" />
                      )}
                    </View>
                  )}
                  <View className="flex-1">
                  <Text className="text-xs text-gray-400 uppercase font-semibold" numberOfLines={1}>
                    Cobrança #{chargeInvoice.id}
                  </Text>
                  <Text className="text-sm font-bold text-gray-900 mt-0.5" numberOfLines={1}>
                    {chargeInvoice.description}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Vencimento {fmt(chargeInvoice.due_date)}
                  </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-gray-400 uppercase font-semibold">Total</Text>
                  <Text className="text-xl font-bold text-violet-700">
                    {money(chargeInvoice.amount)}
                  </Text>
                </View>
              </View>
            </View>
          ) : undefined
        }
        footerStyle={{ backgroundColor: "#F3F4F6" }}
        footer={
          chargeModalStep === "result" ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  setChargeModalStep("select");
                  setChargeActionError(null);
                }}
                activeOpacity={0.8}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white items-center flex-row justify-center gap-2"
                style={{ flex: isMobile ? undefined : 1 }}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#1F2937" />
                <Text className="text-xs font-bold text-gray-800">Escolher outra forma</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onCheckChargeStatus}
                disabled={checkingStatus || !chargeInvoice}
                activeOpacity={0.8}
                className="px-4 py-2.5 rounded-xl border border-violet-200 bg-white items-center flex-row justify-center gap-2"
                style={{ flex: isMobile ? undefined : 1 }}
              >
                {checkingStatus ? (
                  <ActivityIndicator size="small" color="#7C3AED" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={15} color="#7C3AED" />
                    <Text className="text-xs font-bold text-violet-700">Consultar status</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onPayCharge}
                disabled={payingCharge || !chargeInvoice || chargeEnvironment !== "stage"}
                activeOpacity={0.8}
                className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-white items-center flex-row justify-center gap-2"
                style={{ flex: isMobile ? undefined : 1 }}
              >
                {payingCharge ? (
                  <ActivityIndicator size="small" color="#059669" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
                    <Text className="text-xs font-bold text-emerald-700">Simular pagamento</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={closeChargeModal}
              activeOpacity={0.85}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white items-center flex-row justify-center gap-2"
              style={{ minWidth: isMobile ? undefined : 140 }}
            >
              <Ionicons name="arrow-back-outline" size={15} color="#374151" />
              <Text className="text-xs font-bold text-gray-700">Voltar</Text>
            </TouchableOpacity>
          )
        }
      >
        {chargeModalStep === "select" && (
          <>
            <View className="mb-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Escolha a forma de pagamento
              </Text>
              <View
                className="gap-2"
                style={{ flexDirection: isMobile ? "column" : "row" }}
              >
              <TouchableOpacity
                onPress={() => {
                  void onGenerateCharge("boleto");
                }}
                disabled={
                  generatingCharge ||
                  !chargeInvoice ||
                  !chargeProvider ||
                  !canGenerateChargeForInvoice(chargeInvoice)
                }
                activeOpacity={0.85}
                className="flex-1 flex-row items-center rounded-2xl border border-gray-200 px-4 py-4 bg-white"
                style={{
                  shadowColor: "#111827",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 1,
                }}
              >
                <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#EEF2FF" }}>
                  <Ionicons name="barcode-outline" size={24} color="#2563EB" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-gray-900">Pagar com boleto</Text>
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    Linha digitável e PDF
                  </Text>
                </View>
                {generatingCharge && chargeMethod === "boleto" ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : (
                  <View className="w-8 h-8 rounded-full bg-gray-50 items-center justify-center">
                    <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  void onGenerateCharge("pix");
                }}
                disabled={
                  generatingCharge ||
                  !chargeInvoice ||
                  !chargeProvider ||
                  !canGenerateChargeForInvoice(chargeInvoice)
                }
                activeOpacity={0.85}
                className="flex-1 flex-row items-center rounded-2xl border border-emerald-100 px-4 py-4 bg-white"
                style={{
                  shadowColor: "#059669",
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 1,
                }}
              >
                <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
                  <PixLogoIcon size={32} color="#059669" weight="fill" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-gray-900">Pagar com PIX</Text>
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    QR Code instantâneo
                  </Text>
                </View>
                {generatingCharge && chargeMethod === "pix" ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : (
                  <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center">
                    <Ionicons name="chevron-forward-outline" size={18} color="#059669" />
                  </View>
                )}
              </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {chargeModalStep === "result" && !!chargeResult && (
          <View>
            {/* ── PIX ── */}
            {chargeMethod === "pix" && (
              <>
                <View className="items-center mb-3">
                  <View className="w-64 h-64 bg-white rounded-2xl border border-gray-200 items-center justify-center overflow-hidden">
                    {chargeResult.qr_code_image_url && chargeResult.qr_code_image_url !== "" ? (
                      <Image
                        source={{ uri: chargeResult.qr_code_image_url }}
                        style={{ width: 256, height: 256 }}
                        resizeMode="contain"
                      />
                    ) : chargeResult.pix_copy_paste ? (
                      <View style={{ transform: [{ scale: 1.28 }] }}>
                        <QRCode
                          value={chargeResult.pix_copy_paste}
                          size={200}
                          color="#000000"
                          backgroundColor="#FFFFFF"
                        />
                      </View>
                    ) : (
                      <Text className="text-xs text-gray-500">Gerando QR Code...</Text>
                    )}
                  </View>
                </View>
                {!!chargeResult.pix_copy_paste && (
                  <View className="bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 mb-3">
                    <View className="flex-row items-center gap-2">
                      <View className="flex-1 min-w-0">
                        <Text className="text-xs font-semibold text-gray-500 mb-1">
                          PIX copia e cola
                        </Text>
                      <Text
                          className="text-xs font-mono text-gray-800"
                        selectable
                          numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {chargeResult.pix_copy_paste}
                      </Text>
                      </View>
                      <TouchableOpacity
                        onPress={copyPixCode}
                        activeOpacity={0.8}
                        className="rounded-lg bg-violet-600 px-3 py-2 flex-row items-center gap-1"
                      >
                        <Ionicons name="copy-outline" size={14} color="white" />
                        <Text className="text-xs font-bold text-white">Copiar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ── BOLETO ── */}
            {chargeMethod === "boleto" && (
              <>
                {!!chargeResult.boleto_digitable && (
                  <View className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-3 flex-row items-center gap-3">
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-semibold text-gray-500 mb-1">Linha digitável</Text>
                      <Text
                        className="text-xs font-mono text-gray-900 font-semibold leading-4"
                        selectable
                      >
                        {chargeResult.boleto_digitable}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={async () => {
                        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(chargeResult.boleto_digitable || "");
                        }
                      }}
                      activeOpacity={0.8}
                      className="bg-violet-600 rounded-xl px-3 py-2.5 flex-row items-center gap-1"
                    >
                      <Ionicons name="copy-outline" size={14} color="white" />
                      <Text className="text-xs font-bold text-white">Copiar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!!chargeResult.payment_url && (
                  <TouchableOpacity
                    onPress={() => {
                      if (typeof window !== "undefined")
                        window.open(chargeResult.payment_url || "", "_blank");
                    }}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-2 text-violet-600 mb-3"
                  >
                    <Ionicons name="download-outline" size={16} color="#7C3AED" />
                    <Text className="text-sm font-bold text-violet-600">Baixar boleto</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
        {!!chargeActionError && (
          <View className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 mt-3">
            <Text className="text-sm font-bold text-red-700">Atenção</Text>
            <Text className="text-xs text-red-700 mt-1">{chargeActionError}</Text>
          </View>
        )}

        {!!chargeStatusResult && (
          <View className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 mt-3">
            <Text className="text-sm font-bold text-blue-700">Status atualizado</Text>
            <Text className="text-xs text-blue-700 mt-1">Provider: {chargeStatusResult.provider || "—"}</Text>
            <Text className="text-xs text-blue-700 mt-1">Status: {chargeStatusResult.status || "—"}</Text>
            <Text className="text-xs text-blue-700 mt-1">Pago em: {chargeStatusResult.paid_at || "—"}</Text>
          </View>
        )}

        {!!paidChargeResult && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 mt-3">
            <Text className="text-sm font-bold text-emerald-700">Pagamento simulado</Text>
            <Text className="text-xs text-emerald-700 mt-1">Status: {paidChargeResult.status || "—"}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Pago em: {paidChargeResult.paid_at || "—"}</Text>
          </View>
        )}
      </Modal>

      {/* ── Audit Modal ──────────────────────────────────────────────────────── */}
      <Modal
        visible={auditVisible}
        title="Informações da Cobrança"
        onClose={() => setAuditVisible(false)}
        size="md"
        footer={
          <TouchableOpacity
            onPress={() => setAuditVisible(false)}
            className="px-5 py-2.5 rounded-xl bg-violet-600"
          >
            <Text className="text-sm font-bold text-white">Fechar</Text>
          </TouchableOpacity>
        }
      >
        {auditInvoice && (
          <View className="gap-4">
            {/* Informações básicas */}
            <View className="bg-gray-50 rounded-xl px-4 py-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Detalhes
              </Text>
              <View className="gap-2">
                {[
                  { label: "Descrição", value: auditInvoice.description },
                  {
                    label: "Valor",
                    value: `R$ ${parseFloat(auditInvoice.amount).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}`,
                  },
                  { label: "Vencimento", value: fmt(auditInvoice.due_date) },
                  { label: "Status", value: INVOICE_STATUS_LABELS[auditInvoice.status] ?? auditInvoice.status },
                ].map((row) => (
                  <View key={row.label} className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">{row.label}</Text>
                    <Text className="text-xs font-semibold text-gray-800">{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Informações de auditoria */}
            <View className="bg-blue-50 rounded-xl px-4 py-3">
              <Text className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                Auditoria
              </Text>
              <View className="gap-2">
                {auditInvoice.created_by_user?.name && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-blue-700">Criado por</Text>
                    <Text className="text-xs font-semibold text-blue-900">
                      {auditInvoice.created_by_user.name}
                    </Text>
                  </View>
                )}
                {auditInvoice.updated_by_user?.name && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-blue-700">Última edição por</Text>
                    <Text className="text-xs font-semibold text-blue-900">
                      {auditInvoice.updated_by_user.name}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Motivo da alteração */}
            {auditInvoice.edit_reason && (
              <View className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                <Text className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                  Motivo da Alteração
                </Text>
                <Text className="text-sm text-amber-800">{auditInvoice.edit_reason}</Text>
              </View>
            )}
          </View>
        )}
      </Modal>

      {/* ── Confirm Modals ───────────────────────────────────────────────────── */}
      <ConfirmModal
        visible={!!cancelInvoiceId}
        title="Cancelar Cobrança"
        message="Deseja realmente cancelar esta cobrança?"
        onConfirm={cancelInvoice}
        onCancel={() => setCancelInvoiceId(null)}
        loading={cancellingInvoice}
      />
      <ConfirmModal
        visible={!!deleteInvoiceId}
        title="Excluir Cobrança"
        message="Esta ação não pode ser desfeita."
        onConfirm={removeInvoice}
        onCancel={() => setDeleteInvoiceId(null)}
        loading={deletingInvoice}
      />
      <ConfirmModal
        visible={deleteEnrollmentVisible}
        title="Excluir Matrícula"
        message="A matrícula e todas as cobranças vinculadas serão removidas. Esta ação não pode ser desfeita."
        onConfirm={removeEnrollment}
        onCancel={() => setDeleteEnrollmentVisible(false)}
        loading={deletingEnrollment}
      />

    </ScrollView>

      <MessageModal
        visible={msgModal.visible}
        type={msgModal.type}
        title={msgModal.title}
        message={msgModal.message}
        onClose={closeMsgModal}
      />
    </View>
  );
}
