import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Pagination from "../../components/ui/Pagination";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { domainToOptions, usePeriods, useWeekdays } from "../../hooks/useDomains";
import GridPdfExportButton, { PdfGroup } from "../../components/ui/GridPdfExportButton";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

type SchoolClassOption = {
  id: number;
  name: string;
};

type CourseOption = {
  id: number;
  name: string;
};

type ReportRow = {
  school_class_id: number;
  school_class_name: string;
  course_name: string | null;
  school_class_period: string | null;
  class_weekdays: string | null;
  student_id: number;
  student_name: string;
  enrollment_number: string | null;
  enrollment_status: string;
};

type StudentRow = {
  aluno: string;
  matricula: string;
  status: string;
};

type ReportGroup = {
  school_class_id: number;
  turma: string;
  periodo: string;
  dias_semana: string;
  curso: string;
  students: StudentRow[];
};

type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

const initialMeta: PaginationMeta = {
  current_page: 1,
  last_page: 1,
  per_page: 20,
  total: 0,
};

const toSafeNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    active: "Ativa",
    pending: "Pendente",
    cancelled: "Cancelada",
    completed: "Concluída",
  };
  return map[status] ?? status;
};

const buildGroupsFromRows = (
  rows: ReportRow[],
  periodLabelMap: Record<string, string>,
  formatWeekdays: (value: string | null) => string
): ReportGroup[] => {
  const map = new Map<number, ReportGroup>();

  rows.forEach((row) => {
    const classId = row.school_class_id;
    if (!map.has(classId)) {
      map.set(classId, {
        school_class_id: classId,
        turma: row.school_class_name ?? "-",
        periodo: row.school_class_period
          ? (periodLabelMap[row.school_class_period] ?? row.school_class_period)
          : "-",
        dias_semana: formatWeekdays(row.class_weekdays),
        curso: row.course_name ?? "-",
        students: [],
      });
    }

    map.get(classId)?.students.push({
      aluno: row.student_name ?? "-",
      matricula: row.enrollment_number ?? "-",
      status: statusLabel(row.enrollment_status),
    });
  });

  return Array.from(map.values());
};

export default function ClassStudentsReportScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [classOptions, setClassOptions] = useState<SchoolClassOption[]>([]);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [schoolClassId, setSchoolClassId] = useState("");
  const [period, setPeriod] = useState("");
  const [weekday, setWeekday] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const periods = usePeriods();
  const weekdays = useWeekdays();

  const periodOptions = domainToOptions(periods);
  const weekdayOptions = domainToOptions(weekdays);
  const periodLabelMap = Object.fromEntries(periodOptions.map((o) => [o.value, o.label]));
  const weekdayLabelMap = Object.fromEntries(weekdayOptions.map((o) => [o.value, o.label]));
  const COLUMN_WIDTHS = {
    turma: 230,
    periodo: 140,
    dias: 220,
    curso: 200,
    aluno: 260,
    matricula: 160,
    status: 130,
  } as const;
  const fixedTableWidth =
    schoolClassId
      ? COLUMN_WIDTHS.aluno + COLUMN_WIDTHS.matricula + COLUMN_WIDTHS.status
      : COLUMN_WIDTHS.turma +
        COLUMN_WIDTHS.periodo +
        COLUMN_WIDTHS.dias +
        COLUMN_WIDTHS.curso +
        COLUMN_WIDTHS.aluno +
        COLUMN_WIDTHS.matricula +
        COLUMN_WIDTHS.status;

  const formatWeekdays = useCallback(
    (value: string | null) => {
      if (!value) return "-";
      return value
        .split(",")
        .map((slug) => weekdayLabelMap[slug] ?? slug)
        .join(", ");
    },
    [weekdayLabelMap]
  );

  const fetchClassOptions = useCallback(async () => {
    try {
      const params: Record<string, any> = { per_page: 500 };
      if (courseId) params.course_id = Number(courseId);

      const { data } = await api.get("/school-classes", { params });
      const list = Array.isArray(data?.data) ? data.data : [];
      setClassOptions(
        list
          .filter((item: any) => Number(item?.id) > 0)
          .map((item: any) => ({ id: Number(item.id), name: String(item.name ?? `Turma #${item.id}`) }))
      );
    } catch {
      setClassOptions([]);
    }
  }, [courseId]);

  const fetchCourseOptions = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", { params: { per_page: 500, status: "active" } });
      const list = Array.isArray(data?.data) ? data.data : [];
      setCourseOptions(
        list
          .filter((item: any) => Number(item?.id) > 0 && (item?.name ?? "").toString().trim() !== "")
          .map((item: any) => ({ id: Number(item.id), name: String(item.name) }))
      );
    } catch {
      setCourseOptions([]);
    }
  }, []);

  const buildReportParams = useCallback(
    (pageNumber: number, perPage = 20) => {
      const params: Record<string, any> = { page: pageNumber, per_page: perPage };
      if (search.trim()) params.search = search.trim();
      if (courseId) params.course_id = Number(courseId);
      if (schoolClassId) params.school_class_id = Number(schoolClassId);
      if (period) params.period = period;
      if (weekday) params.weekday = weekday;
      return params;
    },
    [courseId, period, schoolClassId, search, weekday]
  );

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/class-students", { params: buildReportParams(page, 20) });
      const body = data?.body ?? {};
      const metaPayload = body?.meta ?? data?.meta ?? {};
      setRows(Array.isArray(body?.items) ? body.items : []);
      setMeta({
        current_page: Math.max(1, toSafeNumber(metaPayload?.current_page, 1)),
        last_page: Math.max(1, toSafeNumber(metaPayload?.last_page, 1)),
        per_page: Math.max(1, toSafeNumber(metaPayload?.per_page, 20)),
        total: Math.max(0, toSafeNumber(metaPayload?.total, 0)),
      });
    } catch {
      setRows([]);
      setMeta(initialMeta);
    } finally {
      setLoading(false);
    }
  }, [buildReportParams, page]);

  const fetchAllRowsForExport = useCallback(async (): Promise<ReportRow[]> => {
    const firstResponse = await api.get("/reports/class-students", { params: buildReportParams(1, 100) });
    const firstBody = firstResponse.data?.body ?? {};
    const firstMeta = firstBody?.meta ?? firstResponse.data?.meta ?? {};
    const lastPage = Math.max(1, toSafeNumber(firstMeta?.last_page, 1));
    const allRows: ReportRow[] = Array.isArray(firstBody?.items) ? [...firstBody.items] : [];

    for (let currentPage = 2; currentPage <= lastPage; currentPage += 1) {
      const { data } = await api.get("/reports/class-students", {
        params: buildReportParams(currentPage, 100),
      });
      const body = data?.body ?? {};
      if (Array.isArray(body?.items)) {
        allRows.push(...body.items);
      }
    }

    return allRows;
  }, [buildReportParams]);

  useEffect(() => {
    fetchClassOptions();
  }, [fetchClassOptions]);

  useEffect(() => {
    fetchCourseOptions();
  }, [fetchCourseOptions]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const clearFilters = () => {
    setSearch("");
    setCourseId("");
    setSchoolClassId("");
    setPeriod("");
    setWeekday("");
    setPage(1);
  };

  const buildPdfGroups = useCallback(
    (sourceRows: ReportRow[]): Array<PdfGroup<StudentRow>> =>
      buildGroupsFromRows(sourceRows, periodLabelMap, formatWeekdays).map((group) => ({
        header: {
          turma: group.turma,
          periodo: group.periodo,
          dias_semana: group.dias_semana,
          curso: group.curso,
        },
        headerColumns: [
          { key: "turma", label: "Turma" },
          { key: "periodo", label: "Período" },
          { key: "dias_semana", label: "Dia(s) da semana" },
          { key: "curso", label: "Curso" },
        ],
        students: group.students,
        studentColumns: [
          { key: "aluno", label: "Aluno" },
          { key: "matricula", label: "Matrícula" },
          { key: "status", label: "Status" },
        ],
      })),
    [formatWeekdays, periodLabelMap]
  );

  const handleExportPdf = useCallback(async () => {
    const allRows = await fetchAllRowsForExport();
    return buildPdfGroups(allRows);
  }, [buildPdfGroups, fetchAllRowsForExport]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Relatórios</Text>
          <Text className="text-sm text-gray-500">Relação de alunos por turma</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" as any }}>
          <GridPdfExportButton
            filename="relatorio-turmas-alunos"
            title="Relatório de Turmas"
            subtitle="Relação de alunos por turma"
            groups={buildPdfGroups(rows)}
            onBeforeExport={handleExportPdf}
          />
          <TouchableOpacity
            onPress={() => navigate("turmas")}
            className="flex-row items-center bg-violet-600 px-4 py-2.5 rounded-xl"
            activeOpacity={0.85}
          >
            <Ionicons name="grid-outline" size={16} color="#fff" />
            <Text className="text-white font-semibold text-sm ml-2">Ir para turmas</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filtros</Text>
          <TouchableOpacity onPress={clearFilters} className="px-2 py-1 rounded-lg bg-gray-100" activeOpacity={0.8}>
            <Text className="text-xs font-semibold text-gray-600">Limpar</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2" style={{ flexWrap: "wrap" as any }}>
          <View
            className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3"
            style={{ height: 44, minWidth: isMobile ? "100%" : 280, flexGrow: 1 }}
          >
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <input
              placeholder="Buscar aluno, matrícula ou turma"
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

          <select
            value={courseId}
            onChange={(e: any) => {
              setCourseId(e.target.value);
              // Quando o curso muda, a turma precisa ser recomputada
              setSchoolClassId("");
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
              minWidth: isMobile ? "100%" : 220,
            }}
          >
            <option value="">Todos os cursos</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={schoolClassId}
            onChange={(e: any) => {
              setSchoolClassId(e.target.value);
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
              minWidth: isMobile ? "100%" : 260,
            }}
          >
            <option value="">Todas as turmas</option>
            {classOptions.map((klass) => (
              <option key={klass.id} value={String(klass.id)}>
                {klass.name}
              </option>
            ))}
          </select>

          <select
            value={period}
            onChange={(e: any) => {
              setPeriod(e.target.value);
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
              minWidth: isMobile ? "100%" : 180,
            }}
          >
            <option value="">Período</option>
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={weekday}
            onChange={(e: any) => {
              setWeekday(e.target.value);
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
              minWidth: isMobile ? "100%" : 180,
            }}
          >
            <option value="">Dia da semana</option>
            {weekdayOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </View>
      </View>

      <View className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <View className="py-14 items-center">
            <ActivityIndicator color="#7C3AED" />
            <Text className="text-xs text-gray-500 mt-2">Carregando relatório...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-14 items-center">
            <Ionicons name="document-text-outline" size={26} color="#9CA3AF" />
            <Text className="text-sm font-semibold text-gray-600 mt-2">Nenhum registro encontrado</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: fixedTableWidth }}>
              <View className="flex-row bg-gray-50 border-b border-gray-200 px-4 py-3">
                {!schoolClassId ? (
                  <>
                    <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.turma }}>
                      Turma
                    </Text>
                    <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.periodo }}>
                      Período
                    </Text>
                    <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.dias }}>
                      Dia(s) da semana
                    </Text>
                    <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.curso }}>
                      Curso
                    </Text>
                  </>
                ) : null}
                <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.aluno }}>
                  Aluno
                </Text>
                <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.matricula }}>
                  Matrícula
                </Text>
                <Text className="text-[11px] font-semibold text-gray-600" style={{ width: COLUMN_WIDTHS.status }}>
                  Status
                </Text>
              </View>
              {rows.map((row, idx) => (
                <View
                  key={`${row.student_id}-${row.school_class_id}-${idx}`}
                  className={`flex-row px-4 py-3 border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                >
                  {!schoolClassId ? (
                    <>
                      <Text className="text-xs font-semibold text-gray-800" style={{ width: COLUMN_WIDTHS.turma }}>
                        {row.school_class_name}
                      </Text>
                      <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.periodo }}>
                        {row.school_class_period
                          ? (periodLabelMap[row.school_class_period] ?? row.school_class_period)
                          : "-"}
                      </Text>
                      <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.dias }}>
                        {formatWeekdays(row.class_weekdays)}
                      </Text>
                      <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.curso }}>
                        {row.course_name || "-"}
                      </Text>
                    </>
                  ) : null}
                  <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.aluno }}>
                    {row.student_name}
                  </Text>
                  <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.matricula }}>
                    {row.enrollment_number || "-"}
                  </Text>
                  <Text className="text-xs text-gray-700" style={{ width: COLUMN_WIDTHS.status }}>
                    {statusLabel(row.enrollment_status)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <Pagination
        currentPage={meta.current_page}
        lastPage={meta.last_page}
        total={meta.total}
        perPage={meta.per_page}
        onPageChange={setPage}
      />
    </ScrollView>
  );
}
