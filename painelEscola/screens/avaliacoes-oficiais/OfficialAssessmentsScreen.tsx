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

const formatSubjectsLabel = (row: OfficialAssessmentListItem): string => {
  const names = (row.subjects ?? []).map((s) => s.name).filter(Boolean);
  if (names.length > 0) {
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  }
  return row.subject?.name ?? "Multidisciplinar";
};

export default function OfficialAssessmentsScreen({ navigate }: OfficialAssessmentsScreenProps) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OfficialAssessmentListItem[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [classes, setClasses] = useState<SchoolClassRef[]>([]);
  const [error, setError] = useState("");
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

  const renderKindBadge = (kind: string) => (
    <View className="self-start rounded-md px-1.5 py-0.5 bg-violet-100">
      <Text className="text-[10px] font-bold uppercase text-violet-700">{kindLabel(kind)}</Text>
    </View>
  );

  const renderAssessmentCard = (row: OfficialAssessmentListItem) => (
    <TouchableOpacity
      key={row.id}
      onPress={() => openForm(row.id)}
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
            {row.title}
          </Text>
          <Text className="text-xs font-semibold text-gray-500 mt-1" numberOfLines={1}>
            {row.school_class?.name ?? "—"}
            {` · ${formatSubjectsLabel(row)}`}
          </Text>
        </View>
        <Badge slug={row.status} label={STATUS_LABELS[row.status] ?? row.status} />
      </View>

      <View className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
        {renderKindBadge(row.kind)}
        {row.counts_towards_report_card ? (
          <Text className="text-[11px] text-emerald-600 font-semibold mt-1">
            Conta no boletim
          </Text>
        ) : (
          <Text className="text-[11px] text-gray-400 mt-1">Não conta no boletim</Text>
        )}
      </View>

      <View className="flex-row gap-2 mt-3">
        <View className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase text-gray-400">Data</Text>
          <Text className="text-sm font-semibold text-gray-800 mt-0.5">{fmt(row.assessment_date)}</Text>
        </View>
        <View className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase text-gray-400">Notas</Text>
          <Text className="text-sm font-semibold text-gray-800 mt-0.5">
            {row.grades_count ?? 0} lançada{(row.grades_count ?? 0) === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-end gap-2 mt-3">
        <TouchableOpacity
          onPress={(event: any) => {
            event?.stopPropagation?.();
            openForm(row.id);
          }}
          className="h-9 px-3 rounded-lg bg-violet-50 border border-violet-100 flex-row items-center justify-center"
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={15} color="#7C3AED" />
          <Text className="text-xs font-bold text-violet-700 ml-1.5">
            {row.status === "published" ? "Ver notas" : "Lançar notas"}
          </Text>
        </TouchableOpacity>
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
          <Text className="text-2xl font-bold text-gray-800">Avaliações presenciais</Text>
          <Text className="text-sm text-gray-500">
            Lançamento de notas oficiais para boletim
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => openForm(null)}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          style={{ justifyContent: "center", width: isMobile ? "100%" : undefined }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Nova avaliação</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filtros</Text>
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
        <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{error}</Text>
        </View>
      ) : null}

      {isMobile ? (
        <View className="gap-3">
          {loading ? (
            <View className="items-center justify-center py-16 bg-white rounded-2xl border border-gray-200">
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center justify-center py-14 bg-white rounded-2xl border border-gray-200">
              <Ionicons name="school-outline" size={40} color="#E5E7EB" />
              <Text className="text-gray-400 mt-3 text-sm text-center px-6">
                Nenhuma avaliação encontrada
              </Text>
            </View>
          ) : (
            rows.map(renderAssessmentCard)
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
              minWidth: 920,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View className="flex-row bg-gray-100 border-b border-gray-200 px-3 py-2">
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 1.75 }}
              >
                Título
              </Text>
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 1.1 }}
              >
                Turma
              </Text>
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 0.85 }}
              >
                Tipo
              </Text>
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 0.7 }}
              >
                Data
              </Text>
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 0.55, textAlign: "center" }}
              >
                Notas
              </Text>
              <Text
                className="text-[11px] font-bold text-gray-600 uppercase tracking-wide"
                style={{ flex: 0.7 }}
              >
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
                <Ionicons name="school-outline" size={40} color="#E5E7EB" />
                <Text className="text-gray-400 mt-3 text-sm">Nenhuma avaliação encontrada</Text>
              </View>
            ) : (
              rows.map((row, i) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => openForm(row.id)}
                  activeOpacity={0.85}
                  className={`flex-row items-center px-3 py-2 border-b border-gray-100 ${
                    i % 2 === 1 ? "bg-slate-50/70" : "bg-white"
                  }`}
                >
                  <View style={{ flex: 1.75, paddingRight: 10, minWidth: 0 }}>
                    <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                      {formatSubjectsLabel(row)}
                    </Text>
                  </View>
                  <Text
                    className="text-xs text-gray-600"
                    style={{ flex: 1.1, paddingRight: 8 }}
                    numberOfLines={1}
                  >
                    {row.school_class?.name ?? "—"}
                  </Text>
                  <View style={{ flex: 0.85 }}>{renderKindBadge(row.kind)}</View>
                  <Text className="text-xs text-gray-600" style={{ flex: 0.7 }}>
                    {fmt(row.assessment_date)}
                  </Text>
                  <Text
                    className="text-xs font-semibold text-gray-700"
                    style={{ flex: 0.55, textAlign: "center" }}
                  >
                    {row.grades_count ?? 0}
                  </Text>
                  <View style={{ flex: 0.7 }}>
                    <Badge slug={row.status} label={STATUS_LABELS[row.status] ?? row.status} />
                  </View>
                  <View style={{ width: 42 }} className="flex-row justify-end">
                    <TouchableOpacity
                      onPress={(event: any) => {
                        event?.stopPropagation?.();
                        openForm(row.id);
                      }}
                      className="p-1.5 bg-gray-100 rounded-lg border border-gray-200"
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chevron-forward" size={16} color="#4B5563" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
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
    </ScrollView>
  );
}
