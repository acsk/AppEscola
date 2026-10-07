import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Pagination from "../../components/ui/Pagination";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { domainToOptions, usePeriods, useWeekdays } from "../../hooks/useDomains";
import GridPdfExportButton, { PdfGroup } from "../../components/ui/GridPdfExportButton";
import DataTableRow from "../../components/ui/DataTableRow";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import SearchableSelect from "../../components/ui/SearchableSelect";
import { LayoutGrid, X } from "lucide-react-native";
import type { Tone } from "../../constants/theme";
import {
  TABLE_CELL,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";

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

const TABLE_COLUMNS = [
  { key: "turma", label: "Turma", flex: 2.2, minWidth: 180, variant: "bodyBold" as const },
  { key: "periodo", label: "Período", flex: 1, minWidth: 96, variant: "body" as const },
  { key: "dias", label: "Dia(s) da semana", flex: 1.2, minWidth: 120, variant: "body" as const },
  { key: "curso", label: "Curso", flex: 1.2, minWidth: 120, variant: "body" as const },
  { key: "aluno", label: "Aluno", flex: 2.5, minWidth: 200, variant: "body" as const },
  { key: "matricula", label: "Matrícula", flex: 1.1, minWidth: 130, variant: "mono" as const },
  { key: "status", label: "Status", flex: 0.9, minWidth: 100, variant: "badge" as const },
];

const STATUS_TONE: Record<string, Tone> = { active: "success", pending: "warning", cancelled: "danger", completed: "neutral" };

export default function ClassStudentsReportScreen({ navigate }: Props) {
  const { contentPadding, isMobile, tableMinWidth } = useResponsiveLayout();
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
  const tableScrollMinWidth =
    tableMinWidth ??
    TABLE_COLUMNS.reduce((sum, col) => sum + col.minWidth, 0);

  const renderTableCell = (
    flex: number,
    minWidth: number,
    value: string,
    variant: "header" | "body" | "bodyBold" | "mono" | "badge" = "body",
    tone?: Tone
  ) => (
    <View
      style={{
        flex,
        minWidth,
        paddingHorizontal: 12,
        justifyContent: "center",
      }}
    >
      {variant === "badge" ? (
        <View style={{ alignItems: "flex-start" }}>
          <Badge tone={tone ?? "neutral"} dot label={value} />
        </View>
      ) : (
        <Text
          numberOfLines={1}
          className={
            variant === "header"
              ? TABLE_HEADER_CELL
              : variant === "bodyBold"
                ? TABLE_CELL_SEMIBOLD
                : variant === "mono"
                  ? `${TABLE_CELL} font-mono`
                  : TABLE_CELL
          }
        >
          {value}
        </Text>
      )}
    </View>
  );

  const cellValueForRow = (row: ReportRow, key: string) => {
    switch (key) {
      case "turma":
        return row.school_class_name;
      case "periodo":
        return row.school_class_period
          ? (periodLabelMap[row.school_class_period] ?? row.school_class_period)
          : "-";
      case "dias":
        return formatWeekdays(row.class_weekdays);
      case "curso":
        return row.course_name || "-";
      case "aluno":
        return row.student_name;
      case "matricula":
        return row.enrollment_number || "-";
      case "status":
        return statusLabel(row.enrollment_status);
      default:
        return "-";
    }
  };

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

  const hasFilters = !!(search || courseId || schoolClassId || period || weekday);
  const filterWidth = isMobile ? "100%" : 200;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}>
      <View style={{ marginBottom: 24 }}>
        <PageHeader
          title="Alunos por turma"
          description="Relação de alunos matriculados em cada turma, com período, dias e curso."
          actions={
            <>
              <Button icon={LayoutGrid} label="Ir para turmas" onPress={() => navigate("turmas")} />
              <GridPdfExportButton
                filename="relatorio-turmas-alunos"
                title="Alunos por turma"
                subtitle="Relação de alunos matriculados em cada turma."
                groups={buildPdfGroups(rows)}
                onBeforeExport={handleExportPdf}
              />
            </>
          }
        />
      </View>

      {/* Filtros: busca + selects com pesquisa, numa linha (quebra no mobile) */}
      <View className="flex-row flex-wrap items-end" style={{ gap: 12, marginBottom: 16 }}>
        <View style={{ flexGrow: 1, minWidth: isMobile ? "100%" : 260, flexBasis: isMobile ? "100%" : 260 }}>
          <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
            Buscar
          </Text>
          <View
            className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3"
            style={{ height: 38 }}
          >
            <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
            <input
              aria-label="Buscar aluno, matrícula ou turma"
              placeholder="Aluno, matrícula ou turma"
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
                fontFamily: "inherit",
              }}
            />
          </View>
        </View>
        <View style={{ width: filterWidth }}>
          <SearchableSelect
            dense
            label="Curso"
            modalTitle="Filtrar por curso"
            placeholder="Todos os cursos"
            showSelectedPreview={false}
            value={courseId}
            options={courseOptions.map((c) => ({ value: String(c.id), label: c.name }))}
            onChange={(v) => {
              setCourseId(v);
              setSchoolClassId(""); // a turma depende do curso
              setPage(1);
            }}
          />
        </View>
        <View style={{ width: filterWidth }}>
          <SearchableSelect
            dense
            label="Turma"
            modalTitle="Filtrar por turma"
            placeholder="Todas as turmas"
            showSelectedPreview={false}
            value={schoolClassId}
            options={classOptions.map((c) => ({ value: String(c.id), label: c.name }))}
            onChange={(v) => {
              setSchoolClassId(v);
              setPage(1);
            }}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 160 }}>
          <SearchableSelect
            dense
            label="Período"
            modalTitle="Filtrar por período"
            placeholder="Todos"
            showSelectedPreview={false}
            value={period}
            options={periodOptions.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(v) => {
              setPeriod(v);
              setPage(1);
            }}
          />
        </View>
        <View style={{ width: isMobile ? "100%" : 170 }}>
          <SearchableSelect
            dense
            label="Dia da semana"
            modalTitle="Filtrar por dia da semana"
            placeholder="Todos"
            showSelectedPreview={false}
            value={weekday}
            options={weekdayOptions.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(v) => {
              setWeekday(v);
              setPage(1);
            }}
          />
        </View>
        {hasFilters && <Button variant="ghost" icon={X} label="Limpar filtros" onPress={clearFilters} />}
      </View>

      <Panel
        title="Alunos"
        description={loading ? "Carregando…" : `${meta.total} registro${meta.total === 1 ? "" : "s"}${hasFilters ? " com os filtros aplicados" : ""}.`}
        flush
      >
      <View>
        {loading ? (
          <View className="py-14 items-center">
            <ActivityIndicator color="var(--ds-brand)" />
            <Text className="text-xs text-ink-muted mt-2">Carregando relatório...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="py-14 items-center">
            <Text className="text-sm font-medium text-ink">Nenhum aluno encontrado</Text>
            <Text className="text-sm text-ink-muted mt-1">
              {hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "Ainda não há alunos matriculados em turmas."}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal={isMobile}
            showsHorizontalScrollIndicator={isMobile}
            style={{ width: "100%" }}
            contentContainerStyle={{
              width: isMobile ? undefined : "100%",
              minWidth: isMobile ? tableScrollMinWidth : "100%",
            }}
          >
            <View style={{ width: "100%", minWidth: isMobile ? tableScrollMinWidth : undefined }}>
              <View className={TABLE_HEADER_ROW} style={[{ width: "100%" }, TABLE_HEADER_ROW_STYLE]}>
                {TABLE_COLUMNS.map((col) =>
                  renderTableCell(col.flex, col.minWidth, col.label, "header")
                )}
              </View>
              {rows.map((row, idx) => (
                <DataTableRow
                  key={`${row.student_id}-${row.school_class_id}-${idx}`}
                  index={idx}
                  style={{ width: "100%" }}
                >
                  {TABLE_COLUMNS.map((col) =>
                    renderTableCell(
                      col.flex,
                      col.minWidth,
                      cellValueForRow(row, col.key),
                      col.key === "turma" ? "bodyBold" : col.variant,
                      col.key === "status" ? STATUS_TONE[row.enrollment_status] ?? "neutral" : undefined
                    )
                  )}
                </DataTableRow>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
      </Panel>

      <View style={{ marginTop: 16 }} />
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
