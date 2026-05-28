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
import { useStatuses, domainToOptions } from "../../hooks/useDomains";
import { maskPhone, maskCPF, isoToDisplay } from "../../utils/masks";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type { CourseOption } from "../../types/entities";
import type { StudentListItem, StudentsScreenProps } from "../../types/alunos";

export default function StudentsScreen({ navigate }: StudentsScreenProps) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
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

  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", {
        params: { status: "active", per_page: 500 },
      });
      const list = data?.body ?? data?.data ?? data;
      const rows = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : [];
      setCourses(
        rows
          .filter((course: any) => course?.id && course?.name)
          .map((course: any) => ({ id: Number(course.id), name: String(course.name) }))
      );
    } catch {
      setCourses([]);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (courseFilter) params.course_id = Number(courseFilter);
      if (minorFilter) params.is_minor = minorFilter;
      const { data } = await api.get("/students", { params });
      const list = data?.body ?? data?.data ?? data;
      const fetchedRows = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : [];
      const selectedCourseId = courseFilter ? Number(courseFilter) : null;
      const filteredRows = selectedCourseId
        ? fetchedRows.filter((student: Student) => {
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
    } catch {}
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
    } catch {}
    setDeleting(false);
  };

  const approveStudent = async (studentId: number) => {
    setApprovingId(studentId);
    try {
      await api.put(`/students/${studentId}`, { status: "active" });
      fetchStudents();
    } catch {}
    setApprovingId(null);
  };

  const fmtDate = (iso: string | null) => (iso ? isoToDisplay(iso) : "—");
  const fmtDocument = (value: string | null) => {
    if (!value) return "—";
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
  const studentCourseLabel = (student: Student) => {
    const primaryCourses = student.desired_courses ?? [];
    if (primaryCourses.length > 0) return courseLabel(primaryCourses);
    if (student.desired_course) return student.desired_course.name;
    return "—";
  };
  const statusLabel = (value: string) =>
    statusOptions.find((item) => item.value === value)?.label ?? value;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
    >
      {/* Cabeçalho */}
      <View
        className="mb-6"
        style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-800">Alunos</Text>
          <Text className="text-sm text-gray-500">
            Gerencie os alunos do cursinho
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("alunos-form")}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo Aluno
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
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
          onChange={(e: any) => {
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

      {/* Tabela / Cards */}
      <ScrollView
        horizontal={!isMobile}
        showsHorizontalScrollIndicator={!isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: "100%" }}
      >
      <View
        className={isMobile ? "gap-3" : "bg-white rounded-2xl overflow-hidden"}
        style={{
          width: "100%",
          minWidth: isMobile ? undefined : tableMinWidth,
          shadowColor: isMobile ? undefined : "#000",
          shadowOpacity: isMobile ? undefined : 0.05,
          shadowRadius: isMobile ? undefined : 10,
          elevation: isMobile ? undefined : 2,
        }}
      >
        {!isMobile && <View className="flex-row bg-gray-50 border-b border-gray-100 px-3 py-2">
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ width: 112 }}
          >
            Matrícula
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            Nome / CPF
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 2 }}
          >
            E-mail
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Telefone
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Nascimento
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Cursos
          </Text>
          <Text
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            style={{ flex: 1 }}
          >
            Status
          </Text>
          <View style={{ width: 72 }} />
        </View>}

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Ionicons name="people-outline" size={40} color="#E5E7EB" />
            <Text className="text-gray-400 mt-3 text-sm">
              Nenhum aluno encontrado
            </Text>
          </View>
        ) : (
          rows.map((item, i) => (
            <View
              key={item.id}
              className={
                isMobile
                  ? "bg-white border border-gray-200 rounded-xl p-3"
                  : `flex-row items-center px-3 py-2 border-b border-gray-50 ${
                      i % 2 === 1 ? "bg-gray-50/40" : ""
                    }`
              }
              style={{
                shadowColor: isMobile ? "#000" : undefined,
                shadowOpacity: isMobile ? 0.04 : undefined,
                shadowRadius: isMobile ? 8 : undefined,
                elevation: isMobile ? 1 : undefined,
              }}
            >
              {isMobile ? (
                <>
                  <View className="flex-row items-start justify-between gap-3">
                    <View style={{ flex: 1 }}>
                      <Text className="text-sm font-semibold text-gray-800">{item.name}</Text>
                      <Text className="text-xs font-mono text-violet-600 font-semibold mt-0.5">
                        {item.enrollment_number ?? "Sem matrícula"}
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() =>
                          navigate("alunos-boletim", {
                            studentId: item.id,
                            studentName: item.name,
                          })
                        }
                        className="p-1.5 bg-violet-50 rounded-lg"
                        accessibilityLabel="Boletim"
                      >
                        <Ionicons name="ribbon-outline" size={15} color="#7C3AED" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          navigate("alunos-performance", {
                            studentId: item.id,
                            studentName: item.name,
                          })
                        }
                        className="p-1.5 bg-blue-50 rounded-lg"
                        accessibilityLabel="Aproveitamento em simulados"
                      >
                        <Ionicons name="stats-chart-outline" size={15} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigate("alunos-form", { studentId: item.id })} className="p-1.5 bg-violet-50 rounded-lg">
                        <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDeleteId(item.id)} className="p-1.5 bg-red-50 rounded-lg">
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                    <Text className="text-xs text-gray-500">Documento: {fmtDocument(item.document)}</Text>
                    <Text className="text-xs text-gray-500">Telefone: {item.phone ? maskPhone(item.phone) : "—"}</Text>
                    <Text className="text-xs text-gray-500">Nascimento: {fmtDate(item.birth_date)}</Text>
                    <Text className="text-xs text-gray-500">E-mail: {fmtEmail(item.email)}</Text>
                    <Text className="text-xs text-gray-500">Cursos: {courseLabel(item.desired_courses)}</Text>
                    <Text className="text-xs text-gray-500">Responsáveis: {fmtNames(item.guardians)}</Text>
                  </View>
                  <View className="mt-2 self-start">
                    <Badge slug={item.status} label={statusLabel(item.status)} />
                  </View>
                  {item.status === "inactive" && (
                    <TouchableOpacity
                      onPress={() => approveStudent(item.id)}
                      disabled={approvingId === item.id}
                      className="mt-2 flex-row items-center gap-1.5 self-start rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5"
                    >
                      {approvingId === item.id ? (
                        <ActivityIndicator size="small" color="#047857" />
                      ) : (
                        <Ionicons name="checkmark-circle-outline" size={14} color="#047857" />
                      )}
                      <Text className="text-xs font-semibold text-emerald-700">Aprovar cadastro</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
              <Text style={{ width: 112 }} className="text-xs font-mono text-violet-600 font-semibold">
                {item.enrollment_number ?? "—"}
              </Text>
              <View style={{ flex: 2 }}>
                <Text className="text-xs font-medium text-gray-800">
                  {item.name}
                </Text>
                {item.document && (
                  <Text className="text-[11px] text-gray-400">
                    {fmtDocument(item.document)}
                  </Text>
                )}
              </View>
              <Text className="text-xs text-gray-600" style={{ flex: 2 }}>
                {fmtEmail(item.email)}
              </Text>
              <Text className="text-xs text-gray-600" style={{ flex: 1 }}>
                {item.phone ? maskPhone(item.phone) : "—"}
              </Text>
              <Text className="text-xs text-gray-600" style={{ flex: 1 }}>
                {fmtDate(item.birth_date)}
              </Text>
              <Text className="text-xs text-gray-600" style={{ flex: 1 }}>
                {studentCourseLabel(item)}
              </Text>
              <View style={{ flex: 1 }}>
                <Badge
                  slug={item.status}
                  label={statusLabel(item.status)}
                />
              </View>
              <View
                style={{ width: 184 }}
                className="flex-row justify-end gap-2"
              >
                {item.status === "inactive" && (
                  <TouchableOpacity
                    onPress={() => approveStudent(item.id)}
                    disabled={approvingId === item.id}
                    className="p-1.5 bg-emerald-50 rounded-lg"
                  >
                    {approvingId === item.id ? (
                      <ActivityIndicator size="small" color="#047857" />
                    ) : (
                      <Ionicons name="checkmark-circle-outline" size={15} color="#047857" />
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() =>
                    navigate("alunos-boletim", {
                      studentId: item.id,
                      studentName: item.name,
                    })
                  }
                  className="p-1.5 bg-violet-50 rounded-lg"
                  accessibilityLabel="Boletim"
                >
                  <Ionicons name="ribbon-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigate("alunos-performance", {
                      studentId: item.id,
                      studentName: item.name,
                    })
                  }
                  className="p-1.5 bg-blue-50 rounded-lg"
                  accessibilityLabel="Aproveitamento em simulados"
                >
                  <Ionicons name="stats-chart-outline" size={15} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigate("alunos-form", { studentId: item.id })
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
                </>
              )}
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
        title="Excluir Aluno"
        message="Esta ação não pode ser desfeita. O aluno será removido permanentemente."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </ScrollView>
  );
}
