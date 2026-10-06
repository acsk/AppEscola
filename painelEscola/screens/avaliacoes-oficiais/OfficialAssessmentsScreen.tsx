import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import OfficialAssessmentActionsModal, {
  type OfficialAssessmentActionKey,
} from "../../components/avaliacoes-oficiais/OfficialAssessmentActionsModal";
import { showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type { OfficialAssessmentListItem, OfficialAssessmentsScreenProps } from "../../types/avaliacoesOficiais";
import type { CourseOption, SchoolClassRef } from "../../types/entities";

const KIND_LABELS: Record<string, string> = {
  presencial_bimestral: "Bimestral",
  presencial_recuperacao: "Recuperação",
  presencial_diagnostico: "Diagnóstico",
  presencial_final: "Final",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicada",
};

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

export default function OfficialAssessmentsScreen({ navigate }: OfficialAssessmentsScreenProps) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OfficialAssessmentListItem[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [classes, setClasses] = useState<SchoolClassRef[]>([]);
  const [error, setError] = useState("");
  const [menuAssessment, setMenuAssessment] = useState<OfficialAssessmentListItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    type: "success" as "success" | "error",
    message: "",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const filterSelectStyle = {
    border: "1px solid #D9DDE3",
    borderRadius: 4,
    padding: "0 14px",
    fontSize: 14,
    color: "var(--ds-ink)",
    backgroundColor: "var(--ds-surface)",
    height: 44,
    minWidth: isMobile ? "100%" : 160,
    flexGrow: isMobile ? 1 : 0,
  } as const;

  const loadLookups = useCallback(async () => {
    try {
      const [coursesRes, classesRes] = await Promise.all([
        api.get("/courses", { params: { per_page: 500, status: "active" } }),
        api.get("/school-classes", { params: { per_page: 500, status: "active" } }),
      ]);
      setCourses(
        (coursesRes.data.data ?? [])
          .filter((item: { id?: number; name?: string }) => item?.id && item?.name)
          .map((item: { id: number; name: string }) => ({ id: Number(item.id), name: item.name }))
      );
      setClasses(classesRes.data.data ?? []);
    } catch {
      setCourses([]);
      setClasses([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, any> = { page };
      if (statusFilter) params.status = statusFilter;
      if (classFilter) params.school_class_id = classFilter;
      if (search.trim()) params.search = search.trim();
      const fromIso = dateFrom.trim();
      const toIso = dateTo.trim();
      if (fromIso) params.assessment_date_from = fromIso;
      if (toIso) params.assessment_date_to = toIso;

      const { data } = await api.get("/official-assessments", { params });
      const list = Array.isArray(data?.data) ? data.data : [];
      setRows(list);
      setMeta({
        current_page: Number(data?.meta?.current_page ?? 1),
        last_page: Number(data?.meta?.last_page ?? 1),
        per_page: Number(data?.meta?.per_page ?? 20),
        total: Number(data?.meta?.total ?? list.length),
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || "Não foi possível carregar as avaliações.");
      setRows([]);
      setMeta({
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, classFilter, courseFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    load();
  }, [load]);

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
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters =
    !!search.trim() ||
    !!statusFilter ||
    !!courseFilter ||
    !!classFilter ||
    !!dateFrom.trim() ||
    !!dateTo.trim();

  const fmt = (v: string | null | undefined) =>
    v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  const openForm = (assessmentId: number | null) => {
    navigate("avaliacoes-oficiais-form", { assessmentId });
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/official-assessments/${deleteId}`);
      setDeleteId(null);
      showApiToast(setToast, data, "Avaliação removida com sucesso.");
      load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível excluir a avaliação.");
    }
    setDeleting(false);
  };

  const handleAssessmentAction = (action: OfficialAssessmentActionKey) => {
    const row = menuAssessment;
    if (!row) return;
    if (action === "open") {
      openForm(row.id);
      return;
    }
    if (action === "delete") {
      setDeleteId(row.id);
    }
  };

  const renderMenuButton = (row: OfficialAssessmentListItem, stopPropagation = false) => (
    <TouchableOpacity
      onPress={(event: { stopPropagation?: () => void }) => {
        if (stopPropagation) event?.stopPropagation?.();
        setMenuAssessment(row);
      }}
      className="p-1.5 bg-surface-sunken rounded-ds-md border border-border"
      activeOpacity={0.85}
      accessibilityLabel="Ações da avaliação"
    >
      <Ionicons name="ellipsis-horizontal" size={16} color="var(--ds-ink-muted)" />
    </TouchableOpacity>
  );

  const renderKindBadge = (kind: string) => (
    <View className="self-start rounded-ds-md px-1.5 py-0.5 bg-brand-tint">
      <Text className="text-[10px] font-semibold uppercase text-brand">{kindLabel(kind)}</Text>
    </View>
  );

  const renderAssessmentCard = (row: OfficialAssessmentListItem) => (
    <TouchableOpacity
      key={row.id}
      onPress={() => setMenuAssessment(row)}
      activeOpacity={0.86}
      className="bg-surface rounded-ds-md border border-border p-4"
      style={{
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
            {row.title}
          </Text>
          <Text className="text-xs font-semibold text-ink-muted mt-1" numberOfLines={1}>
            Turma: {row.school_class?.name ?? "—"} • {kindLabel(row.kind)}
          </Text>
        </View>
        <Badge slug={row.status} label={STATUS_LABELS[row.status] ?? row.status} />
      </View>

      <View className="mt-3 rounded-ds-md bg-surface-sunken border border-border px-3 py-2.5">
        {renderKindBadge(row.kind)}
        {row.counts_towards_report_card ? (
          <Text className="text-[11px] text-success font-semibold mt-1">
            Conta no boletim
          </Text>
        ) : (
          <Text className="text-[11px] text-ink-subtle mt-1">Não conta no boletim</Text>
        )}
      </View>

      <View className="flex-row gap-2 mt-3">
        <View className="flex-1 rounded-ds-md bg-surface-sunken border border-border px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase text-ink-subtle">Data</Text>
          <Text className="text-sm font-semibold text-ink mt-0.5">{fmt(row.assessment_date)}</Text>
        </View>
        <View className="flex-1 rounded-ds-md bg-surface-sunken border border-border px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase text-ink-subtle">Notas</Text>
          <Text className="text-sm font-semibold text-ink mt-0.5">
            {row.grades_count ?? 0} lançada{(row.grades_count ?? 0) === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-end gap-2 mt-3">
        {renderMenuButton(row, true)}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
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
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Avaliações presenciais</Text>
          <Text className="text-sm text-ink-muted">
            Lançamento de notas oficiais para boletim
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => openForm(null)}
          className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
          style={{ justifyContent: "center", width: isMobile ? "100%" : undefined }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium text-sm ml-1.5">Nova avaliação</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-surface border border-border rounded-ds-md p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filtros</Text>
          {hasActiveFilters ? (
            <TouchableOpacity
              onPress={clearFilters}
              className="px-2 py-1 rounded-ds-md bg-surface-sunken"
              activeOpacity={0.8}
            >
              <Text className="text-xs font-semibold text-ink-muted">Limpar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="flex-row gap-2" style={{ flexWrap: "wrap" as any }}>
          <View
            className="flex-row items-center bg-surface-sunken border border-border rounded-ds-md px-3"
            style={{ height: 44, minWidth: isMobile ? "100%" : 220, flexGrow: 1 }}
          >
            <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
            <input
              placeholder="Título da avaliação..."
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
                color: "var(--ds-ink)",
                marginLeft: 8,
                backgroundColor: "transparent",
              }}
            />
            {!!search.trim() ? (
              <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
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
            <option value="">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="published">Publicada</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e: any) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            title="Data inicial"
            style={{ ...filterSelectStyle, minWidth: isMobile ? "100%" : 150 }}
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e: any) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            title="Data final"
            style={{ ...filterSelectStyle, minWidth: isMobile ? "100%" : 150 }}
          />
        </View>
      </View>

      {error ? (
        <View className="mb-4 rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      {isMobile ? (
        <View className="gap-3">
          {loading ? (
            <View className="items-center justify-center py-16 bg-surface rounded-ds-md border border-border">
              <ActivityIndicator size="large" color="var(--ds-brand)" />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center justify-center py-14 bg-surface rounded-ds-md border border-border">
              <Ionicons name="school-outline" size={40} color="var(--ds-border)" />
              <Text className="text-ink-subtle mt-3 text-sm text-center px-6">
                Nenhuma avaliação encontrada
              </Text>
            </View>
          ) : (
            rows.map(renderAssessmentCard)
          )}

          {meta.total > 0 && (
            <View className="bg-surface rounded-ds-md border border-border px-4">
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
            className="bg-surface rounded-ds-md overflow-hidden border border-border"
            style={{
              width: "100%",
              minWidth: 920,
            }}
          >
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.75 }}>
                Título
              </Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1.1 }}>
                Turma
              </Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.85 }}>
                Tipo
              </Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7 }}>
                Data
              </Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.55, textAlign: "center" }}>
                Notas
              </Text>
              <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7 }}>
                Status
              </Text>
              <View style={{ width: 42 }} />
            </View>

            {loading ? (
              <View className="items-center justify-center py-20">
                <ActivityIndicator size="large" color="var(--ds-brand)" />
              </View>
            ) : rows.length === 0 ? (
              <View className="items-center justify-center py-16">
                <Ionicons name="school-outline" size={40} color="var(--ds-border)" />
                <Text className="text-ink-subtle mt-3 text-sm">Nenhuma avaliação encontrada</Text>
              </View>
            ) : (
              rows.map((row, i) => (
                <DataTableRow key={row.id} index={i} onPress={() => setMenuAssessment(row)}>
                  <View style={{ flex: 1.75, paddingRight: 10, minWidth: 0 }}>
                    <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                      {kindLabel(row.kind)}
                    </Text>
                  </View>
                  <Text
                    className={TABLE_CELL_MUTED}
                    style={{ flex: 1.1, paddingRight: 8 }}
                    numberOfLines={1}
                  >
                    {row.school_class?.name ?? "—"}
                  </Text>
                  <View style={{ flex: 0.85 }}>{renderKindBadge(row.kind)}</View>
                  <Text className={TABLE_CELL_MUTED} style={{ flex: 0.7 }}>
                    {fmt(row.assessment_date)}
                  </Text>
                  <Text
                    className={TABLE_CELL_SEMIBOLD}
                    style={{ flex: 0.55, textAlign: "center" }}
                  >
                    {row.grades_count ?? 0}
                  </Text>
                  <View style={{ flex: 0.7 }}>
                    <Badge slug={row.status} label={STATUS_LABELS[row.status] ?? row.status} />
                  </View>
                  <View style={{ width: 42 }} className="flex-row justify-end">
                    {renderMenuButton(row, true)}
                  </View>
                </DataTableRow>
              ))
            )}

            {meta.total > 0 && (
              <View className="px-4 border-t border-border">
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
      <OfficialAssessmentActionsModal
        visible={!!menuAssessment}
        assessment={menuAssessment}
        kindLabel={kindLabel}
        statusLabel={(s) => STATUS_LABELS[s] ?? s}
        onClose={() => setMenuAssessment(null)}
        onSelect={handleAssessmentAction}
      />

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir avaliação"
        message="Esta ação não pode ser desfeita. O rascunho e as notas lançadas serão removidos."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </ScrollView>
  );
}
