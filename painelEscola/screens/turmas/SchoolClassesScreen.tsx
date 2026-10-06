import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { usePeriods, domainToOptions } from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

type Schedule = {
  id: number;
  weekday: string;
  start_time: string;
  end_time: string;
  room: string | null;
};

type SchoolClass = {
  id: number;
  name: string;
  year: number | null;
  period: string | null;
  capacity: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  course?: { id: number; name: string };
  schedules?: Schedule[];
};

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sext",
  saturday: "Sáb",
  sunday: "Dom",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchoolClassesScreen({ navigate }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const [rows, setRows] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [courses, setCourses] = useState<Array<{ id: number; name: string }>>([]);

  const periods = usePeriods();
  const periodMap = Object.fromEntries(
    domainToOptions(periods).map((o) => [o.value, o.label])
  );
  const periodOptions = domainToOptions(periods);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => String(currentYear + 1 - i));
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", { params: { per_page: 500 } });
      const list = Array.isArray(data?.data) ? data.data : [];
      setCourses(
        list
          .filter((item: any) => item?.id && item?.name)
          .map((item: any) => ({ id: Number(item.id), name: item.name }))
      );
    } catch {
      setCourses([]);
    }
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search.trim()) params.search = search.trim();
      if (courseFilter) params.course_id = Number(courseFilter);
      if (yearFilter) params.year = Number(yearFilter);
      if (periodFilter) params.period = periodFilter;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/school-classes", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, courseFilter, yearFilter, periodFilter, statusFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const clearFilters = () => {
    setSearch("");
    setCourseFilter("");
    setYearFilter("");
    setPeriodFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/school-classes/${deleteId}`);
      setDeleteId(null);
      fetchRows();
    } catch {}
    setDeleting(false);
  };

  const fmtTime = (t: string) => t.slice(0, 5);
  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

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
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Turmas</Text>
          <Text className="text-sm text-ink-muted">
            Turmas, períodos e horários
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("turmas-form")}
          className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
          <Text className="text-on-brand font-medium text-sm ml-1.5">
            Nova turma
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View className="bg-surface border border-border rounded-ds-md p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Filtros
          </Text>
          <TouchableOpacity onPress={clearFilters} className="px-2 py-1 rounded-ds-md bg-surface-sunken" activeOpacity={0.8}>
            <Text className="text-xs font-semibold text-ink-muted">Limpar</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2" style={{ flexWrap: "wrap" as any }}>
          <View
            className="flex-row items-center bg-surface-sunken border border-border rounded-ds-md px-3"
            style={{ height: 44, minWidth: isMobile ? "100%" : 220, flexGrow: 1 }}
          >
            <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
            <input
              placeholder="Turma"
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
            {!!search && (
              <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
              </TouchableOpacity>
            )}
          </View>

          <select
            value={courseFilter}
            onChange={(e: any) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            style={{
              border: "1px solid #D9DDE3",
              borderRadius: 4,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--ds-ink)",
              backgroundColor: "var(--ds-surface-sunken)",
              height: 44,
              minWidth: isMobile ? "100%" : 200,
            }}
          >
            <option value="">Curso</option>
            {courses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.name}
              </option>
            ))}
          </select>

          <select
            value={yearFilter}
            onChange={(e: any) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            style={{
              border: "1px solid #D9DDE3",
              borderRadius: 4,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--ds-ink)",
              backgroundColor: "var(--ds-surface-sunken)",
              height: 44,
              minWidth: isMobile ? "100%" : 120,
            }}
          >
            <option value="">Ano</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <select
            value={periodFilter}
            onChange={(e: any) => {
              setPeriodFilter(e.target.value);
              setPage(1);
            }}
            style={{
              border: "1px solid #D9DDE3",
              borderRadius: 4,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--ds-ink)",
              backgroundColor: "var(--ds-surface-sunken)",
              height: 44,
              minWidth: isMobile ? "100%" : 150,
            }}
          >
            <option value="">Período</option>
            {periodOptions.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e: any) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              border: "1px solid #D9DDE3",
              borderRadius: 4,
              padding: "0 14px",
              fontSize: 14,
              color: "var(--ds-ink)",
              backgroundColor: "var(--ds-surface-sunken)",
              height: 44,
              minWidth: isMobile ? "100%" : 140,
            }}
          >
            <option value="">Status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </View>
      </View>

      {/* Table */}
      <ScrollView
        horizontal={!isMobile}
        showsHorizontalScrollIndicator={!isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: "100%" }}
      >
      <View
        className={isMobile ? "gap-3" : "bg-surface rounded-ds-md overflow-hidden"}
        style={{
          width: "100%",
          minWidth: isMobile ? undefined : tableMinWidth,
          elevation: isMobile ? undefined : 2,
        }}
      >
        {!isMobile && (
          <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
              Turma
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
              Curso
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>
              Ano / Período
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 2 }}>
              Horários
            </Text>
            <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>
              Status
            </Text>
            <View style={{ width: 176 }} />
          </View>
        )}

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="var(--ds-brand)" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="grid-outline" size={40} color="var(--ds-border)" />
            <Text className="text-ink-subtle mt-3 text-sm">
              Nenhuma turma encontrada
            </Text>
          </View>
        ) : (
          rows.map((item, i) => {
            const rowContent = isMobile ? (
                <>
                  <View className="flex-row items-start justify-between gap-3">
                    <View style={{ flex: 1 }}>
                      <Text className="text-sm font-semibold text-ink">{item.name}</Text>
                      <Text className="text-xs text-ink-muted mt-0.5">{item.course?.name ?? "Sem curso"}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity onPress={() => navigate("turmas-frequencia", { classId: item.id })} className="p-1.5 bg-success-tint rounded-ds-md">
                        <Ionicons name="checkmark-done-outline" size={15} color="var(--ds-success)" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigate("turmas-form", { classId: item.id })} className="p-1.5 bg-brand-tint rounded-ds-md">
                        <Ionicons name="pencil-outline" size={15} color="var(--ds-brand)" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDeleteId(item.id)} className="p-1.5 bg-danger rounded-ds-md">
                        <Ionicons name="trash-outline" size={15} color="var(--ds-on-danger)" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                    <Text className="text-xs text-ink-muted">Ano: {item.year ?? "—"}</Text>
                    <Text className="text-xs text-ink-muted">Período: {item.period ? periodMap[item.period] ?? item.period : "—"}</Text>
                    {(item.start_date || item.end_date) && (
                      <Text className="text-xs text-ink-muted">
                        Datas: {fmtDate(item.start_date) ?? "?"} - {fmtDate(item.end_date) ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {(item.schedules ?? []).length === 0 ? (
                      <Text className="text-xs text-ink-subtle italic">Sem horários</Text>
                    ) : (
                      (item.schedules ?? []).map((s) => (
                        <View key={s.id} className="bg-brand-tint rounded-ds-md px-1.5 py-0.5">
                          <Text className="text-xs text-brand font-medium">
                            {WEEKDAY_SHORT[s.weekday] ?? s.weekday} {fmtTime(s.start_time)}-{fmtTime(s.end_time)}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                  <View className="mt-2 self-start">
                    <Badge slug={item.status} label={item.status === "active" ? "Ativo" : "Inativo"} />
                  </View>
                </>
              ) : (
                <>
              <View style={{ flex: 2 }}>
                <Text className="text-xs font-medium text-ink">
                  {item.name}
                </Text>
                {(item.start_date || item.end_date) && (
                  <Text className="text-[11px] text-ink-subtle mt-0.5">
                    {fmtDate(item.start_date) ?? "?"} - {fmtDate(item.end_date) ?? "?"}
                  </Text>
                )}
              </View>
              <Text className="text-xs text-ink-muted" style={{ flex: 2 }}>
                {item.course?.name ?? "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text className="text-xs text-ink font-medium">
                  {item.year ?? "—"}
                </Text>
                {item.period && (
                  <Text className="text-[11px] text-ink-subtle">
                    {periodMap[item.period] ?? item.period}
                  </Text>
                )}
              </View>
              <View style={{ flex: 2 }} className="flex-row flex-wrap gap-1">
                {(item.schedules ?? []).length === 0 ? (
                  <Text className="text-xs text-ink-subtle italic">
                    Sem horários
                  </Text>
                ) : (
                  (item.schedules ?? []).map((s) => (
                    <View
                      key={s.id}
                      className="bg-brand-tint rounded-ds-md px-1.5 py-0.5"
                    >
                      <Text className="text-xs text-brand font-medium">
                        {WEEKDAY_SHORT[s.weekday] ?? s.weekday}{" "}
                        {fmtTime(s.start_time)}-{fmtTime(s.end_time)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Badge
                  slug={item.status}
                  label={item.status === "active" ? "Ativo" : "Inativo"}
                />
              </View>
              <View
                style={{ width: 176 }}
                className="flex-row justify-end gap-2"
              >
                <TouchableOpacity
                  onPress={() => navigate("turmas-frequencia", { classId: item.id })}
                  className="flex-row items-center px-2.5 py-1.5 bg-success-tint rounded-ds-md gap-1"
                >
                  <Ionicons name="checkmark-done-outline" size={15} color="var(--ds-success)" />
                  <Text className="text-xs font-semibold text-success">
                    Frequência
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigate("turmas-form", { classId: item.id })
                  }
                  className="p-1.5 bg-brand-tint rounded-ds-md"
                >
                  <Ionicons name="pencil-outline" size={15} color="var(--ds-brand)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(item.id)}
                  className="p-1.5 bg-danger rounded-ds-md"
                >
                  <Ionicons name="trash-outline" size={15} color="var(--ds-on-danger)" />
                </TouchableOpacity>
              </View>
                </>
              );

            if (isMobile) {
              return (
                <View
                  key={item.id}
                  className="bg-surface border border-border rounded-ds-md p-3"
                  style={{
                  }}
                >
                  {rowContent}
                </View>
              );
            }

            return (
              <DataTableRow key={item.id} index={i}>
                {rowContent}
              </DataTableRow>
            );
          })
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

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir turma"
        message="Esta ação não pode ser desfeita. Os horários vinculados também serão removidos."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
