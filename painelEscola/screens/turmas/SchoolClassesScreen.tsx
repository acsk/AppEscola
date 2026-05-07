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
  friday: "Sex",
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
          <Text className="text-2xl font-bold text-gray-800">Turmas</Text>
          <Text className="text-sm text-gray-500">
            Turmas, períodos e horários
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("turmas-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Nova Turma
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Filtros
          </Text>
          <TouchableOpacity onPress={clearFilters} className="px-2 py-1 rounded-lg bg-gray-100" activeOpacity={0.8}>
            <Text className="text-xs font-semibold text-gray-600">Limpar</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2" style={{ flexWrap: "wrap" as any }}>
          <View
            className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3"
            style={{ height: 44, minWidth: isMobile ? "100%" : 220, flexGrow: 1 }}
          >
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
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
                color: "#374151",
                marginLeft: 8,
                backgroundColor: "transparent",
              }}
            />
            {!!search && (
              <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
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
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "0 14px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "#F9FAFB",
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
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "0 14px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "#F9FAFB",
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
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "0 14px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "#F9FAFB",
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
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "0 14px",
              fontSize: 14,
              color: "#374151",
              backgroundColor: "#F9FAFB",
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
      <ScrollView horizontal showsHorizontalScrollIndicator={isMobile}>
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{
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
            Turma
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Curso
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Ano / Período
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Horários
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Status
          </Text>
          <View style={{ width: 176 }} />
        </View>

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="grid-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">
              Nenhuma turma encontrada
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
              <View style={{ flex: 2 }}>
                <Text className="text-sm font-medium text-gray-800">
                  {item.name}
                </Text>
                {(item.start_date || item.end_date) && (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(item.start_date) ?? "?"} – {fmtDate(item.end_date) ?? "?"}
                  </Text>
                )}
              </View>
              <Text className="text-sm text-gray-600" style={{ flex: 2 }}>
                {item.course?.name ?? "—"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text className="text-sm text-gray-700 font-medium">
                  {item.year ?? "—"}
                </Text>
                {item.period && (
                  <Text className="text-xs text-gray-400">
                    {periodMap[item.period] ?? item.period}
                  </Text>
                )}
              </View>
              <View style={{ flex: 2 }} className="flex-row flex-wrap gap-1">
                {(item.schedules ?? []).length === 0 ? (
                  <Text className="text-xs text-gray-400 italic">
                    Sem horários
                  </Text>
                ) : (
                  (item.schedules ?? []).map((s) => (
                    <View
                      key={s.id}
                      className="bg-violet-50 rounded-md px-1.5 py-0.5"
                    >
                      <Text className="text-xs text-violet-600 font-medium">
                        {WEEKDAY_SHORT[s.weekday] ?? s.weekday}{" "}
                        {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
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
                  className="flex-row items-center px-2.5 py-1.5 bg-emerald-50 rounded-lg gap-1"
                >
                  <Ionicons name="checkmark-done-outline" size={15} color="#059669" />
                  <Text className="text-xs font-semibold text-emerald-700">
                    Frequência
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigate("turmas-form", { classId: item.id })
                  }
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

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Turma"
        message="Esta ação não pode ser desfeita. Os horários vinculados também serão removidos."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
