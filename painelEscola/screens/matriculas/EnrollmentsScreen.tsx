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
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import {
  tableBodyRowClass,
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
} from "../../components/ui/dataTableStyles";
import ConfirmModal from "../../components/ui/ConfirmModal";
import EnrollmentActionsModal, {
  type EnrollmentActionKey,
} from "../../components/matriculas/EnrollmentActionsModal";
import EnrollmentProductCell from "../../components/matriculas/EnrollmentProductCell";
import EnrollmentEditModal from "../../components/matriculas/EnrollmentEditModal";
import {
  enrollmentProductKind,
  enrollmentProductSubtitle,
  enrollmentProductTitle,
} from "../../utils/enrollmentDisplay";
import {
  currencyToFloat,
  displayToISO,
  floatToCurrency,
  isoToDisplay,
  parsePaymentDueDay,
} from "../../utils/masks";
import {
  validateEnrollmentEditForm,
} from "../../utils/enrollmentForm";
import { useEnrollmentStatuses, domainToOptions } from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type {
  EnrollmentEditFormValues,
  EnrollmentSummary,
  EnrollmentsScreenProps,
} from "../../types/matriculas";
import type { CourseOption, SchoolClassRef, StudentRef } from "../../types/entities";

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

const STUDENT_NAME_LIMIT = 32;

const limitText = (value: string | undefined | null, max = STUDENT_NAME_LIMIT) => {
  if (!value) return "—";
  const clean = value.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

export default function EnrollmentsScreen({ navigate }: EnrollmentsScreenProps) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [rows, setRows] = useState<EnrollmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
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
  const [initialEditSchoolClassId, setInitialEditSchoolClassId] = useState("");
  const [financialFieldsLocked, setFinancialFieldsLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lookups for edit modal
  const [students, setStudents] = useState<StudentRef[]>([]);
  const [classes, setClasses] = useState<SchoolClassRef[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View modal
  const [viewVisible, setViewVisible] = useState(false);
  const [viewData, setViewData] = useState<EnrollmentSummary | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  // Menu de ações (⋯)
  const [menuEnrollment, setMenuEnrollment] = useState<EnrollmentSummary | null>(null);

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
      if (courseFilter) params.course_id = Number(courseFilter);
      if (classFilter) params.school_class_id = Number(classFilter);
      const { data } = await api.get("/enrollments", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, statusFilter, search, courseFilter, classFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const fetchLookups = useCallback(async () => {
    try {
      const [sRes, coursesRes, classesRes] = await Promise.all([
        api.get("/students", { params: { per_page: 200 } }),
        api.get("/courses", { params: { per_page: 500, status: "active" } }),
        api.get("/school-classes", { params: { per_page: 500, status: "active" } }),
      ]);
      setStudents(sRes.data.data ?? []);
      setCourses(
        (coursesRes.data.data ?? [])
          .filter((item: { id?: number; name?: string }) => item?.id && item?.name)
          .map((item: { id: number; name: string }) => ({ id: Number(item.id), name: item.name }))
      );
      setClasses(classesRes.data.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  const classOptions = classes.filter((schoolClass) => {
    if (!courseFilter) return true;
    const courseId = schoolClass.course?.id;
    return courseId != null && String(courseId) === courseFilter;
  });

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setCourseFilter("");
    setClassFilter("");
    setPage(1);
  };

  const hasActiveFilters =
    !!search.trim() || !!statusFilter || !!courseFilter || !!classFilter;

  const filterSelectStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 14,
    color: "#374151",
    backgroundColor: "white",
    height: 44,
    minWidth: isMobile ? "100%" : 160,
    flexGrow: isMobile ? 1 : 0,
  } as const;

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
        monthly_amount: floatToCurrency(detail.monthly_amount),
        discount_amount: floatToCurrency(detail.discount_amount ?? 0),
        payment_due_day: detail.payment_due_day ? String(detail.payment_due_day) : "",
      });
      setInitialEditSchoolClassId(
        String(detail.school_class?.id ?? row.school_class?.id ?? "")
      );
    } catch {
      setEditVisible(false);
      setEditId(null);
    }
  };

  const handleEnrollmentAction = (action: EnrollmentActionKey) => {
    const row = menuEnrollment;
    if (!row) return;
    if (action === "detail") {
      navigate("matriculas-detail", { enrollmentId: row.id });
      return;
    }
    if (action === "view") {
      openView(row.id);
      return;
    }
    if (action === "edit") {
      openEdit(row);
      return;
    }
    if (action === "delete") {
      setDeleteId(row.id);
    }
  };

  const saveEdit = async () => {
    const clientErrors = validateEnrollmentEditForm(editForm, {
      financialLocked: financialFieldsLocked,
    });
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
      if (!financialFieldsLocked) {
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

  const formatCurrency = (v: string | null | undefined) =>
    v
      ? `R$ ${parseFloat(v).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
        })}`
      : "—";

  const renderProductBadge = (item: EnrollmentSummary) => {
    const isBundle = enrollmentProductKind(item) === "bundle";
    return (
      <View
        className={`self-start rounded-md px-1.5 py-0.5 ${
          isBundle ? "bg-violet-100" : "bg-sky-100"
        }`}
      >
        <Text
          className={`text-[10px] font-bold uppercase ${
            isBundle ? "text-violet-700" : "text-sky-700"
          }`}
        >
          {isBundle ? "Pacote" : "Plano"}
        </Text>
      </View>
    );
  };

  const renderEnrollmentCard = (item: EnrollmentSummary) => {
    const subtitle = enrollmentProductSubtitle(item);

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => navigate("matriculas-detail", { enrollmentId: item.id })}
        activeOpacity={0.86}
        className="bg-white rounded-2xl border border-gray-200 p-4"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
        }}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text className="text-sm font-bold text-gray-900" numberOfLines={2}>
              {item.student?.name ?? "—"}
            </Text>
            <Text className="text-xs font-semibold text-gray-500 mt-1" numberOfLines={1}>
              {item.enrollment_number ?? "—"}
            </Text>
          </View>
          <Badge slug={item.status} label={STATUS_LABELS[item.status] ?? item.status} />
        </View>

        <View className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
          {renderProductBadge(item)}
          <Text className="text-sm font-bold text-gray-900 mt-1" numberOfLines={1}>
            {enrollmentProductTitle(item)}
          </Text>
          {!!subtitle && (
            <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>

        <View className="flex-row gap-2 mt-3">
          <View className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <Text className="text-[11px] font-semibold uppercase text-gray-400">Início</Text>
            <Text className="text-sm font-semibold text-gray-800 mt-0.5">
              {fmt(item.start_date)}
            </Text>
          </View>
          <View className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <Text className="text-[11px] font-semibold uppercase text-gray-400">Mensalidade</Text>
            <Text className="text-sm font-semibold text-gray-800 mt-0.5" numberOfLines={1}>
              {formatCurrency(item.monthly_amount)}
            </Text>
          </View>
        </View>

        <View className="flex-row justify-end gap-2 mt-3">
          <TouchableOpacity
            onPress={(event: any) => {
              event?.stopPropagation?.();
              navigate("matriculas-detail", { enrollmentId: item.id });
            }}
            className="h-9 px-3 rounded-lg bg-violet-50 border border-violet-100 flex-row items-center justify-center"
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={15} color="#7C3AED" />
            <Text className="text-xs font-bold text-violet-700 ml-1.5">Detalhes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(event: any) => {
              event?.stopPropagation?.();
              setMenuEnrollment(item);
            }}
            className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 items-center justify-center"
            activeOpacity={0.85}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color="#4B5563" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

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
          style={{ justifyContent: "center", width: isMobile ? "100%" : undefined }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Nova Matrícula
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Filtros
          </Text>
          {hasActiveFilters ? (
            <TouchableOpacity
              onPress={clearFilters}
              className="px-2 py-1 rounded-lg bg-gray-100"
              activeOpacity={0.8}
            >
              <Text className="text-xs font-semibold text-gray-600">Limpar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="flex-row gap-2" style={{ flexWrap: "wrap" as any }}>
          <View
            className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3"
            style={{ height: 44, minWidth: isMobile ? "100%" : 220, flexGrow: 1 }}
          >
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <input
              placeholder="Aluno ou matrícula..."
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
            {!!search.trim() ? (
              <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <select
            value={courseFilter}
            onChange={(e: any) => {
              setCourseFilter(e.target.value);
              setClassFilter("");
              setPage(1);
            }}
            style={{ ...filterSelectStyle, minWidth: isMobile ? "100%" : 200 }}
          >
            <option value="">Todos os cursos</option>
            {courses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.name}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e: any) => {
              setClassFilter(e.target.value);
              setPage(1);
            }}
            style={{ ...filterSelectStyle, minWidth: isMobile ? "100%" : 200 }}
          >
            <option value="">Todas as turmas</option>
            {classOptions.map((schoolClass) => (
              <option key={schoolClass.id} value={String(schoolClass.id)}>
                {schoolClass.course?.name
                  ? `${schoolClass.name} · ${schoolClass.course.name}`
                  : schoolClass.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e: any) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ ...filterSelectStyle, minWidth: isMobile ? "100%" : 160 }}
          >
            {statusFilterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </View>
      </View>

      {/* List */}
      {isMobile ? (
        <View className="gap-3">
          {loading ? (
            <View className="items-center justify-center py-16 bg-white rounded-2xl border border-gray-200">
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center justify-center py-14 bg-white rounded-2xl border border-gray-200">
              <Ionicons name="clipboard-outline" size={40} color="#E5E7EB" />
              <Text className="text-gray-400 mt-3 text-sm">
                Nenhuma matrícula encontrada
              </Text>
            </View>
          ) : (
            rows.map(renderEnrollmentCard)
          )}

          {meta.total > 0 && (
            <View className="bg-white rounded-2xl border border-gray-200 px-4">
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
            minWidth: 980,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View className={TABLE_HEADER_ROW}>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.55 }}>
              Aluno
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1.65 }}>
              Curso / Pacote
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.85 }}>
              Nº Matrícula
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7 }}>
              Início
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.8 }}>
              Mensalidade
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 0.65 }}>
              Status
            </Text>
            <View style={{ width: 42 }} />
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
                className={tableBodyRowClass(i)}
              >
                <Text
                  className={TABLE_CELL_SEMIBOLD}
                  style={{ flex: 1.55, paddingRight: 10 }}
                  numberOfLines={1}
                >
                  {limitText(item.student?.name)}
                </Text>
                <EnrollmentProductCell item={item} compact flex={1.65} />
                <Text className={TABLE_CELL_MUTED} style={{ flex: 0.85 }}>
                  {item.enrollment_number ?? "—"}
                </Text>
                <Text className={TABLE_CELL_MUTED} style={{ flex: 0.7 }}>
                  {fmt(item.start_date)}
                </Text>
                <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 0.8 }}>
                  {formatCurrency(item.monthly_amount)}
                </Text>
                <View style={{ flex: 0.65 }}>
                  <Badge
                    slug={item.status}
                    label={STATUS_LABELS[item.status] ?? item.status}
                  />
                </View>
                <View style={{ width: 42 }} className="flex-row justify-end">
                  <TouchableOpacity
                    onPress={() => setMenuEnrollment(item)}
                    className="p-1.5 bg-gray-100 rounded-lg border border-gray-200"
                    activeOpacity={0.85}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color="#4B5563" />
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
      )}

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

            {/* Curso / Pacote */}
            <View className="bg-gray-50 rounded-xl px-4 py-3 gap-1">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                {enrollmentProductKind(viewData) === "bundle" ? "Pacote" : "Curso / Plano"}
              </Text>
              <Text className="text-sm font-semibold text-gray-800">
                {enrollmentProductTitle(viewData)}
              </Text>
              {enrollmentProductSubtitle(viewData) ? (
                <Text className="text-xs text-gray-500">{enrollmentProductSubtitle(viewData)}</Text>
              ) : null}
              {viewData.bundle?.cycle_label && (
                <Text className="text-xs text-gray-500">
                  Cobrança {viewData.bundle.cycle_label.toLowerCase()}
                </Text>
              )}
              {viewData.course_plan && enrollmentProductKind(viewData) !== "bundle" && (
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

      <EnrollmentEditModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        onSubmit={saveEdit}
        saving={saving}
        financialFieldsLocked={financialFieldsLocked}
        form={editForm}
        setForm={setEditForm}
        errors={editErrors}
        statusOptions={statusOptions}
        classes={classes}
        initialSchoolClassId={initialEditSchoolClassId}
      />

      <EnrollmentActionsModal
        visible={!!menuEnrollment}
        enrollment={menuEnrollment}
        onClose={() => setMenuEnrollment(null)}
        onSelect={handleEnrollmentAction}
      />

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
