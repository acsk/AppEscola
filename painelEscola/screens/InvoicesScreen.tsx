import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { parseApiErrors } from "../utils/apiErrors";
import Modal from "../components/ui/Modal";
import FormInput from "../components/ui/FormInput";
import FormSelect from "../components/ui/FormSelect";
import Badge from "../components/ui/Badge";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  ChargeStatusResponse,
  GeneratedCharge,
  PaymentProvider,
  generateUnifiedCharge,
  getUnifiedChargeStatus,
  listPaymentProviders,
} from "../services/payments";
import {
  useInvoiceStatuses,
  usePaymentMethods,
  domainToOptions,
} from "../hooks/useDomains";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

type Student = { id: number; name: string };
type Guardian = { id: number; name: string };

type Invoice = {
  id: number;
  description: string;
  amount: string;
  due_date: string;
  status: string;
  payment_method: string | null;
  notes: string | null;
  student?: Student;
  guardian?: Guardian;
  enrollment_id: number | null;
};

type Form = {
  student_id: string;
  description: string;
  amount: string;
  due_date: string;
  enrollment_id: string;
  guardian_id: string;
  status: string;
  payment_method: string;
  notes: string;
};

const EMPTY: Form = {
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

const METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  credit_card: "Cartão Crédito",
  debit_card: "Cartão Débito",
  bank_slip: "Boleto",
  bank_transfer: "Transferência",
};

export default function InvoicesScreen() {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [chargeModalVisible, setChargeModalVisible] = useState(false);
  const [chargeInvoice, setChargeInvoice] = useState<Invoice | null>(null);
  const [chargeProvider, setChargeProvider] = useState("");
  const [chargeEnvironment, setChargeEnvironment] = useState<"stage" | "prod">("stage");
  const [chargeMethod, setChargeMethod] = useState("pix");
  const [generatingCharge, setGeneratingCharge] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [chargeResult, setChargeResult] = useState<GeneratedCharge | null>(null);
  const [chargeStatusResult, setChargeStatusResult] = useState<ChargeStatusResponse | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);

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
      label: METHOD_LABELS[o.value] ?? o.label,
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
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/invoices", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

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
    setModalVisible(true);
  };

  const openEdit = async (inv: Invoice) => {
    await fetchLookups();
    setEditId(inv.id);
    setForm({
      student_id: String(inv.student?.id ?? ""),
      description: inv.description,
      amount: inv.amount,
      due_date: inv.due_date,
      enrollment_id: String(inv.enrollment_id ?? ""),
      guardian_id: String(inv.guardian?.id ?? ""),
      status: inv.status,
      payment_method: inv.payment_method ?? "",
      notes: inv.notes ?? "",
    });
    setErrors({});
    setModalVisible(true);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, any> = {
        student_id: Number(form.student_id),
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
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
      fetch();
    } catch (e: any) {
      if (e.response?.status === 422) {
        const errs: Record<string, string> = {};
        Object.entries(e.response.data.errors ?? {}).forEach(([k, v]) => {
          errs[k] = Array.isArray(v) ? (v[0] as string) : (v as string);
        });
        setErrors(errs);
      }
    }
    setSaving(false);
  };

  const markAsPaid = async (id: number) => {
    try { await api.post(`/invoices/${id}/mark-as-paid`); fetch(); } catch {}
  };

  const cancelInvoice = async (id: number) => {
    try { await api.post(`/invoices/${id}/cancel`); fetch(); } catch {}
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await api.delete(`/invoices/${deleteId}`); setDeleteId(null); fetch(); } catch {}
    setDeleting(false);
  };

  const openChargeModal = (invoice: Invoice) => {
    setChargeInvoice(invoice);
    setChargeResult(null);
    setChargeStatusResult(null);
    if (!chargeProvider && providers.length > 0) {
      setChargeProvider(providers[0].slug);
    }
    setChargeEnvironment("stage");
    setChargeMethod(invoice.payment_method || "pix");
    setChargeModalVisible(true);
  };

  const closeChargeModal = () => {
    setChargeModalVisible(false);
    setChargeInvoice(null);
    setChargeResult(null);
    setChargeStatusResult(null);
  };

  const onGenerateCharge = async () => {
    if (!chargeInvoice || !chargeProvider) return;
    setGeneratingCharge(true);
    setChargeStatusResult(null);
    try {
      const result = await generateUnifiedCharge(chargeInvoice.id, {
        provider: chargeProvider,
        method: chargeMethod,
        environment: chargeEnvironment,
      });
      setChargeResult(result);
      fetch();
    } catch {
      setChargeResult(null);
    }
    setGeneratingCharge(false);
  };

  const onCheckChargeStatus = async () => {
    if (!chargeInvoice) return;
    setCheckingStatus(true);
    try {
      const result = await getUnifiedChargeStatus(chargeInvoice.id);
      setChargeStatusResult(result);
      fetch();
    } catch {
      setChargeStatusResult(null);
    }
    setCheckingStatus(false);
  };

  const copyPixCode = async () => {
    if (!chargeResult?.pix_copy_paste) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(chargeResult.pix_copy_paste);
    }
  };

  const studentOptions = [
    { value: "", label: "Selecione o aluno" },
    ...students.map((s) => ({ value: String(s.id), label: s.name })),
  ];
  const guardianOptions = [
    { value: "", label: "Nenhum" },
    ...guardians.map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const providerOptions = providers.map((item) => ({ value: item.slug, label: item.name }));
  const chargeMethodOptions = [
    { value: "pix", label: "Pix" },
    { value: "boleto", label: "Boleto" },
    { value: "credit_card", label: "Cartão Crédito" },
    { value: "debit_card", label: "Cartão Débito" },
    { value: "bank_transfer", label: "Transferência" },
  ];
  const allStatusOptions = [{ value: "", label: "Todos" }, ...statusOptions];
  const fmt = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Cobranças</Text>
          <Text className="text-sm text-gray-500">Faturas e mensalidades</Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl" activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova Cobrança</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "0 14px", fontSize: 14, color: "#374151", backgroundColor: "white", height: 44, minWidth: isMobile ? "100%" : 180 }}>
          {allStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View className="bg-white rounded-2xl overflow-hidden" style={{ width: "100%", minWidth: tableMinWidth, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Aluno</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Descrição</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Valor</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Vencimento</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Pagamento</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Status</Text>
          <View style={{ width: 152 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20"><ActivityIndicator size="large" color="#7C3AED" /></View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="cash-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">Nenhuma cobrança encontrada</Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <View key={item.id} className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
              <Text className="text-sm font-medium text-gray-800" style={{ flex: 2 }}>{item.student?.name ?? "—"}</Text>
              <Text className="text-sm text-gray-600" style={{ flex: 2 }} numberOfLines={1}>{item.description}</Text>
              <Text className="text-sm font-semibold text-gray-800" style={{ flex: 1 }}>
                R$ {parseFloat(item.amount).toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>{fmt(item.due_date)}</Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {item.payment_method ? (METHOD_LABELS[item.payment_method] ?? item.payment_method) : "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Badge slug={item.status} label={STATUS_LABELS[item.status] ?? item.status} />
              </View>
              <View style={{ width: 152 }} className="flex-row justify-end gap-1">
                {item.status === "pending" || item.status === "overdue" ? (
                  <TouchableOpacity onPress={() => markAsPaid(item.id)} className="p-1.5 bg-green-50 rounded-lg" style={{ marginRight: 2 }}>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#22C55E" />
                  </TouchableOpacity>
                ) : null}
                {item.status !== "cancelled" && item.status !== "paid" ? (
                  <TouchableOpacity onPress={() => cancelInvoice(item.id)} className="p-1.5 bg-orange-50 rounded-lg" style={{ marginRight: 2 }}>
                    <Ionicons name="close-circle-outline" size={15} color="#F97316" />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => openEdit(item)} className="p-1.5 bg-violet-50 rounded-lg" style={{ marginRight: 2 }}>
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openChargeModal(item)} className="p-1.5 bg-blue-50 rounded-lg" style={{ marginRight: 2 }}>
                  <Ionicons name="qr-code-outline" size={15} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteId(item.id)} className="p-1.5 bg-red-50 rounded-lg">
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-gray-100">
            <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPageChange={setPage} />
          </View>
        )}
      </View>
      </ScrollView>

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
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect label="Aluno" required value={form.student_id} options={studentOptions} onChange={(v) => setForm({ ...form, student_id: v })} error={errors.student_id} />
          </View>
          <View className="flex-1">
            <FormSelect label="Responsável" value={form.guardian_id} options={guardianOptions} onChange={(v) => setForm({ ...form, guardian_id: v })} error={errors.guardian_id} />
          </View>
        </View>
        <FormInput label="Descrição" required value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} error={errors.description} placeholder="Ex: Mensalidade Março/2026" />
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput label="Valor (R$)" required value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} error={errors.amount} placeholder="0.00" keyboardType="decimal-pad" />
          </View>
          <View className="flex-1">
            <FormInput label="Vencimento" required value={form.due_date} onChangeText={(v) => setForm({ ...form, due_date: v })} error={errors.due_date} placeholder="AAAA-MM-DD" />
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect label="Status" value={form.status} options={statusOptions} onChange={(v) => setForm({ ...form, status: v })} error={errors.status} />
          </View>
          <View className="flex-1">
            <FormSelect label="Forma de Pagamento" value={form.payment_method} options={methodOptions} onChange={(v) => setForm({ ...form, payment_method: v })} error={errors.payment_method} />
          </View>
        </View>
        <FormInput label="ID da Matrícula (opcional)" value={form.enrollment_id} onChangeText={(v) => setForm({ ...form, enrollment_id: v })} error={errors.enrollment_id} placeholder="ID numérico" keyboardType="numeric" />
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
            <TouchableOpacity onPress={onGenerateCharge} disabled={generatingCharge || !chargeInvoice || !chargeProvider} className="px-5 py-2.5 rounded-xl bg-violet-600">
              {generatingCharge ? <ActivityIndicator color="white" size="small" /> : <Text className="text-sm font-bold text-white">Gerar cobrança</Text>}
            </TouchableOpacity>
          </>
        }
      >
        <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <Text className="text-xs text-gray-600">Contrato unificado: /generate-charge e /charge-status</Text>
          <Text className="text-xs text-gray-500 mt-1">Fallback legado Cora ativo durante transição.</Text>
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect
              label="Provedor"
              required
              value={chargeProvider}
              options={providerOptions}
              onChange={setChargeProvider}
            />
          </View>
          <View className="flex-1">
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
        </View>

        {!!chargeResult && (
          <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-3">
            <Text className="text-sm font-semibold text-emerald-700">Cobrança gerada</Text>
            <Text className="text-xs text-emerald-700 mt-1">ID cobrança: {chargeResult.charge_id || "—"}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Ambiente: {chargeResult.environment || chargeEnvironment}</Text>
            <Text className="text-xs text-emerald-700 mt-1">Status: {chargeResult.status || "—"}</Text>
            {!!chargeResult.payment_url && (
              <TouchableOpacity
                onPress={() => {
                  if (typeof window !== "undefined") window.open(chargeResult.payment_url || "", "_blank");
                }}
                className="mt-2 px-3 py-2 rounded-lg bg-emerald-600 self-start"
              >
                <Text className="text-xs font-semibold text-white">Abrir URL de pagamento</Text>
              </TouchableOpacity>
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
      </Modal>

      <ConfirmModal visible={!!deleteId} title="Excluir Cobrança" message="Esta ação não pode ser desfeita." onConfirm={remove} onCancel={() => setDeleteId(null)} loading={deleting} />
    </ScrollView>
  );
}
