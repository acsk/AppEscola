import React, { useState, useEffect, useCallback } from "react";
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
import api from "../services/api";
import { parseApiErrors } from "../utils/apiErrors";
import Modal from "../components/ui/Modal";
import FormInput from "../components/ui/FormInput";
import FormSelect from "../components/ui/FormSelect";
import SearchableSelect from "../components/ui/SearchableSelect";
import DatePickerInput from "../components/ui/DatePickerInput";
import PaymentProviderSelectField from "../components/payments/PaymentProviderSelectField";
import Badge from "../components/ui/Badge";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  ChargeStatusResponse,
  GeneratedCharge,
  PaidChargeResponse,
  PaymentProvider,
  generateUnifiedCharge,
  getUnifiedChargeStatus,
  listPaymentProviders,
  payUnifiedCharge,
} from "../services/payments";
import {
  useInvoiceStatuses,
  usePaymentMethods,
  domainToOptions,
} from "../hooks/useDomains";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import MarkInvoicePaidModal from "../components/finance/MarkInvoicePaidModal";
import InvoiceActionsModal, { type InvoiceActionKey } from "../components/finance/InvoiceActionsModal";
import { fetchInvoiceSummary, type InvoiceSummary } from "../services/invoices";
import { paymentMethodLabel } from "../utils/paymentMethods";
import {
  defaultPaymentEnvironment,
  resolveInvoiceGatewayEnvironment,
} from "../utils/paymentEnvironment";
import {
  currencyToFloat,
  displayToISO,
  floatToCurrency,
  isoToDisplay,
  maskCurrency,
} from "../utils/masks";

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

import type { GuardianRef, StudentRef } from "../types/entities";
import type { Invoice, InvoiceFormValues, InvoicesScreenProps } from "../types/invoices";

const canGenerateChargeForInvoice = (invoice: Invoice | null) => {
  if (!invoice) return false;

  return invoice.status !== "paid" && invoice.status !== "cancelled";
};

const EMPTY: InvoiceFormValues = {
  student_id: "",
  description: "",
  amount: "",
  due_date: "",
  enrollment_id: "",
  guardian_id: "",
  status: "pending",
  payment_method: "",
  notes: "",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const STUDENT_NAME_LIMIT = 32;
const DESCRIPTION_LIMIT = 44;

const limitText = (value: string | undefined | null, max: number) => {
  if (!value) return "—";
  const clean = value.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

const SUMMARY_TONES: Record<string, { bg: string; border: string; text: string }> = {
  amber: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
  red: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
  emerald: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
};

type ListView = "open" | "paid" | "all";

const monthStartISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

type ApiFieldErrorsPayload = { [field: string]: string | string[] };

function parseApiFieldErrors(error: unknown): Record<string, string> {
  const err = error as {
    response?: {
      data?: {
        errors?: ApiFieldErrorsPayload;
        body?: { errors?: ApiFieldErrorsPayload };
      };
    };
  };
  const raw = err?.response?.data?.body?.errors ?? err?.response?.data?.errors ?? {};
  return parseApiErrors(raw);
}

function validateInvoiceForm(form: InvoiceFormValues): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.student_id) errs.student_id = "Selecione o aluno.";
  if (!form.description.trim()) errs.description = "Descrição é obrigatória.";
  if (!form.amount.trim()) {
    errs.amount = "Informe o valor.";
  } else {
    const amount = currencyToFloat(form.amount);
    if (Number.isNaN(amount) || amount <= 0) errs.amount = "Informe um valor válido.";
  }
  if (!form.due_date.trim()) {
    errs.due_date = "Informe o vencimento.";
  } else if (!displayToISO(form.due_date)) {
    errs.due_date = "Data inválida.";
  }
  if (form.enrollment_id.trim()) {
    const enrollmentId = Number(form.enrollment_id);
    if (!Number.isInteger(enrollmentId) || enrollmentId < 1) {
      errs.enrollment_id = "Informe um ID numérico válido.";
    }
  }
  return errs;
}

function validatePaidPeriodFilter(fromIso: string, toIso: string): string | null {
  if (!fromIso.trim() || !toIso.trim()) return null;
  const fromMs = new Date(`${fromIso}T00:00:00`).getTime();
  const toMs = new Date(`${toIso}T00:00:00`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return "Período inválido.";
  if (toMs < fromMs) return "A data final deve ser maior que a data inicial.";
  return null;
}

export default function InvoicesScreen(_props: InvoicesScreenProps) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [listView, setListView] = useState<ListView>("open");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [paidAtFrom, setPaidAtFrom] = useState(monthStartISO());
  const [paidAtTo, setPaidAtTo] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [actionsInvoice, setActionsInvoice] = useState<Invoice | null>(null);
  const [settleInvoice, setSettleInvoice] = useState<Invoice | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<InvoiceFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterPeriodError, setFilterPeriodError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [chargeModalVisible, setChargeModalVisible] = useState(false);
  const [chargeInvoice, setChargeInvoice] = useState<Invoice | null>(null);
  const [chargeProvider, setChargeProvider] = useState("");
  const [chargeEnvironment, setChargeEnvironment] = useState<"stage" | "prod">(
    defaultPaymentEnvironment
  );
  const [chargeMethod, setChargeMethod] = useState("pix");
  const [generatingCharge, setGeneratingCharge] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [payingCharge, setPayingCharge] = useState(false);
  const [chargeResult, setChargeResult] = useState<GeneratedCharge | null>(null);
  const [chargeStatusResult, setChargeStatusResult] = useState<ChargeStatusResponse | null>(null);
  const [paidChargeResult, setPaidChargeResult] = useState<PaidChargeResponse | null>(null);
  const [chargeActionError, setChargeActionError] = useState<string | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentRef[]>([]);
  const [guardians, setGuardians] = useState<GuardianRef[]>([]);

  const invoiceStatuses = useInvoiceStatuses();
  const paymentMethods = usePaymentMethods();
  const statusOptions = domainToOptions(invoiceStatuses).map((o) => ({
    ...o,
    label: STATUS_LABELS[o.value] ?? o.label,
  }));
  const methodOptions = [
    { value: "", label: "Não informado" },
    ...domainToOptions(paymentMethods).map((o) => ({
      ...o,
      label: paymentMethodLabel(o.value),
    })),
  ];
  const filterMethodOptions = [
    { value: "", label: "Todas as formas" },
    ...domainToOptions(paymentMethods).map((o) => ({
      ...o,
      label: paymentMethodLabel(o.value),
    })),
  ];

  const fetchLookups = async () => {
    try {
      const [sRes, gRes] = await Promise.all([
        api.get("/students", { params: { per_page: 200 } }),
        api.get("/guardians", { params: { per_page: 200 } }),
      ]);
      setStudents(sRes.data.data ?? []);
      setGuardians(gRes.data.data ?? []);
    } catch {}
  };

  const fetch = useCallback(async () => {
    if (listView === "paid") {
      const periodErr = validatePaidPeriodFilter(paidAtFrom, paidAtTo);
      setFilterPeriodError(periodErr);
      if (periodErr) {
        setRows([]);
        setLoading(false);
        return;
      }
    } else {
      setFilterPeriodError(null);
    }

    setLoading(true);
    try {
      const params: Record<string, any> = { page, view: listView };
      if (statusFilter) params.status = statusFilter;
      if (paymentMethodFilter) params.payment_method = paymentMethodFilter;
      if (search.trim()) params.search = search.trim();
      if (listView === "paid") {
        if (paidAtFrom) params.paid_at_from = paidAtFrom;
        if (paidAtTo) params.paid_at_to = paidAtTo;
      }
      const { data } = await api.get("/invoices", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter, listView, paymentMethodFilter, paidAtFrom, paidAtTo, search]);

  const loadSummary = useCallback(async () => {
    const periodErr = validatePaidPeriodFilter(paidAtFrom, paidAtTo);
    setFilterPeriodError(periodErr);
    if (periodErr) {
      setSummary(null);
      return;
    }

    setSummaryLoading(true);
    try {
      const data = await fetchInvoiceSummary({
        paid_at_from: paidAtFrom || undefined,
        paid_at_to: paidAtTo || undefined,
      });
      setSummary(data);
    } catch {
      setSummary(null);
    }
    setSummaryLoading(false);
  }, [paidAtFrom, paidAtTo]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const list = await listPaymentProviders();
        const active = list.filter((item) => item.status !== "inactive");
        setProviders(active);
        if (active.length > 0) setChargeProvider(active[0].slug);
      } catch {
        // Mantem o fluxo da tela mesmo sem lista de provedores.
      }
    };
    loadProviders();
  }, []);

  const openCreate = async () => {
    await fetchLookups();
    setEditId(null);
    setForm(EMPTY);
    setErrors({});
    setSaveSuccess(null);
    setModalVisible(true);
  };

  const openEdit = async (inv: Invoice) => {
    if (inv.can_edit === false) {
      setActionError(
        inv.edit_block_reason ??
          "Não é possível editar uma cobrança com boleto ou PIX já gerado."
      );
      return;
    }
    await fetchLookups();
    setEditId(inv.id);
    setForm({
      student_id: String(inv.student?.id ?? ""),
      description: inv.description,
      amount: floatToCurrency(inv.amount),
      due_date: isoToDisplay(inv.due_date),
      enrollment_id: String(inv.enrollment_id ?? ""),
      guardian_id: String(inv.guardian?.id ?? ""),
      status: inv.status,
      payment_method: inv.payment_method ?? "",
      notes: inv.notes ?? "",
    });
    setErrors({});
    setSaveSuccess(null);
    setModalVisible(true);
  };

  const save = async () => {
    const localErrors = validateInvoiceForm(form);
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setSaving(true);
    setErrors({});
    setSaveSuccess(null);
    try {
      const payload: Record<string, any> = {
        student_id: Number(form.student_id),
        description: form.description.trim(),
        amount: currencyToFloat(form.amount),
        due_date: displayToISO(form.due_date),
        status: form.status,
      };
      if (form.enrollment_id) payload.enrollment_id = Number(form.enrollment_id);
      if (form.guardian_id) payload.guardian_id = Number(form.guardian_id);
      if (form.payment_method) payload.payment_method = form.payment_method;
      if (form.notes) payload.notes = form.notes;

      if (editId) {
        await api.put(`/invoices/${editId}`, payload);
      } else {
        await api.post("/invoices", payload);
      }
      setModalVisible(false);
      setSaveSuccess(editId ? "Cobrança atualizada com sucesso." : "Cobrança criada com sucesso.");
      fetch();
      loadSummary();
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiFieldErrors(e));
      } else {
        setActionError(
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Não foi possível salvar a cobrança."
        );
      }
    }
    setSaving(false);
  };

  const onSettlementSuccess = (message?: string) => {
    if (message) setSaveSuccess(message);
    fetch();
    loadSummary();
  };

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
        openEdit(inv);
        break;
      case "cancel":
        setCancelId(inv.id);
        break;
      case "delete":
        setDeleteId(inv.id);
        break;
    }
  };

  const confirmCancelInvoice = async () => {
    if (!cancelId) return;
    setCancelling(true);
    setActionError(null);
    try {
      const invoice = rows.find((row) => row.id === cancelId);
      await api.post(`/invoices/${cancelId}/cancel`, {
        environment: resolveInvoiceGatewayEnvironment(invoice),
      });
      setCancelId(null);
      fetch();
    } catch (e: any) {
      const msg = e.response?.data?.message ?? "Não foi possível cancelar a cobrança.";
      setActionError(msg);
      setCancelId(null);
    }
    setCancelling(false);
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.delete(`/invoices/${deleteId}`);
      setDeleteId(null);
      fetch();
    } catch (e: any) {
      const msg = e.response?.data?.message ?? "Não foi possível excluir a cobrança.";
      setActionError(msg);
      setDeleteId(null);
    }
    setDeleting(false);
  };

  const openChargeModal = (invoice: Invoice) => {
    const normalizedMethod =
      invoice.payment_method === "hybrid"
        ? "hybrid"
      : invoice.payment_method === "bank_slip" || invoice.payment_method === "boleto"
        ? "boleto"
        : "pix";

    setChargeInvoice(invoice);
    setChargeResult(null);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeActionError(
      canGenerateChargeForInvoice(invoice)
        ? null
        : "Não é possível gerar cobrança para uma fatura paga ou cancelada."
    );
    if (!chargeProvider && providers.length > 0) {
      setChargeProvider(providers[0].slug);
    }
    setChargeEnvironment("stage");
    setChargeMethod(normalizedMethod);
    setChargeModalVisible(true);
  };

  const closeChargeModal = () => {
    setChargeModalVisible(false);
    setChargeInvoice(null);
    setChargeResult(null);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeActionError(null);
  };

  const closePreviewModal = () => {
    setPreviewModalVisible(false);
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

  const onGenerateCharge = async () => {
    if (!chargeInvoice || !chargeProvider) return;
    if (!canGenerateChargeForInvoice(chargeInvoice)) {
      setChargeActionError("Não é possível gerar cobrança para uma fatura paga ou cancelada.");
      return;
    }

    setGeneratingCharge(true);
    setChargeStatusResult(null);
    setPaidChargeResult(null);
    setChargeActionError(null);
    try {
      const result = await generateUnifiedCharge(chargeInvoice.id, {
        provider: chargeProvider,
        method: chargeMethod,
        environment: chargeEnvironment,
      });
      setChargeResult(result);
      if (result.payment_url) {
        openPreviewModal(result.payment_url);
      }
      fetch();
    } catch (e: any) {
      setChargeResult(null);
      const message = e?.response?.data?.message ?? "Não foi possível gerar a cobrança.";
      setChargeActionError(message);
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
      const message = e?.response?.data?.message ?? "Não foi possível consultar o status da cobrança.";
      setChargeActionError(message);
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
      const message = e?.response?.data?.message ?? "Não foi possível simular o pagamento da cobrança.";
      setChargeActionError(message);
    }

    setPayingCharge(false);
  };

  const copyPixCode = async () => {
    if (!chargeResult?.pix_copy_paste) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(chargeResult.pix_copy_paste);
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
    return url.toLowerCase().includes(".pdf") || url.toLowerCase().includes("application/pdf");
  };

  const getPdfPreviewWidth = () => {
    if (typeof window === "undefined") return 760;

    return Math.max(280, Math.min(window.innerWidth - 220, 820));
  };

  const studentOptions = students.map((s) => ({ value: String(s.id), label: s.name }));
  const guardianOptions = [
    { value: "", label: "Nenhum" },
    ...guardians.map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const providerSlugs = providers.map((item) => item.slug);
  const chargeMethodOptions = [
    { value: "pix", label: "Pix" },
    { value: "boleto", label: "Boleto" },
    { value: "hybrid", label: "Boleto + PIX" },
  ];
  const allStatusOptions = [{ value: "", label: "Todos" }, ...statusOptions];
  const fmt = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";
  const fmtMoney = (v: string) =>
    parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDateTime = (v: string | null | undefined) => {
    if (!v) return "—";
    return new Date(v).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderInvoiceListState = () => {
    if (loading) {
      return (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      );
    }

    if (rows.length === 0) {
      return (
        <View className="items-center justify-center py-16">
          <Ionicons name="cash-outline" size={40} color="#E5E7EB" />
          <Text className="text-gray-400 mt-3 text-sm">Nenhuma cobrança encontrada</Text>
        </View>
      );
    }

    return null;
  };

  const summaryCards = summary
    ? [
        { label: "Em aberto", value: summary.open.count, amount: summary.open.amount, tone: "amber" },
        { label: "Vencidas", value: summary.overdue.count, amount: summary.overdue.amount, tone: "red" },
        {
          label: "Baixadas no período",
          value: summary.paid_in_period.count,
          amount: summary.paid_in_period.amount,
          tone: "emerald",
        },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View
        className="mb-6"
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View>
          <Text className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-gray-800`}>
            \-Pagamentos
          </Text>
          <Text className="text-sm text-gray-500">
            Cobranças em aberto, baixas manuais e resumo financeiro
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center justify-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova Cobrança</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4 flex-row flex-wrap gap-2">
        {(["open", "paid", "all"] as ListView[]).map((tab) => {
          const active = listView === tab;
          const labels: Record<ListView, string> = {
            open: "Em aberto",
            paid: "Baixadas",
            all: "Todas",
          };
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                setListView(tab);
                setStatusFilter("");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl border ${active ? "bg-violet-600 border-violet-600" : "bg-white border-gray-200"}`}
              style={isMobile ? { flex: 1, alignItems: "center" } : undefined}
              activeOpacity={0.85}
            >
              <Text className={`text-sm font-semibold ${active ? "text-white" : "text-gray-700"}`}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="mb-4 flex-row flex-wrap gap-3">
        {summaryLoading ? (
          <View className="w-full items-center py-4">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : (
          summaryCards.map((card) => (
            <View
              key={card.label}
              className="bg-white rounded-xl border px-4 py-3 flex-1"
              style={{
                minWidth: isMobile ? "100%" : 200,
                maxWidth: isMobile ? "100%" : 280,
                borderColor: SUMMARY_TONES[card.tone]?.border ?? "#E5E7EB",
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  {card.label}
                </Text>
                <View
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SUMMARY_TONES[card.tone]?.text ?? "#6B7280" }}
                />
              </View>
              <Text className="text-2xl font-bold text-gray-900 mt-1">{card.value}</Text>
              <Text
                className="text-sm font-semibold mt-0.5"
                style={{ color: SUMMARY_TONES[card.tone]?.text ?? "#4B5563" }}
              >
                {fmtMoney(card.amount)}
              </Text>
            </View>
          ))
        )}
      </View>

      {summary?.by_payment_method && summary.by_payment_method.length > 0 && listView === "paid" ? (
        <View className="mb-4 bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Baixas por forma de pagamento (período)
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {summary.by_payment_method.map((row) => (
              <View
                key={row.payment_method}
                className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
              >
                <Text className="text-xs font-semibold text-gray-700">
                  {paymentMethodLabel(row.payment_method)}
                </Text>
                <Text className="text-xs text-gray-500">
                  {row.count} · {fmtMoney(row.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="mb-4 flex-row flex-wrap gap-3">
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <FormInput
            label="Buscar"
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Aluno ou descrição"
          />
        </View>
        {listView !== "paid" ? (
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormSelect
              label="Status"
              value={statusFilter}
              options={allStatusOptions}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 200 }}>
          <FormSelect
            label="Forma de pagamento"
            value={paymentMethodFilter}
            options={filterMethodOptions}
            onChange={(v) => {
              setPaymentMethodFilter(v);
              setPage(1);
            }}
          />
        </View>
        {listView === "paid" ? (
          <>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
              <DatePickerInput
                label="Pago de"
                value={paidAtFrom ? isoToDisplay(paidAtFrom) : ""}
                onChangeText={(v) => {
                  setPaidAtFrom(displayToISO(v));
                  setPage(1);
                }}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
              <DatePickerInput
                label="Pago até"
                value={paidAtTo ? isoToDisplay(paidAtTo) : ""}
                onChangeText={(v) => {
                  setPaidAtTo(displayToISO(v));
                  setPage(1);
                }}
              />
            </View>
          </>
        ) : null}
      </View>

      {filterPeriodError ? (
        <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{filterPeriodError}</Text>
        </View>
      ) : null}

      {saveSuccess ? (
        <View className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Text className="text-sm text-emerald-700">{saveSuccess}</Text>
        </View>
      ) : null}

      {isMobile ? (
        <View className="gap-3">
          {renderInvoiceListState()}
          {!loading &&
            rows.map((item) => (
              <View
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 px-3 py-3"
                style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
                      {limitText(item.student?.name, STUDENT_NAME_LIMIT)}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                      {limitText(item.description, DESCRIPTION_LIMIT)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setActionsInvoice(item)}
                    className="w-8 h-8 items-center justify-center bg-gray-100 rounded-lg border border-gray-200"
                    activeOpacity={0.85}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color="#4B5563" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center justify-between mt-3">
                  <Text className="text-base font-bold text-gray-900">{fmtMoney(item.amount)}</Text>
                  <Badge slug={item.status} label={STATUS_LABELS[item.status] ?? item.status} />
                </View>

                <View className="flex-row flex-wrap gap-2 mt-3">
                  <View className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                    <Text className="text-[10px] uppercase font-semibold text-gray-500">
                      {listView === "paid" ? "Pago em" : "Vencimento"}
                    </Text>
                    <Text className="text-xs font-semibold text-gray-700 mt-0.5">
                      {listView === "paid" ? fmtDateTime(item.paid_at) : fmt(item.due_date)}
                    </Text>
                  </View>
                  <View className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                    <Text className="text-[10px] uppercase font-semibold text-gray-500">Forma</Text>
                    <Text className="text-xs font-semibold text-gray-700 mt-0.5">
                      {paymentMethodLabel(item.payment_method)}
                    </Text>
                  </View>
                  {listView === "paid" ? (
                    <View className="rounded-lg bg-gray-50 px-2.5 py-1.5 flex-1 min-w-[140px]">
                      <Text className="text-[10px] uppercase font-semibold text-gray-500">
                        Identificador
                      </Text>
                      <Text className="text-xs font-semibold text-gray-700 mt-0.5" numberOfLines={1}>
                        {item.payment_reference ?? "—"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

          {meta.total > 0 && (
            <View className="bg-white rounded-2xl border border-gray-100 px-3">
              <Pagination
                currentPage={meta.current_page}
                lastPage={meta.last_page}
                total={meta.total}
                perPage={meta.per_page}
                onPageChange={setPage}
              />
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: "100%" }}
          contentContainerStyle={{ width: "100%" }}
        >
          <View
            className="bg-white rounded-2xl overflow-hidden border border-gray-200"
            style={{
              width: "100%",
              minWidth: tableMinWidth ?? (listView === "paid" ? 1160 : 1040),
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View className="flex-row bg-gray-100 border-b border-gray-200 px-3 py-2">
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 1.6 }}>Aluno</Text>
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 1.8 }}>Descrição</Text>
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 0.75 }}>Valor</Text>
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 0.85 }}>
                {listView === "paid" ? "Pago em" : "Vencimento"}
              </Text>
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 0.9 }}>Forma</Text>
              {listView === "paid" ? (
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 1 }}>
                  Identificador
                </Text>
              ) : null}
              <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wide" style={{ flex: 0.65 }}>Status</Text>
              <View style={{ width: 42 }} />
            </View>

            {renderInvoiceListState() ??
              rows.map((item, i) => (
                <View
                  key={item.id}
                  className={`flex-row items-center px-3 py-2 border-b border-gray-100 ${
                    i % 2 === 1 ? "bg-slate-50/70" : "bg-white"
                  }`}
                >
                  <Text
                    className="text-xs font-semibold text-gray-800"
                    style={{ flex: 1.6, paddingRight: 10 }}
                    numberOfLines={1}
                  >
                    {limitText(item.student?.name, STUDENT_NAME_LIMIT)}
                  </Text>
                  <Text
                    className="text-xs text-gray-600"
                    style={{ flex: 1.8, paddingRight: 10 }}
                    numberOfLines={1}
                  >
                    {limitText(item.description, DESCRIPTION_LIMIT)}
                  </Text>
                  <Text className="text-xs font-bold text-gray-800" style={{ flex: 0.75 }}>
                    {fmtMoney(item.amount)}
                  </Text>
                  <Text className="text-xs text-gray-600" style={{ flex: 0.85 }}>
                    {listView === "paid" ? fmtDateTime(item.paid_at) : fmt(item.due_date)}
                  </Text>
                  <Text className="text-xs text-gray-600" style={{ flex: 0.9 }} numberOfLines={1}>
                    {paymentMethodLabel(item.payment_method)}
                  </Text>
                  {listView === "paid" ? (
                    <Text className="text-xs text-gray-600" style={{ flex: 1, paddingRight: 10 }} numberOfLines={1}>
                      {item.payment_reference ?? "—"}
                    </Text>
                  ) : null}
                  <View style={{ flex: 0.65 }}>
                    <Badge slug={item.status} label={STATUS_LABELS[item.status] ?? item.status} />
                  </View>
                  <View style={{ width: 42 }} className="flex-row justify-end">
                    <TouchableOpacity
                      onPress={() => setActionsInvoice(item)}
                      className="p-1.5 bg-gray-100 rounded-lg border border-gray-200"
                      activeOpacity={0.85}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color="#4B5563" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

            {meta.total > 0 && (
              <View className="px-4 border-t border-gray-100">
                <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={modalVisible} title={editId ? "Editar Cobrança" : "Nova Cobrança"} onClose={() => setModalVisible(false)} size="lg"
        footer={
          <>
            <TouchableOpacity onPress={() => setModalVisible(false)} className="px-5 py-2.5 rounded-xl border border-gray-200">
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-violet-600">
              {saving ? <ActivityIndicator color="white" size="small" /> : <Text className="text-sm font-bold text-white">Salvar</Text>}
            </TouchableOpacity>
          </>
        }
      >
        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
            <SearchableSelect
              label="Aluno"
              required
              value={form.student_id}
              options={studentOptions}
              onChange={(v) => setForm({ ...form, student_id: v })}
              error={errors.student_id}
              placeholder="Selecione o aluno"
              modalTitle="Selecionar aluno"
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
            <SearchableSelect
              label="Responsável"
              value={form.guardian_id}
              options={guardianOptions}
              onChange={(v) => setForm({ ...form, guardian_id: v })}
              error={errors.guardian_id}
              placeholder="Opcional"
              modalTitle="Selecionar responsável"
            />
          </View>
        </View>
        <FormInput
          label="Descrição"
          required
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          error={errors.description}
          placeholder="Ex: Mensalidade Março/2026"
        />
        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormInput
              label="Valor"
              required
              value={form.amount}
              onChangeText={(v) => setForm({ ...form, amount: maskCurrency(v) })}
              error={errors.amount}
              placeholder="R$ 0,00"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <DatePickerInput
              label="Vencimento"
              required
              value={form.due_date}
              onChangeText={(v) => setForm({ ...form, due_date: v })}
              error={errors.due_date}
            />
          </View>
        </View>
        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormSelect label="Status" value={form.status} options={statusOptions} onChange={(v) => setForm({ ...form, status: v })} error={errors.status} />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 220 }}>
            <FormSelect label="Forma de Pagamento" value={form.payment_method} options={methodOptions} onChange={(v) => setForm({ ...form, payment_method: v })} error={errors.payment_method} />
          </View>
        </View>
        <FormInput
          label="ID da Matrícula (opcional)"
          value={form.enrollment_id}
          onChangeText={(v) => setForm({ ...form, enrollment_id: v })}
          error={errors.enrollment_id}
          placeholder="Ex: 123"
          valueFormat="integer"
          maxDigits={10}
        />
        <FormInput label="Observações" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} error={errors.notes} placeholder="Observações adicionais" />
      </Modal>

      <Modal
        visible={chargeModalVisible}
        title={chargeInvoice ? `Cobrança #${chargeInvoice.id}` : "Gerar cobrança"}
        onClose={closeChargeModal}
        size="lg"
        footer={
          <>
            <TouchableOpacity onPress={closeChargeModal} className="px-5 py-2.5 rounded-xl border border-gray-200">
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCheckChargeStatus} disabled={checkingStatus || !chargeInvoice} className="px-5 py-2.5 rounded-xl border border-violet-200">
              {checkingStatus ? <ActivityIndicator size="small" color="#7C3AED" /> : <Text className="text-sm font-semibold text-violet-700">Consultar status</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onPayCharge}
              disabled={payingCharge || !chargeInvoice || chargeEnvironment !== "stage"}
              className="px-5 py-2.5 rounded-xl border border-emerald-300"
            >
              {payingCharge ? (
                <ActivityIndicator size="small" color="#059669" />
              ) : (
                <Text className="text-sm font-semibold text-emerald-700">Simular pagamento</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onGenerateCharge}
              disabled={generatingCharge || !chargeInvoice || !chargeProvider || !canGenerateChargeForInvoice(chargeInvoice)}
              className={`px-5 py-2.5 rounded-xl ${canGenerateChargeForInvoice(chargeInvoice) ? "bg-violet-600" : "bg-gray-300"}`}
            >
              {generatingCharge ? <ActivityIndicator color="white" size="small" /> : <Text className="text-sm font-bold text-white">Gerar cobrança</Text>}
            </TouchableOpacity>
          </>
        }
      >
        <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <Text className="text-xs text-gray-600">Contrato unificado: /generate-charge e /charge-status</Text>
          <Text className="text-xs text-gray-500 mt-1">No ambiente stage, use "Simular pagamento" para testar /pay-charge.</Text>
        </View>

        <View className="flex-row gap-4 flex-wrap">
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 260 }}>
            <PaymentProviderSelectField
              label="Provedor"
              required
              value={chargeProvider}
              options={providerSlugs}
              onChange={setChargeProvider}
            />
          </View>
          <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
            <FormSelect
              label="Método"
              required
              value={chargeMethod}
              options={chargeMethodOptions}
              onChange={setChargeMethod}
            />
          </View>
        </View>

        <FormSelect
          label="Ambiente"
          required
          value={chargeEnvironment}
          options={[
            { value: "stage", label: "Ambiente de teste" },
            { value: "prod", label: "Ambiente de produção" },
          ]}
          onChange={(v) => setChargeEnvironment(v === "prod" ? "prod" : "stage")}
        />

        <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-3">
          <Text className="text-xs text-gray-600">
            A cobrança vai usar a credencial do ambiente selecionado no tenant.
          </Text>
          {!!chargeInvoice && !canGenerateChargeForInvoice(chargeInvoice) && (
            <Text className="text-xs text-red-600 mt-2">
              Esta fatura está {STATUS_LABELS[chargeInvoice.status] ?? chargeInvoice.status} e não permite nova geração de cobrança.
            </Text>
          )}
        </View>

        {!!chargeResult && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-3">
            <Text className="text-sm font-semibold text-emerald-700">Cobrança gerada</Text>
            <Text className="text-xs text-emerald-700 mt-1">ID cobrança: {chargeResult.charge_id || "—"}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Ambiente: {chargeResult.environment || chargeEnvironment}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Status: {chargeResult.status || "—"}</Text>
            {!!chargeResult.payment_url && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={() => openPreviewModal(chargeResult.payment_url || null)}
                  className="px-3 py-2 rounded-lg bg-emerald-600 self-start"
                >
                  <Text className="text-xs font-semibold text-white">Visualizar documento</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (typeof window !== "undefined") window.open(chargeResult.payment_url || "", "_blank");
                  }}
                  className="px-3 py-2 rounded-lg border border-emerald-300 self-start"
                >
                  <Text className="text-xs font-semibold text-emerald-700">Abrir em nova aba</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!chargeResult.pix_copy_paste && (
              <TouchableOpacity onPress={copyPixCode} className="mt-2 px-3 py-2 rounded-lg border border-emerald-300 self-start">
                <Text className="text-xs font-semibold text-emerald-700">Copiar Pix copia e cola</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!!chargeStatusResult && (
          <View className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Text className="text-sm font-semibold text-blue-700">Status atualizado</Text>
            <Text className="text-xs text-blue-700 mt-1">Provider: {chargeStatusResult.provider || "—"}</Text>
            <Text className="text-xs text-blue-700 mt-1">Status: {chargeStatusResult.status || "—"}</Text>
            <Text className="text-xs text-blue-700 mt-1">Pago em: {chargeStatusResult.paid_at || "—"}</Text>
          </View>
        )}

        {!!paidChargeResult && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mt-3">
            <Text className="text-sm font-semibold text-emerald-700">Pagamento simulado</Text>
            <Text className="text-xs text-emerald-700 mt-1">Status: {paidChargeResult.status || "—"}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Pago em: {paidChargeResult.paid_at || "—"}</Text>
          </View>
        )}

        {!!chargeActionError && (
          <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mt-3">
            <Text className="text-sm font-semibold text-red-700">Atenção</Text>
            <Text className="text-xs text-red-700 mt-1">{chargeActionError}</Text>
          </View>
        )}
      </Modal>

      <Modal
        visible={previewModalVisible}
        title="Visualização da cobrança"
        onClose={closePreviewModal}
        size="lg"
        footer={
          <>
            <TouchableOpacity onPress={closePreviewModal} className="px-5 py-2.5 rounded-xl border border-gray-200">
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            {!!previewUrl && (
              <TouchableOpacity
                onPress={() => {
                  if (typeof window !== "undefined") window.open(previewUrl, "_blank");
                }}
                className="px-5 py-2.5 rounded-xl bg-violet-600"
              >
                <Text className="text-sm font-bold text-white">Abrir em nova aba</Text>
              </TouchableOpacity>
            )}
          </>
        }
      >
        {!previewUrl ? (
          <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <Text className="text-sm text-gray-600">Nenhum documento disponível para visualização.</Text>
          </View>
        ) : Platform.OS !== "web" ? (
          <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <Text className="text-sm text-gray-700">A visualização embutida está disponível no web.</Text>
            <Text className="text-xs text-gray-500 mt-2">Use "Abrir em nova aba" para ver o documento.</Text>
          </View>
        ) : isImagePreviewUrl(previewUrl) ? (
          <View>
            <Image
              source={{ uri: previewUrl }}
              style={{
                width: "100%",
                height: isMobile ? 420 : 640,
                borderRadius: 16,
                resizeMode: "contain",
                backgroundColor: "#F9FAFB",
              }}
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
                  <View key={`pdf-page-${index + 1}`} style={{ marginBottom: 16 }}>
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
          <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <Text className="text-sm text-gray-700">Esse tipo de documento não suporta preview embutido.</Text>
            <Text className="text-xs text-gray-500 mt-2">Use "Abrir em nova aba" para visualizar o arquivo.</Text>
          </View>
        )}
      </Modal>

      {!!actionError && (
        <View className="mx-4 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm font-semibold text-red-700">{actionError}</Text>
        </View>
      )}
      <ConfirmModal
        visible={!!cancelId}
        title="Cancelar Cobrança"
        message={
          rows.find((i) => i.id === cancelId)?.lifecycle_hint ??
          (rows.find((i) => i.id === cancelId)?.requires_cora_cancel_before_delete
            ? "A cobrança será invalidada no provedor e permanecerá no histórico como cancelada."
            : "Deseja cancelar esta cobrança?")
        }
        onConfirm={confirmCancelInvoice}
        onCancel={() => setCancelId(null)}
        loading={cancelling}
        confirmLabel="Sim, cancelar"
        iconName="close-circle-outline"
        tone="primary"
      />
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
        onSuccess={onSettlementSuccess}
      />

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Cobrança"
        message={
          rows.find((i) => i.id === deleteId)?.delete_block_reason ??
          rows.find((i) => i.id === deleteId)?.lifecycle_hint ??
          "Remove o registro da listagem. Cobranças ativas no provedor devem ser canceladas antes."
        }
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
        confirmDisabled={rows.find((i) => i.id === deleteId)?.can_delete === false}
      />
    </ScrollView>
  );
}
