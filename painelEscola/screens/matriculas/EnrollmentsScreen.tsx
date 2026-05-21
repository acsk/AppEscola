import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import Modal from "../../components/ui/Modal";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { isoToDisplay } from "../../utils/masks";
import { useEnrollmentStatuses, domainToOptions } from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type {
  EnrollmentEditFormValues,
  EnrollmentSummary,
  EnrollmentsScreenProps,
} from "../../types/matriculas";

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

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  cancelled: "Cancelado",
  concluded: "Concluído",
};

export default function EnrollmentsScreen({ navigate }: EnrollmentsScreenProps) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<EnrollmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  // Edit modal
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EnrollmentEditFormValues>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editVisible, setEditVisible] = useState(false);
  const [financialFieldsLocked, setFinancialFieldsLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lookups for edit modal
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View modal
  const [viewVisible, setViewVisible] = useState(false);
  const [viewData, setViewData] = useState<EnrollmentSummary | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  const enrollmentStatuses = useEnrollmentStatuses();
  const statusOptions = domainToOptions(enrollmentStatuses).map((o) => ({
    ...o,
    label: STATUS_LABELS[o.value] ?? o.label,
  }));

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/enrollments", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

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

  const openView = async (id: number) => {
    setLoadingView(true);
    setViewVisible(true);
    setViewData(null);
    try {
      const { data } = await api.get(`/enrollments/${id}`);
      setViewData(data.data ?? data);
    } catch {}
    setLoadingView(false);
  };

  const openEdit = async (row: EnrollmentSummary) => {
    setEditId(row.id);
    setEditErrors({});
    setEditVisible(true);
    setFinancialFieldsLocked(false);
    try {
      const { data } = await api.get(`/enrollments/${row.id}`);
      const detail: EnrollmentSummary = data.data ?? data;
      setFinancialFieldsLocked(!!detail.financial_fields_locked);
      setEditForm({
        student_id: String(detail.student?.id ?? row.student?.id ?? ""),
        school_class_id: String(detail.school_class?.id ?? row.school_class?.id ?? ""),
        start_date: isoToDisplay(detail.start_date ?? ""),
        end_date: isoToDisplay(detail.end_date ?? ""),
        status: detail.status,
        monthly_amount: detail.monthly_amount ?? "",
        discount_amount: detail.discount_amount ?? "",
        payment_due_day: String(detail.payment_due_day ?? ""),
      });
    } catch {
      setEditVisible(false);
      setEditId(null);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    setEditErrors({});
    try {
      const payload: Record<string, any> = { status: editForm.status };
      if (!financialFieldsLocked) {
        payload.start_date = editForm.start_date;
        if (editForm.end_date) payload.end_date = editForm.end_date;
        if (editForm.monthly_amount !== "") {
          payload.monthly_amount =
            parseFloat(editForm.monthly_amount.replace(",", ".")) || 0;
        }
        payload.discount_amount =
          parseFloat((editForm.discount_amount || "0").replace(",", ".")) || 0;
      }
      if (editForm.payment_due_day) {
        payload.payment_due_day = Number(editForm.payment_due_day);
      }

      await api.put(`/enrollments/${editId}`, payload);
      setEditVisible(false);
      fetchRows();
    } catch (e: any) {
      if (e.response?.status === 422) {
        setEditErrors(parseApiErrors(e.response.data.errors ?? {}));
      }
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/enrollments/${deleteId}`);
      setDeleteId(null);
      fetchRows();
    } catch {}
    setDeleting(false);
  };

  const statusFilterOptions = [
    { value: "", label: "Todos os status" },
    ...statusOptions,
  ];

  const fmt = (v: string | null) =>
    v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Matrículas</Text>
          <Text className="text-sm text-gray-500">
            Gerencie as matrículas de alunos em turmas
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("matriculas-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Nova Matrícula
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <View style={{ flex: 1, maxWidth: isMobile ? undefined : 320 }}>
          <View
            className="flex-row items-center bg-white rounded-xl border border-gray-200 px-3"
            style={{ height: 44 }}
          >
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <input
              placeholder="Buscar aluno..."
              value={search}
              onChange={(e: any) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "#374151",
                marginLeft: 8,
                backgroundColor: "transparent",
              }}
            />
          </View>
        </View>
        <select
          value={statusFilter}
          onChange={(e: any) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: "0 14px",
            fontSize: 14,
            color: "#374151",
            backgroundColor: "white",
            height: 44,
            minWidth: isMobile ? "100%" : 180,
          }}
        >
          {statusFilterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </View>

      {/* Table */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          width: "100%",
          minWidth: tableMinWidth,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Aluno
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Turma
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Nº Matrícula
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Início
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Mensalidade
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Status
          </Text>
          <View style={{ width: 96 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="clipboard-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">
              Nenhuma matrícula encontrada
            </Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <View
              key={item.id}
              className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${
                i % 2 === 1 ? "bg-gray-50/40" : ""
              }`}
            >
              <Text
                className="text-sm font-medium text-gray-800"
                style={{ flex: 2 }}
              >
                {item.student?.name ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 2 }}>
                {item.school_class?.name ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {item.enrollment_number ?? "—"}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {fmt(item.start_date)}
              </Text>
              <Text className="text-sm text-gray-600" style={{ flex: 1 }}>
                {item.monthly_amount
                  ? `R$ ${parseFloat(item.monthly_amount).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}`
                  : "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Badge
                  slug={item.status}
                  label={STATUS_LABELS[item.status] ?? item.status}
                />
              </View>
              <View
                style={{ width: 96 }}
                className="flex-row justify-end gap-2"
              >
                <TouchableOpacity
                  onPress={() => navigate("matriculas-detail", { enrollmentId: item.id })}
                  className="p-1.5 bg-blue-50 rounded-lg"
                >
                  <Ionicons name="eye-outline" size={15} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  className="p-1.5 bg-violet-50 rounded-lg"
                >
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(item.id)}
                  className="p-1.5 bg-red-50 rounded-lg"
                >
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {meta.total > 0 && (
          <View className="px-4 border-t border-gray-100">
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
      </ScrollView>

      {/* View Modal */}
      <Modal
        visible={viewVisible}
        title="Detalhes da Matrícula"
        onClose={() => setViewVisible(false)}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={() => setViewVisible(false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            {viewData && (
              <TouchableOpacity
                onPress={() => { setViewVisible(false); openEdit(viewData); }}
                className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
              >
                <Ionicons name="pencil-outline" size={14} color="white" />
                <Text className="text-sm font-bold text-white">Editar</Text>
              </TouchableOpacity>
            )}
          </>
        }
      >
        {loadingView ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : viewData ? (
          <View className="gap-5">
            {/* Número e status */}
            <View className="flex-row items-center justify-between bg-violet-50 rounded-xl px-4 py-3">
              <View>
                <Text className="text-xs text-violet-400 font-medium uppercase tracking-wide mb-0.5">Nº Matrícula</Text>
                <Text className="text-xl font-bold text-violet-700 tracking-widest">
                  {viewData.enrollment_number ?? "—"}
                </Text>
              </View>
              <Badge slug={viewData.status} label={STATUS_LABELS[viewData.status] ?? viewData.status} />
            </View>

            {/* Aluno */}
            <View className="bg-gray-50 rounded-xl px-4 py-3 gap-1">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Aluno</Text>
              <Text className="text-sm font-semibold text-gray-800">{viewData.student?.name ?? "—"}</Text>
              {viewData.student?.enrollment_number && (
                <Text className="text-xs text-gray-500">Matr.: {viewData.student.enrollment_number}</Text>
              )}
              {viewData.guardian && (
                <Text className="text-xs text-gray-500">Responsável: {viewData.guardian.name}</Text>
              )}
            </View>

            {/* Turma e Curso */}
            <View className="bg-gray-50 rounded-xl px-4 py-3 gap-1">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Turma / Curso</Text>
              <Text className="text-sm font-semibold text-gray-800">{viewData.school_class?.name ?? "—"}</Text>
              {viewData.school_class?.course && (
                <Text className="text-xs text-gray-500">{viewData.school_class.course.name}</Text>
              )}
              {viewData.course_plan && (
                <Text className="text-xs text-gray-500">
                  Plano: {viewData.course_plan.name} • {viewData.course_plan.cycle_label}
                </Text>
              )}
            </View>

            {/* Datas */}
            <View className="flex-row gap-3">
              <View className="flex-1 bg-gray-50 rounded-xl px-4 py-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Início</Text>
                <Text className="text-sm font-semibold text-gray-800">{fmt(viewData.start_date)}</Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-xl px-4 py-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Término</Text>
                <Text className="text-sm font-semibold text-gray-800">{fmt(viewData.end_date ?? null)}</Text>
              </View>
            </View>

            {/* Financeiro */}
            <View className="bg-gray-50 rounded-xl px-4 py-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Financeiro</Text>
              <View className="gap-2">
                {[
                  { label: "Mensalidade", value: viewData.monthly_amount ? `R$ ${parseFloat(viewData.monthly_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                  { label: "Desconto", value: viewData.discount_amount && parseFloat(viewData.discount_amount) > 0 ? `R$ ${parseFloat(viewData.discount_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                  { label: "Dia de vencimento", value: viewData.payment_due_day ? `Dia ${viewData.payment_due_day}` : "—" },
                ].map((row) => (
                  <View key={row.label} className="flex-row justify-between items-center">
                    <Text className="text-sm text-gray-500">{row.label}</Text>
                    <Text className="text-sm font-semibold text-gray-800">{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {viewData.created_at && (
              <Text className="text-xs text-gray-400 text-right">
                Criado em {fmt(viewData.created_at.slice(0, 10))}
              </Text>
            )}
          </View>
        ) : (
          <View className="items-center py-10">
            <Text className="text-sm text-gray-400">Não foi possível carregar os dados.</Text>
          </View>
        )}
      </Modal>

      {/* Edit Modal */}
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
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
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
        {financialFieldsLocked && (
          <View className="flex-row items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
            <Ionicons name="lock-closed-outline" size={14} color="#D97706" />
            <Text className="text-xs text-amber-800 flex-1">
              Datas, mensalidade e desconto estão bloqueados porque já existem cobranças baixadas nesta matrícula.
            </Text>
          </View>
        )}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <DatePickerInput
              label="Data de Início"
              required
              value={editForm.start_date}
              onChangeText={(v) => setEditForm({ ...editForm, start_date: v })}
              error={editErrors.start_date}
              disabled={financialFieldsLocked}
            />
          </View>
          <View className="flex-1">
            <DatePickerInput
              label="Data de Término"
              value={editForm.end_date}
              onChangeText={(v) => setEditForm({ ...editForm, end_date: v })}
              error={editErrors.end_date}
              disabled={financialFieldsLocked}
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
              onChangeText={(v) =>
                setEditForm({ ...editForm, payment_due_day: v })
              }
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
              onChangeText={(v) =>
                setEditForm({ ...editForm, monthly_amount: v })
              }
              error={editErrors.monthly_amount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!financialFieldsLocked}
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Desconto (R$)"
              value={editForm.discount_amount}
              onChangeText={(v) =>
                setEditForm({ ...editForm, discount_amount: v })
              }
              error={editErrors.discount_amount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!financialFieldsLocked}
            />
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Matrícula"
        message="Esta ação não pode ser desfeita."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
