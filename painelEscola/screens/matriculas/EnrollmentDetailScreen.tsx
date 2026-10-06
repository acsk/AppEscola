import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
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
import {
  isoToDisplay,
  isoToDisplay as isoToDisplayDate,
  displayToISO,
  maskDate,
  maskCurrency,
  currencyToFloat,
  floatToCurrency,
  parsePaymentDueDay,
} from "../../utils/masks";
import {
  validateEnrollmentEditForm,
} from "../../utils/enrollmentForm";
import {
  enrollmentProductKind,
  enrollmentProductSubtitle,
  enrollmentProductTitle,
} from "../../utils/enrollmentDisplay";
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
  InvoicePaymentAssets,
  InvoicePaymentOptionsResponse,
  InvoiceReceiptResponse,
  PaidChargeResponse,
  PaymentProvider,
  generateUnifiedCharge,
  getInvoicePaymentOptions,
  getInvoiceReceipt,
  getUnifiedChargeStatus,
  listPaymentProviders,
  payUnifiedCharge,
} from "../../services/payments";
import MarkInvoicePaidModal from "../../components/finance/MarkInvoicePaidModal";
import InvoiceActionsModal, { type InvoiceActionKey } from "../../components/finance/InvoiceActionsModal";
import ContractChargesModal from "../../components/finance/ContractChargesModal";
import EnrollmentCarneModal from "../../components/finance/EnrollmentCarneModal";
import CoraDueDatePolicyBanner from "../../components/finance/CoraDueDatePolicyBanner";
import EnrollmentEditModal from "../../components/matriculas/EnrollmentEditModal";
import { paymentMethodLabel } from "../../utils/paymentMethods";
import { resolveInvoiceGatewayEnvironment } from "../../utils/paymentEnvironment";
import {
  isHybridBoletoUrl,
  isPixQrImageUrl,
  resolveBoletoPaymentUrl,
} from "../../utils/coraPaymentAssets";
import type {
  EnrollmentDetail,
  EnrollmentDetailScreenProps,
  EnrollmentEditFormValues,
  InvoiceFormValues,
  InvoiceListItem,
} from "../../types/matriculas";
import type { SchoolClassRef, StudentRef } from "../../types/entities";

const reactPdf = Platform.OS === "web" ? require("react-pdf") : null;
const PdfDocument = reactPdf?.Document as React.ComponentType<any> | null;
const PdfPage = reactPdf?.Page as React.ComponentType<any> | null;
const pdfjs = reactPdf?.pdfjs as
  | {
      version: string;
      GlobalWorkerOptions: { workerSrc: string };
    }
  | undefined;

if (Platform.OS === "web" && pdfjs) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

type Invoice = InvoiceListItem;
type Enrollment = EnrollmentDetail;
type EditForm = EnrollmentEditFormValues;
type InvoiceForm = InvoiceFormValues;

const EMPTY_EDIT: EnrollmentEditFormValues = {
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
  credit_card: "Cartão crédito",
  debit_card: "Cartão débito",
  bank_slip: "Boleto",
  bank_transfer: "Transferência",
};

const TYPE_LABELS: Record<string, string> = {
  enrollment_fee: "Taxa de matrícula",
  monthly: "Mensalidade",
  other: "Outro",
  uniform: "Fardamento",
  material: "Material didático",
  transport: "Transporte",
  late_fee: "Multa/Juros",
};

const canGenerateChargeForInvoice = (invoice: Invoice | null) => {
  if (!invoice) return false;
  return invoice.status !== "paid" && invoice.status !== "cancelled";
};

export default function EnrollmentDetailScreen({
  navigate,
  enrollmentId,
}: EnrollmentDetailScreenProps) {
  const { width, isMobile, contentPadding } = useResponsiveLayout();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit enrollment
  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [initialEditSchoolClassId, setInitialEditSchoolClassId] = useState("");
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<StudentRef[]>([]);
  const [classes, setClasses] = useState<SchoolClassRef[]>([]);

  // Invoice CRUD
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceEditId, setInvoiceEditId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [cancelInvoiceId, setCancelInvoiceId] = useState<number | null>(null);
  const [actionsInvoice, setActionsInvoice] = useState<Invoice | null>(null);
  const [settleInvoice, setSettleInvoice] = useState<Invoice | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [auditInvoice, setAuditInvoice] = useState<Invoice | null>(null);
  const [auditVisible, setAuditVisible] = useState(false);

  const [contractModalVisible, setContractModalVisible] = useState(false);
  const [carneModalVisible, setCarneModalVisible] = useState(false);

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
  const closeChargeStatusModal = useCallback(
    () => setChargeStatusModal((prev) => ({ ...prev, visible: false })),
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
  const [pendingChargeMethod, setPendingChargeMethod] = useState<"pix" | "boleto" | "hybrid" | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [payingCharge, setPayingCharge] = useState(false);
  const [chargeResult, setChargeResult] = useState<GeneratedCharge | null>(null);
  const [chargePaymentOptions, setChargePaymentOptions] = useState<InvoicePaymentOptionsResponse | null>(null);
  const [loadingChargeOptions, setLoadingChargeOptions] = useState(false);
  const [chargeStatusResult, setChargeStatusResult] = useState<ChargeStatusResponse | null>(null);
  const [paidChargeResult, setPaidChargeResult] = useState<PaidChargeResponse | null>(null);
  const [chargeActionError, setChargeActionError] = useState<string | null>(null);

  // Receipt modal
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<InvoiceReceiptResponse | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const openReceiptModal = async (invoice: Invoice) => {
    setReceiptData(null);
    setReceiptError(null);
    setReceiptModalVisible(true);
    setLoadingReceipt(true);
    try {
      const data = await getInvoiceReceipt(invoice.id);
      setReceiptData(data);
    } catch (e: any) {
      setReceiptError(
        e?.response?.data?.message ?? "Não foi possível carregar o recibo."
      );
    }
    setLoadingReceipt(false);
  };

  const printReceipt = (r: InvoiceReceiptResponse) => {
    if (typeof window === "undefined") return;
    const logoHtml = r.school.logo_url
      ? `<img src="${r.school.logo_url}" style="width:64px;height:64px;object-fit:contain;border-radius:8px;margin-bottom:8px;" />`
      : "";
    const enrollmentHtml = r.enrollment
      ? `<section class="card">
          <div class="row"><span class="label">Matrícula:</span><span>${r.enrollment.enrollment_number} — ${r.enrollment.school_class}</span></div>
          ${r.enrollment.start_date ? `<div class="row"><span class="label">Período:</span><span>${isoToDisplay(r.enrollment.start_date)}${r.enrollment.end_date ? ` até ${isoToDisplay(r.enrollment.end_date)}` : ""}</span></div>` : ""}
        </section>`
      : "";
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo ${r.receipt_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; max-width: 680px; margin: 0 auto; }
    .school-header { text-align: center; border-bottom: 1px solid #D9DDE3; padding-bottom: 16px; margin-bottom: 16px; }
    .school-header .name { font-size: 15px; font-weight: 700; }
    .school-header .sub { font-size: 12px; color: #4B5463; margin-top: 2px; }
    .receipt-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .receipt-title h1 { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
    .receipt-number { background: #E9EFF6; color: #132C4A; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
    .card { background: #F7F8FA; border: 1px solid #D9DDE3; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
    .row { display: flex; gap: 8px; margin-bottom: 4px; }
    .row:last-child { margin-bottom: 0; }
    .label { color: #4B5463; min-width: 90px; flex-shrink: 0; }
    .divider { border: none; border-top: 1px solid #D9DDE3; margin: 8px 0; }
    .amount { font-size: 15px; font-weight: 700; color: #1C6A45; }
    .verify { background: #F7F8FA; border: 1px solid #D9DDE3; border-radius: 10px; padding: 12px 14px; }
    .verify p { font-size: 11px; color: #4B5463; margin-bottom: 6px; }
    .verify code { font-size: 10px; font-family: monospace; color: #5F6878; word-break: break-all; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="school-header">
    ${logoHtml}
    <div class="name">${r.school.name}</div>
    ${r.school.corporate_name ? `<div class="sub">${r.school.corporate_name}</div>` : ""}
    <div class="sub">CNPJ: ${r.school.cnpj}</div>
    ${r.school.address ? `<div class="sub">${r.school.address}</div>` : ""}
  </div>

  <div class="receipt-title">
    <h1>RECIBO DE PAGAMENTO</h1>
    <span class="receipt-number">${r.receipt_number}</span>
  </div>

  <section class="card">
    <div class="row"><span class="label">Aluno:</span><span><strong>${r.student.name}</strong></span></div>
    <div class="row"><span class="label">CPF aluno:</span><span>${r.student.document}</span></div>
    <div class="row"><span class="label">Pagador:</span><span><strong>${r.payer.is_guardian ? r.payer.guardian_name ?? r.payer.name : r.payer.name}</strong></span></div>
    <div class="row"><span class="label">CPF pagador:</span><span>${r.payer.document}</span></div>
  </section>

  ${enrollmentHtml}

  <section class="card">
    <div class="row"><span class="label">ID cobrança:</span><span><strong>#${r.invoice.id ?? "—"}</strong>${r.invoice.cora_charge_id ? ` · Cora ${r.invoice.cora_charge_id}` : ""}</span></div>
    <div class="row"><span class="label">Descrição:</span><span><strong>${r.invoice.description}</strong></span></div>
    <div class="row"><span class="label">Vencimento:</span><span>${isoToDisplay(r.invoice.due_date)}</span></div>
    <div class="row"><span class="label">Pagamento:</span><span>${isoToDisplay(r.invoice.paid_at_date)} às ${r.invoice.paid_at_time}</span></div>
    <div class="row"><span class="label">Método:</span><span>${r.invoice.payment_method}</span></div>
    <hr class="divider" />
    <div class="row"><span class="label">Valor:</span><span class="amount">R$ ${r.invoice.amount}</span></div>
  </section>

  <div class="verify">
    <p>${r.verification.message}</p>
    <code>${r.verification.verify_hash}</code>
  </div>
</body>
</html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow!.onafterprint = () => document.body.removeChild(iframe);
    setTimeout(() => iframe.contentWindow?.print(), 300);
  };

  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [chargeStatusModal, setChargeStatusModal] = useState<{
    visible: boolean;
    type: "success" | "info";
    title: string;
    message: string;
  }>({ visible: false, type: "info", title: "", message: "" });
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
    const currentSchoolClassId = String(enrollment.school_class?.id ?? "");
    setEditForm({
      student_id: String(enrollment.student?.id ?? ""),
      school_class_id: currentSchoolClassId,
      start_date: isoToDisplay(enrollment.start_date ?? ""),
      end_date: isoToDisplay(enrollment.end_date ?? ""),
      status: enrollment.status,
      monthly_amount: floatToCurrency(enrollment.monthly_amount),
      discount_amount: floatToCurrency(enrollment.discount_amount ?? 0),
      payment_due_day: enrollment.payment_due_day ? String(enrollment.payment_due_day) : "",
    });
    setInitialEditSchoolClassId(currentSchoolClassId);
    setEditErrors({});
    setEditVisible(true);
  };

  const saveEdit = async () => {
    const locked = !!enrollment?.financial_fields_locked;
    const clientErrors = validateEnrollmentEditForm(editForm, { financialLocked: locked });
    if (Object.keys(clientErrors).length > 0) {
      setEditErrors(clientErrors);
      return;
    }

    setSaving(true);
    setEditErrors({});
    try {
      const payload: Record<string, any> = { status: editForm.status };
      if (editForm.school_class_id.trim()) {
        payload.school_class_id = Number(editForm.school_class_id);
      }
      if (!locked) {
        const startIso = displayToISO(editForm.start_date);
        if (startIso) payload.start_date = startIso;
        if (editForm.end_date.trim()) {
          const endIso = displayToISO(editForm.end_date);
          if (endIso) payload.end_date = endIso;
        }
        if (editForm.monthly_amount.trim()) {
          payload.monthly_amount = currencyToFloat(editForm.monthly_amount);
        }
        payload.discount_amount = currencyToFloat(editForm.discount_amount || "0");
      }
      const dueDay = parsePaymentDueDay(editForm.payment_due_day);
      if (dueDay !== null) {
        payload.payment_due_day = dueDay;
      }

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
      setDeleteEnrollmentVisible(false);
      navigate("matriculas");
    } catch (e: any) {
      const data = e.response?.data;
      const msg = data?.message ?? "Não foi possível remover a matrícula.";
      const cancellation = data?.body?.invoice_cancellation ?? data?.invoice_cancellation;
      const failures = cancellation?.failures as Array<{ invoice_id: number; message: string }> | undefined;
      const detail =
        failures && failures.length > 0
          ? `${msg}\n\n${failures.map((f) => `• Cobrança #${f.invoice_id}: ${f.message}`).join("\n")}`
          : msg;
      setDeleteEnrollmentVisible(false);
      setMsgModal({ visible: true, type: "error", title: "Não foi possível excluir a matrícula", message: detail });
    }
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
    if (inv.can_edit === false) {
      setMsgModal({
        visible: true,
        type: "warning",
        title: "Edição bloqueada",
        message:
          inv.edit_block_reason ??
          "Não é possível editar uma cobrança com boleto ou PIX já gerado.",
      });
      return;
    }
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
      await api.post(`/invoices/${cancelInvoiceId}/cancel`, {
        environment: defaultChargeEnvironment,
      });
      setCancelInvoiceId(null);
      fetch();
      showToast("success", "Cobrança cancelada com sucesso.", "Sucesso");
    } catch (e: any) {
      const msg = e.response?.data?.message ?? "Não foi possível cancelar a cobrança.";
      setCancelInvoiceId(null);
      // Status local pode ter sido reconciliado (ex.: já paga na Cora).
      fetch();
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

  const openChargeModal = async (invoice: Invoice, preferredMethod?: "pix" | "boleto" | "hybrid") => {
    const normalizedMethod =
      invoice.payment_method === "hybrid"
        ? "hybrid"
      : invoice.payment_method === "bank_slip" || invoice.payment_method === "boleto"
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
    setChargePaymentOptions(null);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeModalStep(existingResult ? "result" : "select");
    setChargeActionError(
      canGenerateChargeForInvoice(invoice)
        ? null
        : "Não é possível gerar cobrança para uma fatura paga ou cancelada."
    );
    if (!chargeProvider && providers.length > 0) setChargeProvider(providers[0].slug);
    setChargeEnvironment(resolveInvoiceGatewayEnvironment(invoice));
    setChargeMethod(method);
    setChargeModalVisible(true);

    setLoadingChargeOptions(true);
    try {
      const options = await getInvoicePaymentOptions(invoice.id);
      setChargePaymentOptions(options);

      const lockedMethod = normalizeChargeMethod(options.method_lock?.method);
      const currentMethod = normalizeChargeMethod(options.current_method);
      const allowedMethods = (options.allowed_methods ?? [])
        .map((item) => normalizeChargeMethod(item))
        .filter((item): item is "pix" | "boleto" | "hybrid" => item === "pix" || item === "boleto" || item === "hybrid");

      const selectedMethod =
        preferredMethod ?? lockedMethod ?? currentMethod ?? allowedMethods[0] ?? method;
      setChargeMethod(selectedMethod);

      const resultFromAssets = toGeneratedChargeFromAssets(
        invoice.id,
        options.payment_assets,
        chargeProvider || "cora",
        invoice.cora?.status ?? ""
      );
      if (resultFromAssets) {
        setChargeResult(resultFromAssets);
        setChargeModalStep("result");
      }

      if (options.method_lock?.locked) {
        setChargeActionError(null);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? "Não foi possível carregar as opções de pagamento.";
      setChargeActionError(shouldHideMethodLockedNotice(msg) ? null : msg);
    }
    setLoadingChargeOptions(false);
  };

  const closeChargeModal = () => {
    setChargeModalVisible(false);
    setChargeInvoice(null);
    setChargeResult(null);
    setChargePaymentOptions(null);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeActionError(null);
    setPendingChargeMethod(null);
    setChargeModalStep("select");
  };

  const closePreviewModal = () => {
    setPreviewModalVisible(false);
    setPreviewUrl(null);
    setPdfPageCount(0);
    setPdfPreviewError(null);
  };

  const openPreviewModal = (url: string | null) => {
    if (!url) return;
    setPreviewUrl(url);
    setPdfPageCount(0);
    setPdfPreviewError(null);
    setPreviewModalVisible(true);
  };

  const onGenerateCharge = async (methodOverride?: "pix" | "boleto" | "hybrid") => {
    if (!chargeInvoice || !chargeProvider) return;
    const methodToGenerate =
      methodOverride ?? (chargeMethod === "hybrid" ? "hybrid" : chargeMethod === "boleto" ? "boleto" : "pix");

    if (chargePaymentOptions && !chargePaymentOptions.actions.can_change_method) {
      const assets = chargePaymentOptions.payment_assets;
      const canShowExisting =
        (methodToGenerate === "pix" && !!(assets?.pix_copy_paste || assets?.pix_qr_image_url || isPixQrImageUrl(assets?.boleto_url))) ||
        (methodToGenerate !== "pix" &&
          !!(assets?.boleto_digitable || assets?.boleto_number || resolveBoletoPaymentUrl([assets?.boleto_url])));
      if (canShowExisting) {
        const existing = toGeneratedChargeFromAssets(
          chargeInvoice.id,
          assets,
          chargeProvider,
          chargeResult?.status ?? ""
        );
        if (existing) {
          setChargeResult(existing);
          setChargeModalStep("result");
        }
      }
      setChargeActionError(null);
      return;
    }

    if (chargePaymentOptions && !chargePaymentOptions.actions.can_generate_charge) {
      setChargeActionError("Esta cobrança não permite gerar nova cobrança neste momento.");
      return;
    }

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
      setChargeMethod(methodToGenerate);
      setChargeResult(result);
      setChargeModalStep("result");
      try {
        const options = await getInvoicePaymentOptions(chargeInvoice.id);
        setChargePaymentOptions(options);
        setChargeMethod(methodToGenerate);
      } catch {
        // Sem bloquear a UX caso o endpoint ainda não esteja disponível.
      }
      fetch();
    } catch (e: any) {
      const lockedReason =
        e?.response?.data?.locked_reason ??
        e?.response?.data?.body?.locked_reason ??
        e?.response?.data?.errors?.locked_reason?.[0];

      if (
        e?.response?.status === 422 &&
        (lockedReason === "synced_charge_method_lock" || lockedReason === "method_already_charged")
      ) {
        setChargeActionError(null);
        try {
          const options = await getInvoicePaymentOptions(chargeInvoice.id);
          setChargePaymentOptions(options);
          const resultFromAssets = toGeneratedChargeFromAssets(
            chargeInvoice.id,
            options.payment_assets,
            chargeProvider,
            chargeResult?.status ?? ""
          );
          if (resultFromAssets) {
            setChargeResult(resultFromAssets);
            setChargeModalStep("result");
          }
        } catch {
          // Ignora fallback secundário.
        }
      } else {
        setChargeResult(null);
        const errorMessage = e?.response?.data?.message ?? "Não foi possível gerar a cobrança.";
        setChargeActionError(shouldHideMethodLockedNotice(errorMessage) ? null : errorMessage);
      }
    }
    setGeneratingCharge(false);
  };

  const requestGenerateCharge = (method: "pix" | "boleto" | "hybrid") => {
    setPendingChargeMethod(method);
  };

  const confirmGenerateCharge = async () => {
    if (!pendingChargeMethod) return;
    const method = pendingChargeMethod;
    await onGenerateCharge(method);
    setPendingChargeMethod(null);
  };

  const pendingChargeMethodLabel =
    pendingChargeMethod === "pix"
      ? "PIX"
      : pendingChargeMethod === "hybrid"
      ? "Boleto + PIX"
      : pendingChargeMethod === "boleto"
      ? "Boleto"
      : "";

  const onCheckChargeStatus = async () => {
    if (!chargeInvoice) return;
    setCheckingStatus(true);
    setChargeActionError(null);
    try {
      const result = await getUnifiedChargeStatus(chargeInvoice.id, {
        environment: resolveInvoiceGatewayEnvironment(chargeInvoice),
      });
      setChargeStatusResult(result);
      const statusLabel = formatChargeStatusLabel(result.status);
      const providerLabel = result.provider ? result.provider.charAt(0).toUpperCase() + result.provider.slice(1) : "—";
      setChargeStatusModal({
        visible: true,
        type: result.status?.toUpperCase() === "PAID" ? "success" : "info",
        title: result.status?.toUpperCase() === "PAID" ? "Pagamento confirmado" : "Status da cobrança",
        message: [
          `Operadora: ${providerLabel}`,
          `Status: ${statusLabel}`,
          `Pago em: ${fmtDateTime(result.paid_at)}`,
        ].join("\n"),
      });
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
    const pixCode = chargePaymentOptions?.payment_assets?.pix_copy_paste ?? chargeResult?.pix_copy_paste;
    if (!pixCode) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(pixCode);
    }
  };

  const isImagePreviewUrl = (url: string | null) => {
    if (!url) return false;
    const normalizedUrl = url.toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp", "image/png", "image/jpeg", "image/webp"].some((token) =>
      normalizedUrl.includes(token)
    );
  };

  const isPdfPreviewUrl = (url: string | null) => {
    if (!url) return false;
    const normalizedUrl = url.toLowerCase();
    return normalizedUrl.includes(".pdf") || normalizedUrl.includes("application/pdf");
  };

  const getPdfPreviewWidth = () => {
    if (typeof window === "undefined") return 760;
    return Math.max(280, Math.min(window.innerWidth - 220, 820));
  };

  const fmt = (v: string | null) =>
    v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  const fmtDateTime = (v: string | null) => {
    if (!v) return "—";
    try {
      const d = new Date(v);
      const date = d.toLocaleDateString("pt-BR");
      const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `${date} às ${time}`;
    } catch {
      return v;
    }
  };

  const formatChargeStatusLabel = (status?: string | null) => {
    const normalized = (status ?? "").toUpperCase();
    const labels: Record<string, string> = {
      OPEN: "Em aberto",
      PENDING: "Pendente",
      PAID: "Pago",
      CANCELLED: "Cancelado",
      CANCELED: "Cancelado",
      EXPIRED: "Expirado",
    };
     

    return labels[normalized] ?? status ?? "—";
  };

  const shouldHideMethodLockedNotice = (message?: string | null) => {
    if (!message) return false;
    const normalized = message.toLowerCase();
    return (
      normalized.includes("cobrança está travada") ||
      normalized.includes("nao é permitido trocar o método") ||
      normalized.includes("não é permitido trocar o método")
    );
  };

  const normalizeChargeMethod = (method?: string | null): "pix" | "boleto" | "hybrid" | null => {
    if (!method) return null;
    if (method === "pix") return "pix";
    if (method === "hybrid") return "hybrid";
    if (method === "boleto" || method === "bank_slip") return "boleto";
    return null;
  };

  const toGeneratedChargeFromAssets = (
    invoiceId: number,
    assets?: InvoicePaymentAssets | null,
    provider = "cora",
    fallbackStatus = ""
  ): GeneratedCharge | null => {
    if (!assets) return null;
    const boletoUrl = resolveBoletoPaymentUrl([assets.boleto_url]);
    const pixQr =
      assets.pix_qr_image_url ||
      (isPixQrImageUrl(assets.boleto_url) ? assets.boleto_url : null);
    const hasAnyAsset = !!(
      assets.charge_id ||
      assets.pix_copy_paste ||
      pixQr ||
      assets.boleto_digitable ||
      boletoUrl ||
      assets.boleto_number
    );
    if (!hasAnyAsset) return null;

    return {
      invoice_id: invoiceId,
      provider,
      environment: undefined,
      charge_id: assets.charge_id ?? "",
      status: assets.charge_status ?? fallbackStatus,
      payment_url: boletoUrl,
      pix_copy_paste: assets.pix_copy_paste ?? null,
      boleto_number: assets.boleto_number ?? null,
      boleto_digitable: assets.boleto_digitable ?? null,
      qr_code_image_url: pixQr ?? null,
      expires_at: null,
    };
  };

  const providerOptions = providers.map((item) => ({ value: item.slug, label: item.name }));
  const chargeMethodOptions = [
    { value: "pix", label: "Pix" },
    { value: "boleto", label: "Boleto" },
    { value: "hybrid", label: "Boleto + PIX" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1C3D63" />
      </View>
    );
  }

  if (!enrollment) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-ink-muted">Matrícula não encontrada.</Text>
        <TouchableOpacity
          onPress={() => navigate("matriculas")}
          className="mt-4 px-4 py-2 bg-brand rounded-ds-md"
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

  const chargeAssets = chargePaymentOptions?.payment_assets;
  // Trata "" como ausente para que o fallback para chargeResult dispare corretamente.
  const pickAsset = (...values: (string | null | undefined)[]): string | null => {
    for (const v of values) {
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return null;
  };
  const pixCopyPaste = pickAsset(chargeAssets?.pix_copy_paste, chargeResult?.pix_copy_paste);
  const resultChargeMethod = normalizeChargeMethod(chargeResult?.method);
  const resultPaymentUrl = pickAsset(chargeResult?.payment_url);
  const resultPaymentUrlIsPix = resultChargeMethod === "pix" || (!chargeResult?.boleto_digitable && !!chargeResult?.pix_copy_paste);
  const resultQrCodeImageUrl = pickAsset(chargeResult?.qr_code_image_url);
  const pixQrCodeImageUrl = pickAsset(
    chargeAssets?.pix_qr_image_url,
    resultQrCodeImageUrl && isImagePreviewUrl(resultQrCodeImageUrl) ? resultQrCodeImageUrl : null,
    isPixQrImageUrl(chargeAssets?.boleto_url) ? chargeAssets?.boleto_url : null,
    isPixQrImageUrl(resultPaymentUrl) ? resultPaymentUrl : null,
    isPixQrImageUrl(resultQrCodeImageUrl) ? resultQrCodeImageUrl : null
  );
  const boletoDigitable = pickAsset(chargeAssets?.boleto_digitable, chargeResult?.boleto_digitable);
  const boletoPaymentUrl = resolveBoletoPaymentUrl([
    chargeAssets?.boleto_url,
    resultPaymentUrlIsPix ? null : resultPaymentUrl,
  ]);
  const lockedChargeMethod = normalizeChargeMethod(chargePaymentOptions?.method_lock?.method);
  const isChargeMethodLocked = !!chargePaymentOptions?.method_lock?.locked;
  const canGenerateChargeAction = chargePaymentOptions?.actions?.can_generate_charge ?? true;
  const allowedChargeMethods = (chargePaymentOptions?.allowed_methods ?? [])
    .map((item) => normalizeChargeMethod(item))
    .filter((item): item is "pix" | "boleto" | "hybrid" => item === "pix" || item === "boleto" || item === "hybrid");
  const canUsePix = allowedChargeMethods.includes("pix");
  const canUseBoleto = allowedChargeMethods.includes("boleto");
  const canUseHybrid = allowedChargeMethods.includes("hybrid");
  const canGenerateBoleto = canUseBoleto || canUseHybrid;
  const coraDueDateInfo = chargePaymentOptions?.cora_due_date ?? null;
  const showCoraDueDateHintOnSelect =
    chargeModalStep === "select" && !!coraDueDateInfo && canGenerateBoleto;
  const showCoraDueDateHintForBoleto =
    !!coraDueDateInfo &&
    (pendingChargeMethod === "boleto" || pendingChargeMethod === "hybrid");
  const hasPixAssets = !!(pixCopyPaste || pixQrCodeImageUrl);
  const hasBoletoAssets = !!(boletoDigitable || boletoPaymentUrl);
  const hasHybridBoletoPdf =
    isHybridBoletoUrl(boletoPaymentUrl) ||
    (normalizeChargeMethod(chargePaymentOptions?.current_method) === "hybrid" && hasBoletoAssets) ||
    (normalizeChargeMethod(chargePaymentOptions?.method_lock?.method) === "hybrid" && hasBoletoAssets) ||
    (chargeInvoice?.payment_method === "hybrid" && hasBoletoAssets);
  const hasDualPaymentAssets = hasPixAssets && hasBoletoAssets;
  const selectedChargeMethod = normalizeChargeMethod(chargeMethod);
  const resultDisplayMethod: "pix" | "boleto" | "hybrid" | null = (() => {
    if (chargeModalStep === "result" && (chargeResult || chargePaymentOptions?.payment_assets)) {
      if (hasDualPaymentAssets || (hasBoletoAssets && hasHybridBoletoPdf)) return "hybrid";
      if (hasPixAssets) return "pix";
      if (hasBoletoAssets) return "boleto";
    }
    return resultChargeMethod ?? selectedChargeMethod;
  })();
  const showPixResult =
    resultDisplayMethod === "pix" ||
    resultDisplayMethod === "hybrid" ||
    (!resultDisplayMethod && hasPixAssets);
  const showBoletoResult =
    resultDisplayMethod === "boleto" ||
    resultDisplayMethod === "hybrid" ||
    (!resultDisplayMethod && hasBoletoAssets);
  const activeChargeMethod: "pix" | "boleto" = (() => {
    if (chargeModalStep === "result" && chargeResult) {
      if (resultDisplayMethod === "pix") return "pix";
      if (resultDisplayMethod === "boleto") return "boleto";
      if (resultDisplayMethod === "hybrid") {
        if (chargeMethod === "pix" && showPixResult && hasPixAssets) return "pix";
        if (chargeMethod === "boleto" && showBoletoResult && hasBoletoAssets) return "boleto";
        return showBoletoResult ? "boleto" : "pix";
      }
    }
    // Quando o asset existe, o canal já pode ser usado para pagar — independente de allowed_methods.
    if (chargeMethod === "pix" && hasPixAssets) return "pix";
    if (chargeMethod === "hybrid" && hasBoletoAssets) return "boleto";
    if (chargeMethod === "boleto" && hasBoletoAssets) return "boleto";
    if (hasDualPaymentAssets) return "boleto";
    if (hasBoletoAssets) return "boleto";
    if (hasPixAssets) return "pix";
    // Sem assets ainda — respeita o que o backend permite gerar.
    return canGenerateBoleto ? "boleto" : "pix";
  })();
  const checkoutQrSize = isMobile ? 176 : 148;
  const checkoutActionHeight = isMobile ? 48 : 42;
  const checkoutActionBasis = isMobile ? "100%" : 132;
  const checkoutMethodCardsStacked = isMobile || width < 720;

  const cancelInvoiceTarget = cancelInvoiceId
    ? invoices.find((i) => i.id === cancelInvoiceId) ?? null
    : null;
  const deleteInvoiceTarget = deleteInvoiceId
    ? invoices.find((i) => i.id === deleteInvoiceId) ?? null
    : null;

  const handleInvoiceAction = (action: InvoiceActionKey) => {
    const inv = actionsInvoice;
    if (!inv) return;

    switch (action) {
      case "settle":
        setSettleInvoice(inv);
        break;
      case "generate_charge":
        openChargeModal(inv);
        break;
      case "edit":
        openEditInvoice(inv);
        break;
      case "cancel":
        setCancelInvoiceId(inv.id);
        break;
      case "delete":
        setDeleteInvoiceId(inv.id);
        break;
    }
  };

  const renderInvoiceActions = (item: Invoice) => (
    <View className="flex-row justify-end gap-1">
      <TouchableOpacity
        onPress={() => {
          setAuditInvoice(item);
          setAuditVisible(true);
        }}
        className="items-center justify-center bg-brand-tint rounded-ds-md"
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons name="information-circle-outline" size={15} color="#1C3D63" />
      </TouchableOpacity>
      {item.status === "paid" ? (
        <TouchableOpacity
          onPress={() => openReceiptModal(item)}
          className="items-center justify-center bg-success-tint rounded-ds-md"
          style={{ width: 30, height: 30 }}
          activeOpacity={0.8}
        >
          <Ionicons name="receipt-outline" size={15} color="#1C6A45" />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={() => setActionsInvoice(item)}
        className="items-center justify-center bg-surface-sunken rounded-ds-md"
        style={{ width: 30, height: 30 }}
        activeOpacity={0.8}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color="#4B5463" />
      </TouchableOpacity>
    </View>
  );

  const renderTypeBadge = (type: string | null) => {
    if (!type) {
      return <Text className="text-xs text-ink-subtle">—</Text>;
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
    <View key={item.id} className="bg-surface rounded-ds-md border border-border p-3 gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-mono font-semibold text-brand" numberOfLines={1}>
            ID #{item.id}
            {item.cora?.charge_id ? ` · Cora ${item.cora.charge_id}` : ""}
          </Text>
          <Text className="text-sm font-semibold text-ink mt-0.5" numberOfLines={2}>
            {item.description}
          </Text>
          <Text className="text-xs text-ink-muted mt-0.5">Vence {fmt(item.due_date)}</Text>
          {item.cora_due_date_hint ? (
            <Text className="text-[11px] text-brand mt-1 leading-relaxed">
              {item.cora_due_date_hint}
            </Text>
          ) : null}
        </View>
        <Badge slug={item.status} label={INVOICE_STATUS_LABELS[item.status] ?? item.status} />
      </View>
      <View>{renderTypeBadge(item.type)}</View>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="text-xs text-ink-subtle uppercase font-semibold">Valor</Text>
          <Text className="text-base font-semibold text-ink">{money(item.amount)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-ink-subtle uppercase font-semibold">Forma</Text>
          <Text className="text-sm text-ink-muted">
            {paymentMethodLabel(item.payment_method)}
          </Text>
          {item.status === "paid" && item.payment_reference ? (
            <Text className="text-xs text-ink-subtle mt-0.5" numberOfLines={1}>
              Ref: {item.payment_reference}
            </Text>
          ) : null}
        </View>
      </View>
      {!!item.cora?.charge_id && (
        <TouchableOpacity
          onPress={() => openChargeModal(item)}
          className="flex-row items-center gap-2 bg-brand-tint border border-border rounded-ds-md px-3 py-2"
          activeOpacity={0.8}
        >
          <Ionicons
            name={item.payment_method === "bank_slip" ? "barcode-outline" : "qr-code-outline"}
            size={14}
            color="#1C3D63"
          />
          <Text className="text-xs font-semibold text-brand flex-1" numberOfLines={1}>
            Cobrança Cora · {item.cora.charge_id}
          </Text>
          <Text className="text-xs text-brand">{item.cora.status ?? "—"}</Text>
          <Ionicons name="chevron-forward-outline" size={13} color="#1C3D63" />
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
    <View
      className="bg-surface-sunken border border-border rounded-ds-md px-3 py-2"
      style={{ flex, minHeight: 70 }}
    >
      <Text className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wide mb-1">
        {label}
      </Text>
      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
        {value || "—"}
      </Text>
      {!!detail && (
        <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
          {detail}
        </Text>
      )}
    </View>
  );

  const renderFinanceBlock = (label: string, value: string) => (
    <View className="flex-1 bg-surface-sunken border border-border rounded-ds-md px-3 py-2">
      <Text className="text-[11px] text-ink-subtle uppercase font-semibold mb-1">{label}</Text>
      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
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
      violet: { border: "#1C3D63", bg: "#E9EFF6", text: "#132C4A", soft: "#E9EFF6" },
      amber: { border: "#8A5200", bg: "#FBEFDC", text: "#8A5200", soft: "#FBEFDC" },
      blue: { border: "#1C3D63", bg: "#E9EFF6", text: "#132C4A", soft: "#E9EFF6" },
    }[tone];
    const inactive = "#5F6878";

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.82}
        className="flex-1 rounded-ds-md border flex-row items-center"
        style={{
          minHeight: 50,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderColor: active ? colors.border : "#D9DDE3",
          backgroundColor: active ? colors.bg : disabled ? "#F7F8FA" : "#FFFFFF",
          opacity: disabled ? 0.65 : 1,
          gap: 10,
        }}
      >
        <View
          className="items-center justify-center rounded-ds-md"
          style={{
            width: 32,
            height: 32,
            backgroundColor: active ? colors.soft : "#F7F8FA",
          }}
        >
          <Ionicons name={icon} size={17} color={active ? colors.text : inactive} />
        </View>
        <View className="flex-1">
          <Text
            className="text-sm font-semibold"
            style={{ color: active ? colors.text : inactive }}
            numberOfLines={1}
          >
            {label}
          </Text>
          {!!detail && (
            <Text
              className="text-xs"
              style={{ color: active ? colors.text : "#D9DDE3" }}
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
      {/* Enrollment summary */}
      <View
        className="bg-surface rounded-ds-md mb-5 border border-border"
        style={{
          padding: isMobile ? 12 : 16,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View className="flex-row items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
            <TouchableOpacity
              onPress={() => navigate("matriculas")}
              className="w-9 h-9 bg-brand-tint border border-border rounded-full items-center justify-center"
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back-outline" size={18} color="#1C3D63" />
            </TouchableOpacity>
            <View className="flex-1" style={{ minWidth: 0 }}>
              <View className="flex-row items-center gap-2" style={{ flexWrap: "wrap" }}>
                <Text
                  className={`${isMobile ? "text-lg" : "text-xl"} font-semibold text-ink`}
                  numberOfLines={1}
                >
                  Matrícula {enrollment.enrollment_number ?? `#${enrollment.id}`}
                </Text>
                <Badge
                  slug={enrollment.status}
                  label={ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status}
                />
              </View>
              <Text className="text-sm text-ink-muted" numberOfLines={1}>
                {enrollment.student?.name ?? "—"}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2" style={{ alignSelf: isMobile ? "stretch" : "auto" }}>
            {enrollment.student?.id ? (
              <TouchableOpacity
                onPress={() =>
                  navigate("alunos-boletim", {
                    studentId: enrollment.student!.id,
                    studentName: enrollment.student?.name,
                  })
                }
                className="flex-row items-center justify-center bg-brand-tint border border-border px-3.5 py-2 rounded-ds-md"
                style={{ flex: isMobile ? 1 : undefined, minHeight: 36 }}
                activeOpacity={0.85}
              >
                <Ionicons name="ribbon-outline" size={15} color="#1C3D63" />
                <Text className="text-brand font-semibold text-sm ml-1.5">Boletim</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={openEdit}
              className="flex-row items-center justify-center bg-brand px-3.5 py-2 rounded-ds-md"
              style={{ flex: isMobile ? 1 : undefined, minHeight: 36 }}
              activeOpacity={0.85}
            >
              <Ionicons name="pencil-outline" size={15} color="white" />
              <Text className="text-white font-semibold text-sm ml-1.5">Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeleteEnrollmentVisible(true)}
              className="flex-row items-center justify-center bg-danger-tint border border-danger px-3.5 py-2 rounded-ds-md"
              style={{ flex: isMobile ? 1 : undefined, minHeight: 36 }}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={15} color="#B0261B" />
              <Text className="text-danger font-semibold text-sm ml-1.5">Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="h-px bg-surface-sunken" />

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            {renderInfoBlock(
              enrollmentProductKind(enrollment) === "bundle" ? "Pacote" : "Curso / Plano",
              enrollmentProductTitle(enrollment),
              enrollmentProductSubtitle(enrollment) ??
                (enrollment.course_plan
                  ? `Plano ${enrollment.course_plan.name} · ${enrollment.course_plan.cycle_label}`
                  : null),
              1.8
            )}
            {renderInfoBlock("Início", fmt(enrollment.start_date), null, 0.7)}
            {renderInfoBlock("Término", fmt(enrollment.end_date ?? null), null, 0.7)}
            {renderInfoBlock(
              "Vencimento",
              enrollment.payment_due_day ? `Dia ${enrollment.payment_due_day}` : "—",
              null,
              0.7
            )}
          </View>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            {renderFinanceBlock("Mensalidade (base)", money(enrollment.monthly_amount))}
            {renderFinanceBlock(
              "Desconto",
              enrollment.discount_amount && parseFloat(enrollment.discount_amount) > 0
                ? money(enrollment.discount_amount)
                : "—"
            )}
            {renderFinanceBlock(
              "Mensalidade líquida",
              enrollment.net_monthly_amount
                ? money(enrollment.net_monthly_amount)
                : enrollment.monthly_amount
                  ? money(
                      String(
                        Math.max(
                          0,
                          parseFloat(enrollment.monthly_amount) -
                            (parseFloat(enrollment.discount_amount ?? "0") || 0)
                        )
                      )
                    )
                  : "—"
            )}
            {renderFinanceBlock(
              "Taxa de matrícula",
              enrollment.course_plan?.enrollment_fee_amount
                ? money(String(enrollment.course_plan.enrollment_fee_amount))
                : "—"
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
          <Text className="text-lg font-semibold text-ink">Cobranças</Text>
          <Text className="text-sm text-ink-muted">
            {invoices.length} cobrança{invoices.length !== 1 ? "s" : ""}
          </Text>
          {enrollment.charges_batch_generated && (
            <View className="mt-1 self-start rounded-full bg-success-tint border border-success px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-success">
                Lote gerado em {fmtDateTime(enrollment.charges_generated_at ?? null)}
              </Text>
            </View>
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <TouchableOpacity
            onPress={() => setContractModalVisible(true)}
            className="flex-row items-center justify-center px-4 py-2.5 rounded-ds-md border bg-brand-tint border-border"
            activeOpacity={0.85}
            style={{ minHeight: 44 }}
          >
            <Ionicons name="document-text-outline" size={16} color="#1C3D63" />
            <Text className="font-semibold text-sm ml-1 text-brand">
              Cobranças do contrato
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCarneModalVisible(true)}
            className="flex-row items-center justify-center px-4 py-2.5 rounded-ds-md border bg-success-tint border-success"
            activeOpacity={0.85}
            style={{ minHeight: 44 }}
          >
            <Ionicons name="newspaper-outline" size={16} color="#1C6A45" />
            <Text className="font-semibold text-sm ml-1 text-success">
              Todos os boletos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openCreateInvoice}
            className="flex-row items-center justify-center bg-brand px-4 py-2.5 rounded-ds-md"
            activeOpacity={0.85}
            style={{
              minHeight: 44,
            }}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-semibold text-sm ml-1">Nova cobrança</Text>
          </TouchableOpacity>
        </View>
      </View>

      {invoices.length === 0 ? (
        <View
          className="bg-surface rounded-ds-md items-center justify-center py-12 border border-border"
          style={{
          }}
        >
          <Ionicons name="cash-outline" size={36} color="#D9DDE3" />
          <Text className="text-ink-subtle mt-3 text-sm">Nenhuma cobrança vinculada</Text>
        </View>
      ) : showInvoiceCards ? (
        <View className="gap-3">{invoices.map(renderInvoiceCard)}</View>
      ) : (
        <View
          className="bg-surface rounded-ds-md overflow-hidden border border-border"
          style={{
            width: "100%",
          }}
        >
          <View className="flex-row bg-surface-sunken border-b border-border px-4 py-2.5">
            <Text
              className="text-xs font-semibold text-ink-muted uppercase tracking-wide"
              style={{ width: 88, minWidth: 88 }}
            >
              ID
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 2.2 }}>
              Descrição
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 0.85 }}>
              Tipo
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 0.75 }}>
              Valor
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 0.85 }}>
              Vencimento
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 0.7 }}>
              Forma
            </Text>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wide" style={{ flex: 0.7 }}>
              Status
            </Text>
            <View style={{ width: 132 }} />
          </View>

          {invoices.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row items-center px-4 py-2 border-b border-border ${
                i % 2 === 1 ? "bg-surface-sunken" : ""
              }`}
            >
              <View style={{ width: 88, minWidth: 88, paddingRight: 8 }}>
                <Text className="text-xs font-mono font-semibold text-brand" numberOfLines={1}>
                  #{item.id}
                </Text>
                {item.cora?.charge_id ? (
                  <Text className="text-[10px] text-ink-subtle mt-0.5" numberOfLines={1}>
                    {item.cora.charge_id}
                  </Text>
                ) : null}
              </View>
              <Text className="text-xs font-semibold text-ink" style={{ flex: 2.2 }} numberOfLines={1}>
                {item.description}
              </Text>
              <View style={{ flex: 0.85 }}>{renderTypeBadge(item.type)}</View>
              <Text className="text-xs font-semibold text-ink" style={{ flex: 0.75 }}>
                {money(item.amount)}
              </Text>
              <Text className="text-xs text-ink-muted" style={{ flex: 0.85 }}>
                {fmt(item.due_date)}
              </Text>
              <Text className="text-xs text-ink-muted" style={{ flex: 0.7 }} numberOfLines={1}>
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

      <EnrollmentEditModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        onSubmit={saveEdit}
        saving={saving}
        financialFieldsLocked={!!enrollment?.financial_fields_locked}
        form={editForm}
        setForm={setEditForm}
        errors={editErrors}
        statusOptions={statusOptions}
        classes={classes}
        initialSchoolClassId={initialEditSchoolClassId}
      />

      {/* ── Invoice Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={invoiceModalVisible}
        title={invoiceEditId ? `Editar Cobrança #${invoiceEditId}` : "Nova cobrança"}
        onClose={() => setInvoiceModalVisible(false)}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setInvoiceModalVisible(false)}
              className="px-5 py-2.5 rounded-ds-md border border-border"
            >
              <Text className="text-sm font-semibold text-ink">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveInvoice}
              disabled={savingInvoice}
              className="px-5 py-2.5 rounded-ds-md bg-brand"
            >
              {savingInvoice ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-semibold text-white">Salvar</Text>
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
          placeholder="Ex: Mensalidade março/2026"
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
              label="Forma de pagamento"
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
            <View className="bg-surface-sunken rounded-ds-md px-4 py-3 mt-4 mb-4">
              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-2">
                Motivo da alteração
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
            <View className="mt-3 rounded-ds-md bg-surface-sunken border border-border px-3 py-2.5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-row items-start gap-3 flex-1">
                  {chargeModalStep === "result" && (
                    <View
                      className={`w-10 h-10 rounded-ds-md items-center justify-center ${
                        chargeMethod === "pix" ? "bg-success-tint" : "bg-brand-tint"
                      }`}
                    >
                      {chargeMethod === "pix" ? (
                        <PixLogoIcon size={25} color="#1C6A45" weight="fill" />
                      ) : (
                        <Ionicons name="barcode-outline" size={20} color="#1C3D63" />
                      )}
                    </View>
                  )}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="text-xs text-ink-muted uppercase font-semibold" numberOfLines={1}>
                        Cobrança ID #{chargeInvoice.id}
                      </Text>
                      {chargeInvoice.cora?.charge_id ? (
                        <Text className="text-[11px] font-mono text-brand" numberOfLines={1}>
                          Cora {chargeInvoice.cora.charge_id}
                        </Text>
                      ) : null}
                      <View className="rounded-full border border-border bg-brand-tint px-2.5 py-1 flex-row items-center gap-1.5">
                        <Ionicons name="calendar-outline" size={12} color="#1C3D63" />
                        <Text className="text-xs font-semibold text-brand">
                          Vencimento {fmt(chargeInvoice.due_date)}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-sm font-semibold text-ink mt-0.5" numberOfLines={2}>
                      {chargeInvoice.description}
                    </Text>
                  </View>
                </View>
                <View className="items-end" style={{ minWidth: 104 }}>
                  <Text className="text-xs text-ink-muted uppercase font-semibold">Total</Text>
                  <Text className="text-xl font-semibold text-brand">
                    {money(chargeInvoice.amount)}
                  </Text>
                </View>
              </View>
            </View>
          ) : undefined
        }
        footerStyle={{
          backgroundColor: "#F7F8FA",
          flexWrap: "wrap",
          alignItems: "stretch",
          paddingHorizontal: isMobile ? 16 : 24,
          paddingVertical: isMobile ? 14 : 10,
        }}
        footer={
          chargeModalStep === "result" ? (
            <>
              <TouchableOpacity
                onPress={onCheckChargeStatus}
                disabled={checkingStatus || !chargeInvoice}
                activeOpacity={0.8}
                className="px-3 py-2 rounded-ds-md border border-border bg-surface items-center flex-row justify-center gap-2"
                style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
              >
                {checkingStatus ? (
                  <ActivityIndicator size="small" color="#1C3D63" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={15} color="#1C3D63" />
                    <Text className="text-xs font-semibold text-brand">Consultar status</Text>
                  </>
                )}
              </TouchableOpacity>
              {!!boletoPaymentUrl && showBoletoResult && hasBoletoAssets && chargeStatusResult?.status?.toUpperCase() !== "PAID" && (
                <TouchableOpacity
                  onPress={() => openPreviewModal(boletoPaymentUrl)}
                  activeOpacity={0.85}
                  className="px-3 py-2 rounded-ds-md border border-brand bg-brand items-center flex-row justify-center gap-2"
                  style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
                >
                  <Ionicons name="document-text-outline" size={15} color="white" />
                  <Text className="text-xs font-semibold text-white">Ver boleto</Text>
                </TouchableOpacity>
              )}
              {typeof window !== "undefined" && window.location.hostname === "localhost" && (
                <TouchableOpacity
                  onPress={onPayCharge}
                  disabled={payingCharge || !chargeInvoice || chargeEnvironment !== "stage"}
                  activeOpacity={0.8}
                  className="px-3 py-2 rounded-ds-md border border-success bg-surface items-center flex-row justify-center gap-2"
                  style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
                >
                  {payingCharge ? (
                    <ActivityIndicator size="small" color="#1C6A45" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={15} color="#1C6A45" />
                      <Text className="text-xs font-semibold text-success">Simular pagamento</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity
              onPress={closeChargeModal}
              activeOpacity={0.85}
              className="px-4 py-2.5 rounded-ds-md border border-border bg-surface items-center flex-row justify-center gap-2"
              style={{ minWidth: isMobile ? undefined : 140 }}
            >
              <Ionicons name="arrow-back-outline" size={15} color="#111722" />
              <Text className="text-xs font-semibold text-ink">Voltar</Text>
            </TouchableOpacity>
          )
        }
      >
        {chargeModalStep === "select" && (
          <>
            {showCoraDueDateHintOnSelect && coraDueDateInfo ? (
              <View className="mb-3">
                <CoraDueDatePolicyBanner
                  message={coraDueDateInfo.policy_hint}
                  emphasized={coraDueDateInfo.would_adjust}
                />
                {coraDueDateInfo.would_adjust ? (
                  <Text className="text-xs text-warning mt-2 leading-relaxed">
                    {`Vencimento local ${isoToDisplayDate(coraDueDateInfo.local_due_date)} será enviado à Cora como ${isoToDisplayDate(coraDueDateInfo.provider_due_date_preview)}.`}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View className="mb-3">
              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-2">
                Escolha a forma de pagamento
              </Text>
              {loadingChargeOptions && (
                <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-2.5 mb-2 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#4B5463" />
                  <Text className="text-xs text-ink-muted">Carregando opções de pagamento...</Text>
                </View>
              )}
              {resultDisplayMethod === "hybrid" && (hasDualPaymentAssets || hasHybridBoletoPdf) && (
                <View className="rounded-ds-md border border-border bg-brand-tint px-3 py-2.5 mb-2">
                  <Text className="text-xs font-semibold text-brand">Boleto + PIX</Text>
                  <Text className="text-xs text-brand mt-1">
                    {hasDualPaymentAssets
                      ? "Esta cobrança possui os dois canais de pagamento. Você pode usar qualquer um sem gerar nova cobrança."
                      : "O QR Code PIX está no PDF do boleto. Use o botão Ver boleto para abrir e pagar."}
                  </Text>
                </View>
              )}
              <View
                className="gap-3"
                style={{ flexDirection: checkoutMethodCardsStacked ? "column" : "row" }}
              >
                {(() => {
                  const baseDisabled =
                    generatingCharge ||
                    loadingChargeOptions ||
                    !chargeInvoice ||
                    !chargeProvider ||
                    (chargeInvoice ? !canGenerateChargeForInvoice(chargeInvoice) : true) ||
                    !canGenerateChargeAction;

                  const methods: Array<{
                    key: "boleto" | "pix";
                    generateMethod?: "boleto" | "hybrid";
                    title: string;
                    subtitle: string;
                    actionLabel: string;
                    icon: keyof typeof Ionicons.glyphMap;
                    iconColor: string;
                    iconBg: string;
                    enabled: boolean;
                    hasAssets: boolean;
                  }> = [
                    {
                      key: "boleto",
                      title: canUseHybrid ? "Boleto + PIX" : "Boleto",
                      subtitle: hasBoletoAssets ? "Cobrança disponível" : "Boleto bancário com linha digitável",
                      actionLabel: hasBoletoAssets ? "Usar boleto" : canUseHybrid ? "Gerar boleto + PIX" : "Gerar boleto",
                      icon: "barcode-outline",
                      iconColor: "#1C3D63",
                      iconBg: "#E9EFF6",
                      enabled: canGenerateBoleto,
                      hasAssets: hasBoletoAssets,
                      generateMethod: canUseHybrid ? "hybrid" : "boleto",
                    },
                    {
                      key: "pix",
                      title: "PIX",
                      subtitle: hasPixAssets ? "Cobrança disponível" : "QR Code e código copia e cola",
                      actionLabel: hasPixAssets ? "Usar PIX" : "Gerar PIX",
                      icon: "qr-code-outline",
                      iconColor: "#1C3D63",
                      iconBg: "#E5F1EA",
                      enabled: canUsePix,
                      hasAssets: hasPixAssets,
                    },
                  ];

                  return methods.map((m) => {
                    const lockedOut =
                      isChargeMethodLocked &&
                      lockedChargeMethod !== m.key &&
                      !(
                        lockedChargeMethod === "hybrid" &&
                        (m.key === "boleto" || m.generateMethod === "hybrid")
                      );
                    const disabled = baseDisabled || !m.enabled || lockedOut;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        onPress={() => {
                          const method = m.generateMethod ?? m.key;
                          if (m.hasAssets) {
                            setChargeMethod(method);
                            setChargeModalStep("result");
                            return;
                          }
                          requestGenerateCharge(method);
                        }}
                        disabled={disabled}
                        activeOpacity={0.85}
                        className={`rounded-ds-md border px-4 py-4 ${
                          disabled
                            ? "border-border bg-surface-sunken opacity-60"
                            : "border-border bg-surface"
                        }`}
                        style={{
                          flexGrow: 1,
                          flexBasis: checkoutMethodCardsStacked ? "100%" : 0,
                          minHeight: checkoutMethodCardsStacked ? undefined : 164,
                          minWidth: 0,
                          elevation: disabled ? 0 : 1,
                        }}
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View
                            className="w-12 h-12 rounded-ds-md items-center justify-center"
                            style={{ backgroundColor: disabled ? "#F7F8FA" : m.iconBg }}
                          >
                            {m.key === "pix" ? (
                              <PixLogoIcon
                                size={25}
                                color={disabled ? "#5F6878" : m.iconColor}
                                weight="fill"
                              />
                            ) : (
                              <Ionicons
                                name={m.icon}
                                size={24}
                                color={disabled ? "#5F6878" : m.iconColor}
                              />
                            )}
                          </View>
                          {m.hasAssets && m.enabled && !lockedOut && (
                            <View className="rounded-full bg-success-tint border border-success px-2.5 py-1">
                              <Text className="text-[11px] font-semibold text-success">Disponível</Text>
                            </View>
                          )}
                        </View>
                        <View className="mt-3 flex-1">
                          <Text
                            className={`text-base font-semibold ${
                              disabled ? "text-ink-muted" : "text-ink"
                            }`}
                            numberOfLines={1}
                          >
                            {m.title}
                          </Text>
                          <Text
                            className={`text-xs mt-1 leading-4 ${disabled ? "text-ink-subtle" : "text-ink-muted"}`}
                            numberOfLines={2}
                          >
                            {!m.enabled
                              ? "Método não habilitado para este tenant"
                              : lockedOut
                              ? "Método bloqueado para esta cobrança"
                              : m.subtitle}
                          </Text>
                        </View>
                        <View className="mt-4 flex-row items-center justify-between gap-2">
                          <Text
                            className={`text-xs font-semibold ${
                              disabled ? "text-ink-subtle" : "text-brand"
                            }`}
                            numberOfLines={1}
                          >
                            {m.actionLabel}
                          </Text>
                          {generatingCharge && chargeMethod === m.key ? (
                            <ActivityIndicator size="small" color="#4B5463" />
                          ) : (
                            <Ionicons
                              name="chevron-forward-outline"
                              size={18}
                              color={disabled ? "#7A8393" : "#5F6878"}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>
            </View>
          </>
        )}

        {chargeModalStep === "result" && (!!chargeResult || hasPixAssets || hasBoletoAssets) && (
          <View className="gap-2.5">
            {(() => {
              // No checkout, basta o asset existir para oferecer a aba — o tenant já permitiu gerar.
              const resultTabs = [
                showBoletoResult && hasBoletoAssets ? "boleto" : null,
                showPixResult && hasPixAssets ? "pix" : null,
              ].filter((item): item is "pix" | "boleto" => !!item);
              const showToggle =
                resultTabs.length > 1 &&
                chargeStatusResult?.status?.toUpperCase() !== "PAID";
              if (!showToggle) return null;
              return (
                <View className="rounded-ds-md border border-border bg-surface-sunken p-1 flex-row gap-1">
                  {resultTabs.map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setChargeMethod(tab)}
                      activeOpacity={0.85}
                      className={`flex-1 rounded-ds-md py-2.5 flex-row items-center justify-center gap-1.5 ${
                        activeChargeMethod === tab ? "bg-brand" : "bg-surface"
                      }`}
                      style={activeChargeMethod === tab ? { } : undefined}
                    >
                      {tab === "pix" ? (
                        <PixLogoIcon
                          size={17}
                          color={activeChargeMethod === tab ? "white" : "#4B5463"}
                          weight="fill"
                        />
                      ) : (
                        <Ionicons
                          name="barcode-outline"
                          size={16}
                          color={activeChargeMethod === tab ? "white" : "#4B5463"}
                        />
                      )}
                      <Text className={`text-xs font-semibold ${activeChargeMethod === tab ? "text-white" : "text-ink-muted"}`}>
                        {tab === "boleto" ? "Boleto" : "PIX"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

            <View>
              {/* ── PIX ── */}
              {activeChargeMethod === "pix" && showPixResult && hasPixAssets && chargeStatusResult?.status?.toUpperCase() !== "PAID" && (
                <View
                  className="rounded-ds-md border border-border bg-surface p-3"
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    gap: isMobile ? 14 : 12,
                  }}
                >
                  <View className="items-center justify-center">
                    <View className="rounded-ds-md border border-border bg-surface p-2.5">
                      {pixQrCodeImageUrl && pixQrCodeImageUrl !== "" ? (
                        <Image
                          source={{ uri: pixQrCodeImageUrl }}
                          style={{ width: checkoutQrSize, height: checkoutQrSize }}
                          resizeMode="contain"
                        />
                      ) : pixCopyPaste ? (
                        <QRCode
                          value={pixCopyPaste}
                          size={checkoutQrSize}
                          color="#000000"
                          backgroundColor="#FFFFFF"
                        />
                      ) : (
                        <View className="items-center justify-center" style={{ width: checkoutQrSize, height: checkoutQrSize }}>
                          <ActivityIndicator size="small" color="#4B5463" />
                          <Text className="text-xs text-ink-muted mt-2">Gerando QR Code...</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {!!pixCopyPaste && (
                    <View className="flex-1 justify-center min-w-0">
                      <Text className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wide mb-1.5">
                        Pix copia e cola
                      </Text>
                      <View className="bg-surface-sunken rounded-ds-md border border-border px-3 py-2.5">
                        <View className="flex-row items-center gap-2">
                          <View className="w-8 h-8 rounded-ds-md items-center justify-center" style={{ backgroundColor: "#E5F1EA" }}>
                            <PixLogoIcon size={19} color="#1C6A45" weight="fill" />
                          </View>
                          <View className="flex-1 min-w-0">
                            <Text
                              className="text-xs font-mono text-ink leading-4"
                              selectable
                              numberOfLines={2}
                              ellipsizeMode="middle"
                            >
                              {pixCopyPaste}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={copyPixCode}
                            activeOpacity={0.8}
                            className="rounded-ds-md bg-brand px-3 py-2 flex-row items-center gap-1"
                          >
                            <Ionicons name="copy-outline" size={14} color="white" />
                            <Text className="text-xs font-semibold text-white">Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* ── BOLETO ── */}
              {activeChargeMethod === "boleto" && showBoletoResult && hasBoletoAssets && chargeStatusResult?.status?.toUpperCase() !== "PAID" && (
                <View className="gap-2.5">
                  {!!boletoDigitable && (
                    <View className="bg-surface-sunken rounded-ds-md border border-border px-3 py-2.5 flex-row items-center gap-3">
                      <View className="w-8 h-8 rounded-ds-md items-center justify-center bg-brand-tint">
                        <Ionicons name="barcode-outline" size={19} color="#1C3D63" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wide mb-1">Linha digitável</Text>
                        <Text
                          className="text-sm font-mono text-ink font-semibold leading-5"
                          selectable
                          numberOfLines={2}
                        >
                          {boletoDigitable}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(boletoDigitable || "");
                          }
                        }}
                        activeOpacity={0.8}
                        className="bg-brand rounded-ds-md px-3 py-2 flex-row items-center gap-1"
                      >
                        <Ionicons name="copy-outline" size={14} color="white" />
                        <Text className="text-xs font-semibold text-white">Copiar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        {!!chargeActionError && !shouldHideMethodLockedNotice(chargeActionError) && (
          <View className="rounded-ds-md border border-danger bg-danger-tint px-3 py-2.5 mt-3">
            <Text className="text-sm font-semibold text-danger">Atenção</Text>
            <Text className="text-xs text-danger mt-1">{chargeActionError}</Text>
          </View>
        )}

        {!!paidChargeResult && (
          <View className="rounded-ds-md border border-success bg-success-tint px-3 py-2.5 mt-3">
            <Text className="text-sm font-semibold text-success">Pagamento simulado</Text>
            <Text className="text-xs text-success mt-1">Status: {paidChargeResult.status || "—"}</Text>
            <Text className="text-xs text-success mt-1">Pago em: {fmtDateTime(paidChargeResult.paid_at)}</Text>
          </View>
        )}
      </Modal>

      <Modal
        visible={previewModalVisible}
        title="Boleto"
        onClose={closePreviewModal}
        size="lg"
        maxHeight="94%"
        footer={
          <>
            <TouchableOpacity
              onPress={closePreviewModal}
              activeOpacity={0.85}
              className="px-4 py-2.5 rounded-ds-md border border-border bg-surface"
            >
              <Text className="text-xs font-semibold text-ink">Fechar</Text>
            </TouchableOpacity>
            {!!previewUrl && (
              <TouchableOpacity
                onPress={() => {
                  if (typeof window !== "undefined") window.open(previewUrl, "_blank");
                }}
                activeOpacity={0.85}
                className="px-4 py-2.5 rounded-ds-md bg-brand"
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="download-outline" size={15} color="white" />
                  <Text className="text-xs font-semibold text-white">Baixar boleto</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        }
      >
        {!previewUrl ? (
          <View className="rounded-ds-md border border-border bg-surface-sunken px-4 py-4">
            <Text className="text-sm text-ink-muted">Nenhum boleto disponível para visualização.</Text>
          </View>
        ) : Platform.OS !== "web" ? (
          <View className="rounded-ds-md border border-border bg-surface-sunken px-4 py-4">
            <Text className="text-sm text-ink">A visualização embutida está disponível no web.</Text>
            <Text className="text-xs text-ink-muted mt-2">Use "Abrir em nova aba" para ver o boleto.</Text>
          </View>
        ) : isImagePreviewUrl(previewUrl) ? (
          <View>
            <Image
              source={{ uri: previewUrl }}
              style={{ width: "100%", height: 640, borderRadius: 4, resizeMode: "contain", backgroundColor: "#F7F8FA" }}
            />
          </View>
        ) : isPdfPreviewUrl(previewUrl) && PdfDocument && PdfPage ? (
          <View style={{ width: "100%", maxHeight: 680, borderRadius: 4, overflow: "hidden", borderWidth: 1, borderColor: "#D9DDE3", backgroundColor: "#F7F8FA" }}>
            <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center", gap: 16 }}>
              <PdfDocument
                file={previewUrl}
                loading={<Text className="text-sm text-ink-muted">Carregando PDF...</Text>}
                onLoadSuccess={({ numPages }: { numPages: number }) => {
                  setPdfPageCount(numPages);
                  setPdfPreviewError(null);
                }}
                onLoadError={(error: Error) => {
                  setPdfPageCount(0);
                  setPdfPreviewError(error.message || "Não foi possível renderizar o PDF.");
                }}
              >
                {Array.from({ length: pdfPageCount || 1 }, (_, index) => (
                  <View key={`boleto-pdf-page-${index + 1}`} style={{ marginBottom: 16 }}>
                    <PdfPage
                      pageNumber={index + 1}
                      width={getPdfPreviewWidth()}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </View>
                ))}
              </PdfDocument>

              {!!pdfPreviewError && (
                <View className="w-full rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
                  <Text className="text-sm font-semibold text-danger">Falha ao renderizar PDF</Text>
                  <Text className="text-xs text-danger mt-1">{pdfPreviewError}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        ) : (
          <View style={{ width: "100%", height: 680, borderRadius: 4, overflow: "hidden", borderWidth: 1, borderColor: "#D9DDE3", backgroundColor: "#F7F8FA" }}>
            {React.createElement("iframe", {
              src: previewUrl,
              title: "Boleto",
              style: { width: "100%", height: "100%", border: 0, backgroundColor: "white" },
            })}
          </View>
        )}
      </Modal>

      {/* ── Audit Modal ──────────────────────────────────────────────────────── */}
      <Modal
        visible={auditVisible}
        title="Informações da cobrança"
        onClose={() => setAuditVisible(false)}
        size="md"
        footer={
          <TouchableOpacity
            onPress={() => setAuditVisible(false)}
            className="px-5 py-2.5 rounded-ds-md bg-brand"
          >
            <Text className="text-sm font-semibold text-white">Fechar</Text>
          </TouchableOpacity>
        }
      >
        {auditInvoice && (
          <View className="gap-4">
            {/* Informações básicas */}
            <View className="bg-surface-sunken rounded-ds-md px-4 py-3">
              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-2">
                Detalhes
              </Text>
              <View className="gap-2">
                {[
                  { label: "ID", value: `#${auditInvoice.id}` },
                  {
                    label: "ID Cora",
                    value: auditInvoice.cora?.charge_id ?? "—",
                  },
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
                  <View key={row.label} className="flex-row justify-between gap-3">
                    <Text className="text-xs text-ink-muted">{row.label}</Text>
                    <Text className="text-xs font-semibold text-ink text-right flex-1" numberOfLines={2}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Informações de auditoria */}
            <View className="bg-brand-tint rounded-ds-md px-4 py-3">
              <Text className="text-xs font-semibold text-brand uppercase tracking-wide mb-2">
                Auditoria
              </Text>
              <View className="gap-2">
                {auditInvoice.created_by_user?.name && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-brand">Criado por</Text>
                    <Text className="text-xs font-semibold text-brand">
                      {auditInvoice.created_by_user.name}
                    </Text>
                  </View>
                )}
                {auditInvoice.updated_by_user?.name && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-brand">Última edição por</Text>
                    <Text className="text-xs font-semibold text-brand">
                      {auditInvoice.updated_by_user.name}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Motivo da alteração */}
            {auditInvoice.edit_reason && (
              <View className="bg-warning-tint rounded-ds-md px-4 py-3 border border-warning">
                <Text className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">
                  Motivo da alteração
                </Text>
                <Text className="text-sm text-warning">{auditInvoice.edit_reason}</Text>
              </View>
            )}
          </View>
        )}
      </Modal>

      {/* ── Confirm Modals ───────────────────────────────────────────────────── */}
      <InvoiceActionsModal
        visible={!!actionsInvoice}
        invoice={actionsInvoice}
        canGenerateCharge={canGenerateChargeForInvoice(actionsInvoice)}
        onClose={() => setActionsInvoice(null)}
        onSelect={handleInvoiceAction}
      />

      <MarkInvoicePaidModal
        visible={!!settleInvoice}
        invoice={settleInvoice}
        onClose={() => setSettleInvoice(null)}
        onSuccess={() => fetch()}
      />

      <ConfirmModal
        visible={!!pendingChargeMethod}
        title="Confirmar forma de pagamento"
        message={
          chargeInvoice
            ? `Gerar cobrança de ${money(chargeInvoice.amount)} via ${pendingChargeMethodLabel}? Após gerar, o método desta cobrança ficará bloqueado.${
                showCoraDueDateHintForBoleto && coraDueDateInfo?.would_adjust
                  ? `\n\nVencimento na Cora: ${isoToDisplayDate(coraDueDateInfo.provider_due_date_preview)} (em vez de ${isoToDisplayDate(coraDueDateInfo.local_due_date)}). ${coraDueDateInfo.policy_hint}`
                  : showCoraDueDateHintForBoleto && coraDueDateInfo
                    ? `\n\n${coraDueDateInfo.policy_hint}`
                    : ""
              }`
            : `Gerar cobrança via ${pendingChargeMethodLabel}?`
        }
        onConfirm={confirmGenerateCharge}
        onCancel={() => {
          if (!generatingCharge) setPendingChargeMethod(null);
        }}
        loading={generatingCharge}
        confirmLabel="Confirmar"
        iconName={pendingChargeMethod === "pix" ? "qr-code-outline" : pendingChargeMethod === "hybrid" ? "layers-outline" : "barcode-outline"}
        tone="primary"
      />
      <ConfirmModal
        visible={!!cancelInvoiceId}
        title={
          cancelInvoiceId
            ? `Cancelar cobrança #${cancelInvoiceId}`
            : "Cancelar cobrança"
        }
        message={
          cancelInvoiceTarget?.lifecycle_hint ??
          (cancelInvoiceTarget?.requires_cora_cancel_before_delete
            ? "A cobrança será invalidada no provedor (Cora) e permanecerá no histórico como cancelada. Deseja continuar?"
            : "Deseja cancelar esta cobrança no sistema?")
        }
        onConfirm={cancelInvoice}
        onCancel={() => setCancelInvoiceId(null)}
        loading={cancellingInvoice}
        confirmLabel="Sim, cancelar"
        iconName="close-circle-outline"
        tone="primary"
      />
      <ConfirmModal
        visible={!!deleteInvoiceId}
        title={
          deleteInvoiceId
            ? `Excluir cobrança #${deleteInvoiceId}`
            : "Excluir cobrança local"
        }
        message={
          deleteInvoiceTarget?.delete_block_reason
            ? deleteInvoiceTarget.delete_block_reason
            : deleteInvoiceTarget?.lifecycle_hint ??
              "Remove a cobrança criada apenas no sistema, sem boleto ou PIX gerado no provedor."
        }
        onConfirm={removeInvoice}
        onCancel={() => setDeleteInvoiceId(null)}
        loading={deletingInvoice}
        confirmDisabled={deleteInvoiceTarget?.can_delete === false}
      />
      <ConfirmModal
        visible={deleteEnrollmentVisible}
        title="Excluir matrícula"
        message="Todas as cobranças pendentes serão canceladas no provedor quando aplicável. Se alguma cobrança PIX estiver ativa na Cora, a exclusão será bloqueada. Em seguida, a matrícula e os registros locais serão removidos."
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
      <MessageModal
        visible={chargeStatusModal.visible}
        type={chargeStatusModal.type}
        title={chargeStatusModal.title}
        message={chargeStatusModal.message}
        onClose={closeChargeStatusModal}
      />

      {/* Receipt Modal */}
      <Modal
        visible={receiptModalVisible}
        onClose={() => setReceiptModalVisible(false)}
        title="Recibo de pagamento"
        size="md"
        footer={
          receiptData ? (
            <View className="flex-row justify-end gap-2">
              {typeof window !== "undefined" && (
                <TouchableOpacity
                  onPress={() => printReceipt(receiptData)}
                  activeOpacity={0.85}
                  className="px-4 py-2.5 rounded-ds-md bg-brand flex-row items-center gap-2"
                >
                  <Ionicons name="print-outline" size={15} color="white" />
                  <Text className="text-xs font-semibold text-white">Imprimir</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      >
        {loadingReceipt && (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color="#1C3D63" />
            <Text className="text-xs text-ink-muted mt-2">Carregando recibo...</Text>
          </View>
        )}
        {!loadingReceipt && receiptError && (
          <View className="bg-danger-tint border border-danger rounded-ds-md p-3">
            <Text className="text-xs text-danger">{receiptError}</Text>
          </View>
        )}
        {!loadingReceipt && receiptData && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Cabeçalho da escola */}
            <View className="items-center pb-4 mb-4 border-b border-border">
              {receiptData.school.logo_url ? (
                <Image
                  source={{ uri: receiptData.school.logo_url }}
                  style={{ width: 64, height: 64, borderRadius: 4, marginBottom: 8 }}
                  resizeMode="contain"
                />
              ) : (
                <View className="w-16 h-16 rounded-ds-md bg-brand-tint items-center justify-center mb-2">
                  <Ionicons name="school-outline" size={28} color="#1C3D63" />
                </View>
              )}
              <Text className="text-sm font-semibold text-ink text-center">
                {receiptData.school.name}
              </Text>
              {receiptData.school.corporate_name && (
                <Text className="text-xs text-ink-muted text-center">{receiptData.school.corporate_name}</Text>
              )}
              <Text className="text-xs text-ink-muted mt-0.5">CNPJ: {receiptData.school.cnpj}</Text>
              {receiptData.school.address && (
                <Text className="text-xs text-ink-subtle text-center mt-0.5">{receiptData.school.address}</Text>
              )}
            </View>

            {/* Número do recibo */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm font-semibold text-ink">RECIBO DE PAGAMENTO</Text>
              <View className="bg-brand-tint px-2.5 py-1 rounded-ds-md">
                <Text className="text-xs font-semibold text-brand">{receiptData.receipt_number}</Text>
              </View>
            </View>

            {/* Seção Aluno / Pagador */}
            <View className="bg-surface-sunken rounded-ds-md border border-border p-3 mb-3 gap-1.5">
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Aluno:</Text>
                <Text className="text-xs font-semibold text-ink flex-1">{receiptData.student.name}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">CPF aluno:</Text>
                <Text className="text-xs text-ink flex-1">{receiptData.student.document}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Pagador:</Text>
                <Text className="text-xs font-semibold text-ink flex-1">
                  {receiptData.payer.is_guardian
                    ? receiptData.payer.guardian_name ?? receiptData.payer.name
                    : receiptData.payer.name}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">CPF pagador:</Text>
                <Text className="text-xs text-ink flex-1">{receiptData.payer.document}</Text>
              </View>
            </View>

            {/* Matrícula */}
            {receiptData.enrollment && (
              <View className="bg-surface-sunken rounded-ds-md border border-border p-3 mb-3 gap-1.5">
                <View className="flex-row gap-1">
                  <Text className="text-xs text-ink-muted w-20">Matrícula:</Text>
                  <Text className="text-xs font-semibold text-ink flex-1">
                    {receiptData.enrollment.enrollment_number} — {receiptData.enrollment.school_class}
                  </Text>
                </View>
                {receiptData.enrollment.start_date && (
                  <View className="flex-row gap-1">
                    <Text className="text-xs text-ink-muted w-20">Período:</Text>
                    <Text className="text-xs text-ink flex-1">
                      {isoToDisplay(receiptData.enrollment.start_date)}
                      {receiptData.enrollment.end_date
                        ? ` até ${isoToDisplay(receiptData.enrollment.end_date)}`
                        : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Dados da cobrança */}
            <View className="bg-surface-sunken rounded-ds-md border border-border p-3 mb-3 gap-1.5">
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">ID:</Text>
                <Text className="text-xs font-mono font-semibold text-brand flex-1">
                  #{receiptData.invoice.id}
                  {receiptData.invoice.cora_charge_id
                    ? ` · Cora ${receiptData.invoice.cora_charge_id}`
                    : ""}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Descrição:</Text>
                <Text className="text-xs font-semibold text-ink flex-1">{receiptData.invoice.description}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Vencimento:</Text>
                <Text className="text-xs text-ink flex-1">{isoToDisplay(receiptData.invoice.due_date)}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Pagamento:</Text>
                <Text className="text-xs text-ink flex-1">
                  {isoToDisplay(receiptData.invoice.paid_at_date)} às {receiptData.invoice.paid_at_time}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-ink-muted w-20">Método:</Text>
                <Text className="text-xs text-ink flex-1">{receiptData.invoice.payment_method}</Text>
              </View>
              <View className="h-px bg-border my-1" />
              <View className="flex-row gap-1 items-center">
                <Text className="text-xs text-ink-muted w-20">Valor:</Text>
                <Text className="text-sm font-semibold text-success flex-1">R$ {receiptData.invoice.amount}</Text>
              </View>
            </View>

            {/* Verificação */}
            <View className="bg-surface-sunken rounded-ds-md border border-border p-3 gap-1.5">
              <Text className="text-xs text-ink-muted">{receiptData.verification.message}</Text>
              <Text
                className="text-xs font-mono text-ink-subtle"
                numberOfLines={2}
                selectable
              >
                {receiptData.verification.verify_hash}
              </Text>
            </View>
          </ScrollView>
        )}
      </Modal>

      <ContractChargesModal
        visible={contractModalVisible}
        enrollmentId={enrollmentId}
        environment={defaultChargeEnvironment}
        onClose={() => setContractModalVisible(false)}
        onSuccess={(message) => {
          showToast("success", message, "Cobranças do contrato");
          fetch();
        }}
      />

      <EnrollmentCarneModal
        visible={carneModalVisible}
        enrollmentId={enrollmentId}
        environment={defaultChargeEnvironment}
        onClose={() => setCarneModalVisible(false)}
        onSuccess={(message) => {
          showToast("success", message, "Carnê baixado");
          fetch();
        }}
        onError={(message) => showToast("error", message, "Carnê")}
      />
    </View>
  );
}
