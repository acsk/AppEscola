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
import { syncEnrollmentCoraCharges, SyncCoraChargesResult } from "../../services/cora";

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

// ── Types ─────────────────────────────────────────────────────────────────────

type Student = { id: number; name: string; enrollment_number?: string };
type SchoolClass = { id: number; name: string; course?: { id: number; name: string } };
type Guardian = { id: number; name: string };
type CoursePlan = { id: number; name: string; billing_cycle: string; cycle_label: string; price: string; enrollment_fee_amount?: string | number; course?: { id: number; name: string } };

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
  can_edit?: boolean;
  can_delete?: boolean;
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
  charges_generated_at?: string | null;
  charges_batch_generated?: boolean;
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

  // Sync Cora charges
  const [syncingCoraCharges, setSyncingCoraCharges] = useState(false);
  const [syncCoraResult, setSyncCoraResult] = useState<SyncCoraChargesResult | null>(null);

  // Batch charges (one-shot por matrícula)
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchInvoiceTypesFilter, setBatchInvoiceTypesFilter] = useState<string[]>([]);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    status?: string;
    generated_count: number;
    failed_count: number;
    failed?: any[];
  } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

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
    .school-header { text-align: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 16px; }
    .school-header .name { font-size: 15px; font-weight: 700; }
    .school-header .sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .receipt-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .receipt-title h1 { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
    .receipt-number { background: #ede9fe; color: #6d28d9; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
    .row { display: flex; gap: 8px; margin-bottom: 4px; }
    .row:last-child { margin-bottom: 0; }
    .label { color: #6b7280; min-width: 90px; flex-shrink: 0; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 8px 0; }
    .amount { font-size: 15px; font-weight: 700; color: #059669; }
    .verify { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
    .verify p { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
    .verify code { font-size: 10px; font-family: monospace; color: #9ca3af; word-break: break-all; }
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

  // ── Cora Sync ────────────────────────────────────────────────────────────────

  const onSyncCoraCharges = async () => {
    if (!enrollment) return;
    
    setSyncingCoraCharges(true);
    setSyncCoraResult(null);
    
    try {
      const environment = isProductionHost ? "prod" : "stage";
      const result = await syncEnrollmentCoraCharges(enrollment.id, {
        environment: environment as "stage" | "prod",
        create_missing: true,
        async: false,
      });
      
      setSyncCoraResult(result);
      
      // Mostrar resultado com valores default se forem undefined
      const created = result?.created ?? 0;
      const updated = result?.updated ?? 0;
      const ignored = result?.ignored ?? 0;
      const message = `Sincronização concluída: ${created} criada${created !== 1 ? "s" : ""}, ${updated} atualizada${updated !== 1 ? "s" : ""}, ${ignored} ignorada${ignored !== 1 ? "s" : ""}`;
      showToast("success", message, "✓ Boletos sincronizados");
      
      // Recarregar matrícula
      await fetch();
    } catch (error: any) {
      const message = error?.message ?? "Erro ao sincronizar boletos da Cora";
      showToast("error", message, "✗ Erro na sincronização");
      console.error("Sync error:", error);
    }
    
    setSyncingCoraCharges(false);
  };

  // ── Batch charges (one-shot por matrícula) ───────────────────────────────────

  const openBatchModal = () => {
    if (!enrollment) return;
    setBatchResult(null);
    setBatchError(null);
    setBatchInvoiceTypesFilter(["monthly"]);
    setBatchModalVisible(true);
  };

  const onGenerateBatchCharges = async () => {
    if (!enrollment) return;
    setBatchGenerating(true);
    setBatchError(null);
    setBatchResult(null);
    try {
      const body: Record<string, any> = {};
      if (batchInvoiceTypesFilter.length > 0) {
        body.invoice_types = batchInvoiceTypesFilter;
      }
      const { data } = await api.post(
        `/enrollments/${enrollment.id}/generate-charges`,
        body
      );
      const payload = data?.body ?? data ?? {};
      const generated = Number(payload.generated_count ?? 0);
      const existing = Number(payload.existing_count ?? 0);
      setBatchResult({
        status: payload.status,
        generated_count: generated,
        failed_count: 0,
        failed: [],
      });
      showToast(
        "success",
        `${generated} cobrança${generated !== 1 ? "s" : ""} criada${generated !== 1 ? "s" : ""}${existing > 0 ? `, ${existing} já existiam` : ""}.`,
        "✓ Cobranças locais em lote"
      );
      await fetch();
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Falha ao gerar cobranças locais em lote.";
      setBatchError(msg);
      if (status === 409) {
        showToast("warning", msg, "Lote já processado");
        await fetch();
      } else {
        showToast("error", msg, "Falha na geração local");
      }
    }
    setBatchGenerating(false);
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
    setChargeEnvironment(defaultChargeEnvironment);
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
      const result = await getUnifiedChargeStatus(chargeInvoice.id);
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
    const hasAnyAsset = !!(
      assets.charge_id ||
      assets.pix_copy_paste ||
      assets.pix_qr_image_url ||
      assets.boleto_digitable ||
      assets.boleto_url ||
      assets.boleto_number
    );
    if (!hasAnyAsset) return null;

    return {
      invoice_id: invoiceId,
      provider,
      environment: undefined,
      charge_id: assets.charge_id ?? "",
      status: assets.charge_status ?? fallbackStatus,
      payment_url: assets.boleto_url ?? null,
      pix_copy_paste: assets.pix_copy_paste ?? null,
      boleto_number: assets.boleto_number ?? null,
      boleto_digitable: assets.boleto_digitable ?? null,
      qr_code_image_url: assets.pix_qr_image_url ?? null,
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
    resultQrCodeImageUrl && isImagePreviewUrl(resultQrCodeImageUrl) ? resultQrCodeImageUrl : null
  );
  const boletoDigitable = pickAsset(chargeAssets?.boleto_digitable, chargeResult?.boleto_digitable);
  const boletoPaymentUrl = pickAsset(
    chargeAssets?.boleto_url,
    resultPaymentUrlIsPix ? null : resultPaymentUrl
  );
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
  const hasPixAssets = !!(pixCopyPaste || pixQrCodeImageUrl);
  const hasBoletoAssets = !!(boletoDigitable || boletoPaymentUrl);
  const hasDualPaymentAssets = hasPixAssets && hasBoletoAssets;
  const selectedChargeMethod = normalizeChargeMethod(chargeMethod);
  const resultDisplayMethod: "pix" | "boleto" | "hybrid" | null = (() => {
    if (chargeModalStep === "result" && (chargeResult || chargePaymentOptions?.payment_assets)) {
      if (hasDualPaymentAssets) return "hybrid";
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
      {(item.can_edit ?? true) && (
        <TouchableOpacity
          onPress={() => openEditInvoice(item)}
          className="items-center justify-center bg-violet-50 rounded-lg"
          style={{ width: 30, height: 30 }}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
        </TouchableOpacity>
      )}
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
      {item.status === "paid" && (
        <TouchableOpacity
          onPress={() => openReceiptModal(item)}
          className="items-center justify-center bg-emerald-50 rounded-lg"
          style={{ width: 30, height: 30 }}
          activeOpacity={0.8}
        >
          <Ionicons name="receipt-outline" size={15} color="#059669" />
        </TouchableOpacity>
      )}
      {(item.can_delete ?? true) && (
        <TouchableOpacity
          onPress={() => setDeleteInvoiceId(item.id)}
          className="items-center justify-center bg-red-50 rounded-lg"
          style={{ width: 30, height: 30 }}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={15} color="#EF4444" />
        </TouchableOpacity>
      )}
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
              "Taxa de matrícula",
              enrollment.course_plan?.enrollment_fee_amount
                ? money(String(enrollment.course_plan.enrollment_fee_amount))
                : "—"
            )}
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
          {enrollment.charges_batch_generated && (
            <View className="mt-1 self-start rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-emerald-700">
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
          {enrollment.charges_batch_generated ? (
            <View
              className="flex-row items-center justify-center px-4 py-2 rounded-xl bg-gray-200"
              style={{ opacity: 0.85 }}
            >
              <Ionicons name="lock-closed" size={14} color="#6B7280" />
              <Text className="text-gray-600 font-semibold text-sm ml-1">
                Lote já gerado
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={openBatchModal}
              disabled={batchGenerating || invoices.length === 0}
              className={`flex-row items-center justify-center px-4 py-2.5 rounded-xl border ${
                batchGenerating || invoices.length === 0
                  ? "bg-gray-100 border-gray-200"
                  : "bg-emerald-50 border-emerald-200"
              }`}
              activeOpacity={0.85}
              style={{ minHeight: 44 }}
            >
              {batchGenerating ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <Ionicons
                  name="flash"
                  size={16}
                  color={batchGenerating || invoices.length === 0 ? "#9CA3AF" : "#059669"}
                />
              )}
              <Text
                className={`font-bold text-sm ml-1 ${
                  batchGenerating || invoices.length === 0 ? "text-gray-500" : "text-emerald-700"
                }`}
              >
                {batchGenerating ? "Gerando..." : "Gerar cobranças em lote"}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onSyncCoraCharges}
            disabled={syncingCoraCharges}
            className={`flex-row items-center justify-center px-4 py-2.5 rounded-xl border ${
              syncingCoraCharges ? "bg-gray-100 border-gray-200" : "bg-white border-violet-200"
            }`}
            activeOpacity={0.85}
            style={{
              minHeight: 44,
              shadowColor: "#111827",
              shadowOpacity: syncingCoraCharges ? 0 : 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: syncingCoraCharges ? 0 : 1,
            }}
          >
            {syncingCoraCharges ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <Ionicons name="sync" size={16} color="#7C3AED" />
            )}
            <Text className={`font-bold text-sm ml-1 ${syncingCoraCharges ? "text-gray-500" : "text-violet-700"}`}>
              {syncingCoraCharges ? "Sincronizando..." : "Sincronizar"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openCreateInvoice}
            className="flex-row items-center justify-center bg-violet-600 px-4 py-2.5 rounded-xl"
            activeOpacity={0.85}
            style={{
              minHeight: 44,
              shadowColor: "#6D28D9",
              shadowOpacity: 0.2,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-bold text-sm ml-1">Nova Cobrança</Text>
          </TouchableOpacity>
        </View>
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
            <View className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-row items-start gap-3 flex-1">
                  {chargeModalStep === "result" && (
                    <View
                      className={`w-10 h-10 rounded-2xl items-center justify-center ${
                        chargeMethod === "pix" ? "bg-emerald-50" : "bg-blue-50"
                      }`}
                    >
                      {chargeMethod === "pix" ? (
                        <PixLogoIcon size={25} color="#059669" weight="fill" />
                      ) : (
                        <Ionicons name="barcode-outline" size={20} color="#2563EB" />
                      )}
                    </View>
                  )}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="text-xs text-slate-500 uppercase font-bold" numberOfLines={1}>
                        Cobrança #{chargeInvoice.id}
                      </Text>
                      <View className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 flex-row items-center gap-1.5">
                        <Ionicons name="calendar-outline" size={12} color="#7C3AED" />
                        <Text className="text-xs font-bold text-violet-700">
                          Vencimento {fmt(chargeInvoice.due_date)}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-sm font-bold text-gray-900 mt-0.5" numberOfLines={2}>
                      {chargeInvoice.description}
                    </Text>
                  </View>
                </View>
                <View className="items-end" style={{ minWidth: 104 }}>
                  <Text className="text-xs text-slate-500 uppercase font-bold">Total</Text>
                  <Text className="text-xl font-bold text-violet-700">
                    {money(chargeInvoice.amount)}
                  </Text>
                </View>
              </View>
            </View>
          ) : undefined
        }
        footerStyle={{
          backgroundColor: "#F8FAFC",
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
                className="px-3 py-2 rounded-xl border border-violet-200 bg-white items-center flex-row justify-center gap-2"
                style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
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
              {!!boletoPaymentUrl && activeChargeMethod === "boleto" && chargeStatusResult?.status?.toUpperCase() !== "PAID" && (
                <TouchableOpacity
                  onPress={() => openPreviewModal(boletoPaymentUrl)}
                  activeOpacity={0.85}
                  className="px-3 py-2 rounded-xl border border-violet-600 bg-violet-600 items-center flex-row justify-center gap-2"
                  style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
                >
                  <Ionicons name="document-text-outline" size={15} color="white" />
                  <Text className="text-xs font-bold text-white">Ver boleto</Text>
                </TouchableOpacity>
              )}
              {typeof window !== "undefined" && window.location.hostname === "localhost" && (
                <TouchableOpacity
                  onPress={onPayCharge}
                  disabled={payingCharge || !chargeInvoice || chargeEnvironment !== "stage"}
                  activeOpacity={0.8}
                  className="px-3 py-2 rounded-xl border border-emerald-300 bg-white items-center flex-row justify-center gap-2"
                  style={{ flexGrow: 1, flexBasis: checkoutActionBasis, minHeight: checkoutActionHeight }}
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
              )}
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
              {loadingChargeOptions && (
                <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 mb-2 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#6B7280" />
                  <Text className="text-xs text-gray-600">Carregando opções de pagamento...</Text>
                </View>
              )}
              {resultDisplayMethod === "hybrid" && hasDualPaymentAssets && (
                <View className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 mb-2">
                  <Text className="text-xs font-bold text-blue-700">Boleto + PIX disponíveis</Text>
                  <Text className="text-xs text-blue-700 mt-1">
                    Esta cobrança possui os dois canais de pagamento. Você pode usar qualquer um sem gerar nova cobrança.
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
                      iconColor: "#2563EB",
                      iconBg: "#EEF2FF",
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
                      iconColor: "#0F766E",
                      iconBg: "#ECFDF5",
                      enabled: canUsePix,
                      hasAssets: hasPixAssets,
                    },
                  ];

                  return methods.map((m) => {
                    const lockedOut =
                      isChargeMethodLocked && lockedChargeMethod !== m.key;
                    const disabled = baseDisabled || !m.enabled || lockedOut;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        onPress={() => {
                          requestGenerateCharge(m.generateMethod ?? m.key);
                        }}
                        disabled={disabled}
                        activeOpacity={0.85}
                        className={`rounded-2xl border px-4 py-4 ${
                          disabled
                            ? "border-gray-200 bg-gray-100 opacity-60"
                            : "border-gray-200 bg-white"
                        }`}
                        style={{
                          flexGrow: 1,
                          flexBasis: checkoutMethodCardsStacked ? "100%" : 0,
                          minHeight: checkoutMethodCardsStacked ? undefined : 164,
                          minWidth: 0,
                          shadowColor: "#111827",
                          shadowOpacity: disabled ? 0 : 0.04,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: disabled ? 0 : 1,
                        }}
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View
                            className="w-12 h-12 rounded-2xl items-center justify-center"
                            style={{ backgroundColor: disabled ? "#F3F4F6" : m.iconBg }}
                          >
                            {m.key === "pix" ? (
                              <PixLogoIcon
                                size={25}
                                color={disabled ? "#9CA3AF" : m.iconColor}
                                weight="fill"
                              />
                            ) : (
                              <Ionicons
                                name={m.icon}
                                size={24}
                                color={disabled ? "#9CA3AF" : m.iconColor}
                              />
                            )}
                          </View>
                          {m.hasAssets && m.enabled && !lockedOut && (
                            <View className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1">
                              <Text className="text-[11px] font-bold text-emerald-700">Disponível</Text>
                            </View>
                          )}
                        </View>
                        <View className="mt-3 flex-1">
                          <Text
                            className={`text-base font-bold ${
                              disabled ? "text-gray-500" : "text-gray-900"
                            }`}
                            numberOfLines={1}
                          >
                            {m.title}
                          </Text>
                          <Text
                            className={`text-xs mt-1 leading-4 ${disabled ? "text-gray-400" : "text-gray-500"}`}
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
                            className={`text-xs font-bold ${
                              disabled ? "text-gray-400" : "text-violet-700"
                            }`}
                            numberOfLines={1}
                          >
                            {m.actionLabel}
                          </Text>
                          {generatingCharge && chargeMethod === m.key ? (
                            <ActivityIndicator size="small" color="#6B7280" />
                          ) : (
                            <Ionicons
                              name="chevron-forward-outline"
                              size={18}
                              color={disabled ? "#CBD5E1" : "#94A3B8"}
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
                <View className="rounded-2xl border border-slate-200 bg-slate-50 p-1 flex-row gap-1">
                  {resultTabs.map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setChargeMethod(tab)}
                      activeOpacity={0.85}
                      className={`flex-1 rounded-xl py-2.5 flex-row items-center justify-center gap-1.5 ${
                        activeChargeMethod === tab ? "bg-violet-600" : "bg-white"
                      }`}
                      style={activeChargeMethod === tab ? { shadowColor: "#4F46E5", shadowOpacity: 0.16, shadowRadius: 8, elevation: 1 } : undefined}
                    >
                      {tab === "pix" ? (
                        <PixLogoIcon
                          size={17}
                          color={activeChargeMethod === tab ? "white" : "#64748B"}
                          weight="fill"
                        />
                      ) : (
                        <Ionicons
                          name="barcode-outline"
                          size={16}
                          color={activeChargeMethod === tab ? "white" : "#64748B"}
                        />
                      )}
                      <Text className={`text-xs font-bold ${activeChargeMethod === tab ? "text-white" : "text-slate-600"}`}>
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
                  className="rounded-2xl border border-gray-200 bg-white p-3"
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    gap: isMobile ? 14 : 12,
                  }}
                >
                  <View className="items-center justify-center">
                    <View className="rounded-2xl border border-gray-200 bg-white p-2.5">
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
                          <ActivityIndicator size="small" color="#6B7280" />
                          <Text className="text-xs text-gray-500 mt-2">Gerando QR Code...</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {!!pixCopyPaste && (
                    <View className="flex-1 justify-center min-w-0">
                      <Text className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                        Pix copia e cola
                      </Text>
                      <View className="bg-slate-50 rounded-2xl border border-slate-200 px-3 py-2.5">
                        <View className="flex-row items-center gap-2">
                          <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
                            <PixLogoIcon size={19} color="#059669" weight="fill" />
                          </View>
                          <View className="flex-1 min-w-0">
                            <Text
                              className="text-xs font-mono text-gray-900 leading-4"
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
                            className="rounded-xl bg-violet-600 px-3 py-2 flex-row items-center gap-1"
                          >
                            <Ionicons name="copy-outline" size={14} color="white" />
                            <Text className="text-xs font-bold text-white">Copiar</Text>
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
                    <View className="bg-slate-50 rounded-2xl border border-slate-200 px-3 py-2.5 flex-row items-center gap-3">
                      <View className="w-8 h-8 rounded-xl items-center justify-center bg-blue-50">
                        <Ionicons name="barcode-outline" size={19} color="#2563EB" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Linha digitável</Text>
                        <Text
                          className="text-sm font-mono text-gray-900 font-semibold leading-5"
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
                        className="bg-violet-600 rounded-xl px-3 py-2 flex-row items-center gap-1"
                      >
                        <Ionicons name="copy-outline" size={14} color="white" />
                        <Text className="text-xs font-bold text-white">Copiar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        {!!chargeActionError && !shouldHideMethodLockedNotice(chargeActionError) && (
          <View className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 mt-3">
            <Text className="text-sm font-bold text-red-700">Atenção</Text>
            <Text className="text-xs text-red-700 mt-1">{chargeActionError}</Text>
          </View>
        )}

        {!!paidChargeResult && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 mt-3">
            <Text className="text-sm font-bold text-emerald-700">Pagamento simulado</Text>
            <Text className="text-xs text-emerald-700 mt-1">Status: {paidChargeResult.status || "—"}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Pago em: {fmtDateTime(paidChargeResult.paid_at)}</Text>
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
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <Text className="text-xs font-bold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            {!!previewUrl && (
              <TouchableOpacity
                onPress={() => {
                  if (typeof window !== "undefined") window.open(previewUrl, "_blank");
                }}
                activeOpacity={0.85}
                className="px-4 py-2.5 rounded-xl bg-violet-600"
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="download-outline" size={15} color="white" />
                  <Text className="text-xs font-bold text-white">Baixar boleto</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        }
      >
        {!previewUrl ? (
          <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <Text className="text-sm text-gray-600">Nenhum boleto disponível para visualização.</Text>
          </View>
        ) : Platform.OS !== "web" ? (
          <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <Text className="text-sm text-gray-700">A visualização embutida está disponível no web.</Text>
            <Text className="text-xs text-gray-500 mt-2">Use "Abrir em nova aba" para ver o boleto.</Text>
          </View>
        ) : isImagePreviewUrl(previewUrl) ? (
          <View>
            <Image
              source={{ uri: previewUrl }}
              style={{ width: "100%", height: 640, borderRadius: 16, resizeMode: "contain", backgroundColor: "#F9FAFB" }}
            />
          </View>
        ) : isPdfPreviewUrl(previewUrl) && PdfDocument && PdfPage ? (
          <View style={{ width: "100%", maxHeight: 680, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" }}>
            <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center", gap: 16 }}>
              <PdfDocument
                file={previewUrl}
                loading={<Text className="text-sm text-gray-600">Carregando PDF...</Text>}
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
                <View className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <Text className="text-sm font-semibold text-red-700">Falha ao renderizar PDF</Text>
                  <Text className="text-xs text-red-700 mt-1">{pdfPreviewError}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        ) : (
          <View style={{ width: "100%", height: 680, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" }}>
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
        visible={!!pendingChargeMethod}
        title="Confirmar forma de pagamento"
        message={
          chargeInvoice
            ? `Gerar cobrança de ${money(chargeInvoice.amount)} via ${pendingChargeMethodLabel}? Após gerar, o método desta cobrança ficará bloqueado.`
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
        title="Recibo de Pagamento"
        size="md"
        footer={
          receiptData ? (
            <View className="flex-row justify-end gap-2">
              {typeof window !== "undefined" && (
                <TouchableOpacity
                  onPress={() => printReceipt(receiptData)}
                  activeOpacity={0.85}
                  className="px-4 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
                >
                  <Ionicons name="print-outline" size={15} color="white" />
                  <Text className="text-xs font-bold text-white">Imprimir</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      >
        {loadingReceipt && (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text className="text-xs text-gray-500 mt-2">Carregando recibo...</Text>
          </View>
        )}
        {!loadingReceipt && receiptError && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3">
            <Text className="text-xs text-red-700">{receiptError}</Text>
          </View>
        )}
        {!loadingReceipt && receiptData && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Cabeçalho da escola */}
            <View className="items-center pb-4 mb-4 border-b border-gray-200">
              {receiptData.school.logo_url ? (
                <Image
                  source={{ uri: receiptData.school.logo_url }}
                  style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 8 }}
                  resizeMode="contain"
                />
              ) : (
                <View className="w-16 h-16 rounded-xl bg-violet-100 items-center justify-center mb-2">
                  <Ionicons name="school-outline" size={28} color="#7C3AED" />
                </View>
              )}
              <Text className="text-sm font-bold text-gray-900 text-center">
                {receiptData.school.name}
              </Text>
              {receiptData.school.corporate_name && (
                <Text className="text-xs text-gray-500 text-center">{receiptData.school.corporate_name}</Text>
              )}
              <Text className="text-xs text-gray-500 mt-0.5">CNPJ: {receiptData.school.cnpj}</Text>
              {receiptData.school.address && (
                <Text className="text-xs text-gray-400 text-center mt-0.5">{receiptData.school.address}</Text>
              )}
            </View>

            {/* Número do recibo */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm font-bold text-gray-900">RECIBO DE PAGAMENTO</Text>
              <View className="bg-violet-100 px-2.5 py-1 rounded-lg">
                <Text className="text-xs font-bold text-violet-700">{receiptData.receipt_number}</Text>
              </View>
            </View>

            {/* Seção Aluno / Pagador */}
            <View className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3 gap-1.5">
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Aluno:</Text>
                <Text className="text-xs font-semibold text-gray-800 flex-1">{receiptData.student.name}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">CPF aluno:</Text>
                <Text className="text-xs text-gray-700 flex-1">{receiptData.student.document}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Pagador:</Text>
                <Text className="text-xs font-semibold text-gray-800 flex-1">
                  {receiptData.payer.is_guardian
                    ? receiptData.payer.guardian_name ?? receiptData.payer.name
                    : receiptData.payer.name}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">CPF pagador:</Text>
                <Text className="text-xs text-gray-700 flex-1">{receiptData.payer.document}</Text>
              </View>
            </View>

            {/* Matrícula */}
            {receiptData.enrollment && (
              <View className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3 gap-1.5">
                <View className="flex-row gap-1">
                  <Text className="text-xs text-gray-500 w-20">Matrícula:</Text>
                  <Text className="text-xs font-semibold text-gray-800 flex-1">
                    {receiptData.enrollment.enrollment_number} — {receiptData.enrollment.school_class}
                  </Text>
                </View>
                {receiptData.enrollment.start_date && (
                  <View className="flex-row gap-1">
                    <Text className="text-xs text-gray-500 w-20">Período:</Text>
                    <Text className="text-xs text-gray-700 flex-1">
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
            <View className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3 gap-1.5">
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Descrição:</Text>
                <Text className="text-xs font-semibold text-gray-800 flex-1">{receiptData.invoice.description}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Vencimento:</Text>
                <Text className="text-xs text-gray-700 flex-1">{isoToDisplay(receiptData.invoice.due_date)}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Pagamento:</Text>
                <Text className="text-xs text-gray-700 flex-1">
                  {isoToDisplay(receiptData.invoice.paid_at_date)} às {receiptData.invoice.paid_at_time}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-xs text-gray-500 w-20">Método:</Text>
                <Text className="text-xs text-gray-700 flex-1">{receiptData.invoice.payment_method}</Text>
              </View>
              <View className="h-px bg-gray-200 my-1" />
              <View className="flex-row gap-1 items-center">
                <Text className="text-xs text-gray-500 w-20">Valor:</Text>
                <Text className="text-sm font-bold text-emerald-700 flex-1">R$ {receiptData.invoice.amount}</Text>
              </View>
            </View>

            {/* Verificação */}
            <View className="bg-gray-50 rounded-xl border border-gray-100 p-3 gap-1.5">
              <Text className="text-xs text-gray-500">{receiptData.verification.message}</Text>
              <Text
                className="text-xs font-mono text-gray-400"
                numberOfLines={2}
                selectable
              >
                {receiptData.verification.verify_hash}
              </Text>
            </View>
          </ScrollView>
        )}
      </Modal>

      {/* ── Batch Charges Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={batchModalVisible}
        title="Gerar cobranças locais em lote"
        onClose={() => (batchGenerating ? undefined : setBatchModalVisible(false))}
        size="md"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setBatchModalVisible(false)}
              disabled={batchGenerating}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            {!batchResult && (
              <TouchableOpacity
                onPress={onGenerateBatchCharges}
                disabled={batchGenerating}
                className={`px-5 py-2.5 rounded-xl ${batchGenerating ? "bg-emerald-300" : "bg-emerald-600"}`}
              >
                {batchGenerating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-sm font-bold text-white">Gerar agora</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        }
      >
        <View className="gap-3">
          <View className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <Text className="text-xs font-bold text-amber-800">
              Ação única por matrícula
            </Text>
            <Text className="text-xs text-amber-700 mt-1">
              Após gerar em lote, esta ação ficará bloqueada para esta matrícula.
              Cobranças avulsas individuais continuarão disponíveis nas invoices.
            </Text>
          </View>

          <View className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Text className="text-xs font-bold text-slate-700">Padrão do lote</Text>
            <Text className="text-xs text-slate-600 mt-1">
              O painel gera apenas invoices locais em lote. A taxa de matrícula é obrigatória na matrícula e as mensalidades são opcionais.
            </Text>
          </View>

          {!!batchError && (
            <View className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
              <Text className="text-sm font-bold text-red-700">Erro</Text>
              <Text className="text-xs text-red-700 mt-1">{batchError}</Text>
            </View>
          )}

          {!!batchResult && (
            <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <Text className="text-sm font-bold text-emerald-700">
                Resultado
              </Text>
              <Text className="text-xs text-emerald-700 mt-1">
                Status: {batchResult.status ?? "—"}
              </Text>
              <Text className="text-xs text-emerald-700">
                Geradas: {batchResult.generated_count} · Falhas:{" "}
                {batchResult.failed_count}
              </Text>
              {!!batchResult.failed && batchResult.failed.length > 0 && (
                <View className="mt-2 gap-1">
                  <Text className="text-[11px] font-bold text-red-700">
                    Invoices com falha:
                  </Text>
                  {batchResult.failed.map((f: any, i: number) => (
                    <Text key={i} className="text-[11px] text-red-700">
                      • Invoice #{f.invoice_id ?? "?"} — {f.error ?? f.message ?? "erro"}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
