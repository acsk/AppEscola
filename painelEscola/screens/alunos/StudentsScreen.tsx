import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import ConfirmModal from "../../components/ui/ConfirmModal";
import DataTableRow from "../../components/ui/DataTableRow";
import StudentActionsModal, {
  type StudentActionItem,
  type StudentActionKey,
} from "../../components/alunos/StudentActionsModal";
import {
  TABLE_CELL,
  TABLE_CELL_ENROLLMENT,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { useStatuses, domainToOptions } from "../../hooks/useDomains";
import { maskPhone, maskCPF, isoToDisplay } from "../../utils/masks";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type { CourseOption } from "../../types/entities";
import type { StudentListItem, StudentsScreenProps } from "../../types/alunos";

const TABLE_MIN_WIDTH = 1040;

const COL_ENROLLMENT = { flex: 0.85, minWidth: 100 };
const COL_NAME = { flex: 2, minWidth: 176 };
const COL_EMAIL = { flex: 1.55, minWidth: 150 };
const COL_PHONE = { flex: 1, minWidth: 118 };
const COL_BIRTH = { flex: 0.85, minWidth: 96 };
const COL_COURSES = { flex: 1.15, minWidth: 110 };
const COL_STATUS = { flex: 0.72, minWidth: 88 };
const COL_ACTION = { width: 42 };

type ColDef = {
  key: string;
  label: string;
  flex?: number;
  minWidth?: number;
  width?: number;
};

const COLUMNS: ColDef[] = [
  { key: "enrollment", label: "Matrícula", ...COL_ENROLLMENT },
  { key: "name", label: "Nome / CPF", ...COL_NAME },
  { key: "email", label: "E-mail", ...COL_EMAIL },
  { key: "phone", label: "Telefone", ...COL_PHONE },
  { key: "birth", label: "Nascimento", ...COL_BIRTH },
  { key: "courses", label: "Cursos", ...COL_COURSES },
  { key: "status", label: "Status", ...COL_STATUS },
];

function colStyle(col: ColDef) {
  return {
    flex: col.width ? undefined : col.flex,
    width: col.width,
    minWidth: col.minWidth,
    paddingRight: col.width ? 0 : 8,
  };
}

export default function StudentsScreen({ navigate }: StudentsScreenProps) {
  const { isMobile, contentPadding } = useResponsiveLayout();
  const statuses = useStatuses();
  const statusOptions = statuses.length
    ? domainToOptions(statuses)
    : [
        { value: "active", label: "Ativo" },
        { value: "inactive", label: "Inativo" },
      ];
  const [rows, setRows] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [minorFilter, setMinorFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [menuStudent, setMenuStudent] = useState<StudentActionItem | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", {
        params: { status: "active", per_page: 500 },
      });
      const list = data?.body ?? data?.data ?? data;
      const courseRows = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : [];
      setCourses(
        courseRows
          .filter((course: { id?: number; name?: string }) => course?.id && course?.name)
          .map((course: { id: number; name: string }) => ({
            id: Number(course.id),
            name: String(course.name),
          }))
      );
    } catch {
      setCourses([]);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (courseFilter) params.course_id = Number(courseFilter);
      if (minorFilter) params.is_minor = minorFilter;
      const { data } = await api.get("/students", { params });
      const list = data?.body ?? data?.data ?? data;
      const fetchedRows: StudentListItem[] = Array.isArray(list?.data)
        ? list.data
        : Array.isArray(list)
          ? list
          : [];
      const selectedCourseId = courseFilter ? Number(courseFilter) : null;
      const filteredRows = selectedCourseId
        ? fetchedRows.filter((student) => {
            const desiredIds = [
              ...(student.desired_courses ?? []).map((course) => course.id),
              student.desired_course_id ?? null,
              student.desired_course?.id ?? null,
            ].filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
            return desiredIds.includes(selectedCourseId);
          })
        : fetchedRows;
      setRows(filteredRows);
      setMeta(
        list?.meta ??
          data?.meta ?? {
            current_page: 1,
            last_page: 1,
            per_page: 20,
            total: 0,
          }
      );
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [courseFilter, minorFilter, page, search, statusFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${deleteId}`);
      setDeleteId(null);
      fetchStudents();
    } catch {
      /* toast opcional */
    }
    setDeleting(false);
  };

  const approveStudent = async (studentId: number) => {
    setApprovingId(studentId);
    try {
      await api.put(`/students/${studentId}`, { status: "active" });
      fetchStudents();
    } catch {
      /* toast opcional */
    }
    setApprovingId(null);
  };

  const fmtDate = (iso: string | null) => (iso ? isoToDisplay(iso) : "—");
  const fmtDocument = (value: string | null) => {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    return digits.length === 11 ? maskCPF(digits) : value;
  };
  const fmtEmail = (value: string | null) => (value ? value.trim().toLowerCase() : "—");
  const fmtNames = (items?: Array<{ name: string }>) => {
    if (!items || items.length === 0) return "—";
    return items.map((item) => item.name).join(", ");
  };
  const courseLabel = (items?: Array<{ id: number; name: string }>) => {
    if (!items || items.length === 0) return "—";
    return items.map((item) => item.name).join(", ");
  };
  const studentCourseLabel = (student: StudentListItem) => {
    const primaryCourses = student.desired_courses ?? [];
    if (primaryCourses.length > 0) return courseLabel(primaryCourses);
    if (student.desired_course) return student.desired_course.name;
    return "—";
  };
  const statusLabel = (value: string) =>
    statusOptions.find((item) => item.value === value)?.label ?? value;

  const toActionItem = (item: StudentListItem): StudentActionItem => ({
    id: item.id,
    name: item.name,
    enrollment_number: item.enrollment_number,
    email: item.email,
    document: item.document,
    status: item.status,
  });

  const handleStudentAction = (action: StudentActionKey) => {
    const row = menuStudent;
    if (!row) return;
    if (action === "edit") {
      navigate("alunos-form", { studentId: row.id });
      return;
    }
    if (action === "boletim") {
      navigate("alunos-boletim", { studentId: row.id, studentName: row.name });
      return;
    }
    if (action === "performance") {
      navigate("alunos-performance", { studentId: row.id, studentName: row.name });
      return;
    }
    if (action === "approve") {
      approveStudent(row.id);
      return;
    }
    if (action === "delete") {
      setDeleteId(row.id);
    }
  };

  const renderActionsButton = (item: StudentListItem) => (
    <TouchableOpacity
      onPress={() => setMenuStudent(toActionItem(item))}
      className="p-1.5 bg-gray-100 rounded-lg border border-gray-200"
      activeOpacity={0.85}
      accessibilityLabel="Ações do aluno"
    >
      <Ionicons name="ellipsis-horizontal" size={16} color="#4B5563" />
    </TouchableOpacity>
  );

  const renderMobileCard = (item: StudentListItem) => (
    <View
      key={item.id}
      className="bg-white border border-gray-200 rounded-xl p-3"
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={2}>
            {item.name}
          </Text>
          <Text className="text-xs font-mono text-violet-600 font-semibold mt-0.5">
            {item.enrollment_number ?? "Sem matrícula"}
          </Text>
        </View>
        {renderActionsButton(item)}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
        <Text className="text-xs text-gray-500">Documento: {fmtDocument(item.document) ?? "—"}</Text>
        <Text className="text-xs text-gray-500">
          Telefone: {item.phone ? maskPhone(item.phone) : "—"}
        </Text>
        <Text className="text-xs text-gray-500">Nascimento: {fmtDate(item.birth_date)}</Text>
        <Text className="text-xs text-gray-500">E-mail: {fmtEmail(item.email)}</Text>
        <Text className="text-xs text-gray-500">Cursos: {studentCourseLabel(item)}</Text>
        <Text className="text-xs text-gray-500">Responsáveis: {fmtNames(item.guardians)}</Text>
      </View>
      <View className="mt-2 self-start">
        <Badge slug={item.status} label={statusLabel(item.status)} />
      </View>
    </View>
  );

  const renderDesktopRow = (item: StudentListItem, index: number) => {
    const doc = fmtDocument(item.document);
    return (
      <DataTableRow key={item.id} index={index}>
        <Text
          className={TABLE_CELL_ENROLLMENT}
          style={colStyle(COLUMNS[0])}
          numberOfLines={1}
        >
          {item.enrollment_number ?? "—"}
        </Text>
        <View style={colStyle(COLUMNS[1])}>
          <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
            {item.name}
          </Text>
          {doc ? (
            <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
              {doc}
            </Text>
          ) : null}
        </View>
        <Text className={TABLE_CELL} style={colStyle(COLUMNS[2])} numberOfLines={1}>
          {fmtEmail(item.email)}
        </Text>
        <Text className={TABLE_CELL} style={colStyle(COLUMNS[3])} numberOfLines={1}>
          {item.phone ? maskPhone(item.phone) : "—"}
        </Text>
        <Text className={TABLE_CELL_MUTED} style={colStyle(COLUMNS[4])} numberOfLines={1}>
          {fmtDate(item.birth_date)}
        </Text>
        <Text className={TABLE_CELL} style={colStyle(COLUMNS[5])} numberOfLines={2}>
          {studentCourseLabel(item)}
        </Text>
        <View style={colStyle(COLUMNS[6])}>
          <Badge slug={item.status} label={statusLabel(item.status)} />
        </View>
        <View style={{ width: COL_ACTION.width }} className="flex-row justify-end">
          {renderActionsButton(item)}
        </View>
      </DataTableRow>
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
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
          <Text className="text-2xl font-bold text-gray-800">Alunos</Text>
          <Text className="text-sm text-gray-500">Gerencie os alunos do cursinho</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("alunos-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Novo Aluno</Text>
        </TouchableOpacity>
      </View>

      <View
        className="mb-4"
        style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}
      >
        <View
          className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
          style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
        >
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nome..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 ml-2 text-sm text-gray-800"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <select
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
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
            minWidth: isMobile ? "100%" : 160,
          }}
        >
          <option value="">Todos os status</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={courseFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setCourseFilter(e.target.value);
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
            minWidth: isMobile ? "100%" : 220,
          }}
        >
          <option value="">Todos os cursos</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
        <select
          value={minorFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setMinorFilter(e.target.value);
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
          <option value="">Todos</option>
          <option value="true">Somente menores</option>
          <option value="false">Somente maiores</option>
        </select>
      </View>

      {isMobile ? (
        <View className="gap-3">
          {loading ? (
            <View className="items-center justify-center py-16 bg-white rounded-2xl border border-gray-200">
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : rows.length === 0 ? (
            <View className="items-center justify-center py-14 bg-white rounded-2xl border border-gray-200">
              <Ionicons name="people-outline" size={40} color="#E5E7EB" />
              <Text className="text-gray-400 mt-3 text-sm">Nenhum aluno encontrado</Text>
            </View>
          ) : (
            rows.map(renderMobileCard)
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
              minWidth: TABLE_MIN_WIDTH,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
              {COLUMNS.map((col) => (
                <Text key={col.key} className={TABLE_HEADER_CELL} style={colStyle(col)}>
                  {col.label}
                </Text>
              ))}
              <View style={{ width: COL_ACTION.width }} />
            </View>

            {loading ? (
              <View className="items-center justify-center py-20">
                <ActivityIndicator size="large" color="#7C3AED" />
              </View>
            ) : rows.length === 0 ? (
              <View className="items-center justify-center py-16">
                <Ionicons name="people-outline" size={40} color="#E5E7EB" />
                <Text className="text-gray-400 mt-3 text-sm">Nenhum aluno encontrado</Text>
              </View>
            ) : (
              rows.map(renderDesktopRow)
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

      <StudentActionsModal
        visible={!!menuStudent}
        student={menuStudent}
        onClose={() => setMenuStudent(null)}
        onSelect={handleStudentAction}
        statusLabel={statusLabel}
      />

      <ConfirmModal
        visible={!!deleteId}
        title="Excluir Aluno"
        message="Esta ação não pode ser desfeita. O aluno será removido permanentemente."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
