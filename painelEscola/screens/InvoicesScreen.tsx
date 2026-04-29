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
  useInvoiceStatuses,
  usePaymentMethods,
  domainToOptions,
} from "../hooks/useDomains";

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

  const studentOptions = [
    { value: "", label: "Selecione o aluno" },
    ...students.map((s) => ({ value: String(s.id), label: s.name })),
  ];
  const guardianOptions = [
    { value: "", label: "Nenhum" },
    ...guardians.map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const allStatusOptions = [{ value: "", label: "Todos" }, ...statusOptions];
  const fmt = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-800">Cobranças</Text>
          <Text className="text-sm text-gray-500">Faturas e mensalidades</Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl" activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova Cobrança</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row gap-3 mb-4">
        <select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "0 14px", fontSize: 14, color: "#374151", backgroundColor: "white", height: 44, minWidth: 180 }}>
          {allStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </View>

      <View className="bg-white rounded-2xl overflow-hidden" style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Aluno</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>Descrição</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Valor</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Vencimento</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Pagamento</Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 1 }}>Status</Text>
          <View style={{ width: 120 }} />
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
              <View style={{ width: 120 }} className="flex-row justify-end gap-1">
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

      <ConfirmModal visible={!!deleteId} title="Excluir Cobrança" message="Esta ação não pode ser desfeita." onConfirm={remove} onCancel={() => setDeleteId(null)} loading={deleting} />
    </ScrollView>
  );
}
