import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import DatePickerInput from "../../components/ui/DatePickerInput";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import Pagination from "../../components/ui/Pagination";
import type { WithNavigate } from "../../types/navigation";

type PastExamRow = {
  id: number;
  title: string;
  description: string | null;
  exam_year: number | null;
  exam_date: string | null;
  exam_type: string | null;
  exam_type_label: string | null;
  type: "file";
  content: string;
  is_published: boolean;
  subject: { id: number; name: string } | null;
  course: { id: number; name: string } | null;
  courses?: { id: number; name: string }[];
  course_ids?: number[];
};

const EXAM_TYPE_FORM_OPTIONS = [
  { value: "", label: "Nenhum" },
  { value: "enem", label: "ENEM" },
  { value: "vestibular", label: "Vestibular" },
  { value: "fuvest", label: "FUVEST" },
  { value: "concurso", label: "Concurso" },
  { value: "custom", label: "Outro" },
];

const EXAM_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  ...EXAM_TYPE_FORM_OPTIONS.filter((o) => o.value !== ""),
];

const PUBLISHED_FILTER_OPTIONS = [
  { value: "", label: "Todas publicações" },
  { value: "1", label: "Publicadas" },
  { value: "0", label: "Não publicadas" },
];

const EMPTY_FORM = {
  title: "",
  description: "",
  exam_year: "",
  exam_date: "",
  exam_type: "",
  course_ids: [] as number[],
  subject_id: "",
  is_published: "true",
};

const MAX_PDF_UPLOAD_KB = 150;
const MAX_PDF_UPLOAD_BYTES = MAX_PDF_UPLOAD_KB * 1024;
const PDF_SIZE_ERROR = `O PDF deve ter no máximo ${MAX_PDF_UPLOAD_KB} kB.`;

function formatPastExamDate(row: { exam_date?: string | null; exam_year?: number | null }): string | null {
  if (row.exam_date) {
    const display = isoToDisplay(row.exam_date);
    if (display) return display;
  }
  if (row.exam_year) return String(row.exam_year);
  return null;
}

export default function PastExamsScreen({ navigate }: WithNavigate) {
  const { width } = useWindowDimensions();
  const compactStack = width < 640;
  const [rows, setRows] = useState<PastExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [courseOptions, setCourseOptions] = useState<{ id: number; name: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [filterSubjectOptions, setFilterSubjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterExamType, setFilterExamType] = useState("");
  const [filterExamYear, setFilterExamYear] = useState("");
  const [filterPublished, setFilterPublished] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const yearFilterOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const options = [{ value: "", label: "Todos os anos" }];
    for (let year = currentYear; year >= 1990; year -= 1) {
      options.push({ value: String(year), label: String(year) });
    }
    return options;
  }, []);

  const hasActiveFilters =
    !!search.trim() ||
    !!filterCourseId ||
    !!filterSubjectId ||
    !!filterExamType ||
    !!filterExamYear ||
    filterPublished !== "";

  const clearFilters = () => {
    setSearch("");
    setFilterCourseId("");
    setFilterSubjectId("");
    setFilterExamType("");
    setFilterExamYear("");
    setFilterPublished("");
    setPage(1);
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: 20 };
      if (search.trim()) params.search = search.trim();
      if (filterCourseId) params.course_id = filterCourseId;
      if (filterSubjectId) params.subject_id = filterSubjectId;
      if (filterExamType) params.exam_type = filterExamType;
      if (filterExamYear) params.exam_year = filterExamYear;
      if (filterPublished !== "") params.is_published = filterPublished === "1" ? 1 : 0;

      const { data } = await api.get("/past-exams", { params });
      const body = data?.body ?? data;
      setRows(body?.data ?? []);
      if (body?.meta) {
        setMeta(body.meta);
      } else {
        setMeta({
          current_page: 1,
          last_page: 1,
          per_page: 20,
          total: Array.isArray(body?.data) ? body.data.length : 0,
        });
      }
    } catch {
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
    }
    setLoading(false);
  }, [
    page,
    search,
    filterCourseId,
    filterSubjectId,
    filterExamType,
    filterExamYear,
    filterPublished,
  ]);

  useEffect(() => {
    fetchRows();
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          api.get("/courses", { params: { per_page: 200 } }),
          api.get("/subjects", { params: { status: "active", per_page: 200 } }),
        ]);
        setCourseOptions(
          (cRes.data.data ?? cRes.data).map((c: { id: number; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        );
        const subjects = (sRes.data.data ?? sRes.data).map((s: { id: number; name: string }) => ({
          value: String(s.id),
          label: s.name,
        }));
        setSubjectOptions([{ value: "", label: "Nenhuma" }, ...subjects]);
        setFilterSubjectOptions([{ value: "", label: "Todas as disciplinas" }, ...subjects]);
      } catch {}
    })();
  }, [fetchRows]);

  const toggleCourse = (courseId: number) => {
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(courseId)
        ? prev.course_ids.filter((id) => id !== courseId)
        : [...prev.course_ids, courseId],
    }));
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setPdfFile(null);
    setErrors({});
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPdfFile(null);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row: PastExamRow) => {
    const courseIds =
      row.course_ids?.length
        ? row.course_ids
        : row.courses?.length
          ? row.courses.map((c) => c.id)
          : row.course
            ? [row.course.id]
            : [];
    setForm({
      title: row.title,
      description: row.description ?? "",
      exam_year: row.exam_year ? String(row.exam_year) : "",
      exam_date: row.exam_date ? isoToDisplay(row.exam_date) : "",
      exam_type: row.exam_type ?? "",
      course_ids: courseIds,
      subject_id: row.subject ? String(row.subject.id) : "",
      is_published: row.is_published ? "true" : "false",
    });
    setEditingId(row.id);
    setPdfFile(null);
    setErrors({});
    setModalOpen(true);
  };

  const selectStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "0 12px",
    fontSize: 13,
    color: "#374151",
    backgroundColor: "white",
    height: 44,
    minWidth: compactStack ? "100%" : 150,
  } as const;

  const fieldStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
    outline: "none",
    width: "100%",
    minHeight: 38,
  } as const;

  const renderFieldLabel = (label: string, required = false) => (
    <Text className="text-xs font-semibold text-gray-600 mb-1">
      {label}
      {required ? <Text className="text-red-500"> *</Text> : null}
    </Text>
  );

  const save = async () => {
    const localErrors: Record<string, string> = {};
    if (!form.title.trim()) localErrors.title = "Título obrigatório";
    if (!editingId && !pdfFile) localErrors.file = "Selecione o arquivo PDF da prova.";
    if (pdfFile && pdfFile.size > MAX_PDF_UPLOAD_BYTES) localErrors.file = PDF_SIZE_ERROR;
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const examDateIso = displayToISO(form.exam_date);
        const payload = {
          title: form.title.trim(),
          description: form.description.trim() || null,
          exam_date: examDateIso || null,
          exam_year: examDateIso
            ? Number(examDateIso.slice(0, 4))
            : form.exam_year
              ? Number(form.exam_year)
              : null,
          exam_type: form.exam_type || null,
          subject_id: form.subject_id ? Number(form.subject_id) : null,
          course_ids: form.course_ids,
          is_published: form.is_published === "true",
        };
        const { data } = await api.put(`/past-exams/${editingId}`, payload);
        setToast({
          visible: true,
          type: "success",
          message: data?.message ?? "Prova atualizada.",
        });
      } else {
        const formData = new FormData();
        formData.append("title", form.title.trim());
        if (form.description.trim()) formData.append("description", form.description.trim());
        const examDateIso = displayToISO(form.exam_date);
        if (examDateIso) {
          formData.append("exam_date", examDateIso);
          formData.append("exam_year", examDateIso.slice(0, 4));
        } else if (form.exam_year) {
          formData.append("exam_year", form.exam_year);
        }
        if (form.exam_type) formData.append("exam_type", form.exam_type);
        form.course_ids.forEach((id) => formData.append("course_ids[]", String(id)));
        if (form.subject_id) formData.append("subject_id", form.subject_id);
        formData.append("is_published", form.is_published === "true" ? "1" : "0");
        formData.append("file", pdfFile as File);

        const { data } = await api.post("/past-exams/upload", formData);
        setToast({
          visible: true,
          type: "success",
          message: data?.message ?? "Prova cadastrada.",
        });
      }
      closeModal();
      fetchRows();
    } catch (e: any) {
      setErrors(parseApiErrors(e));
      setToast({
        visible: true,
        type: "error",
        message: e?.response?.data?.message ?? "Não foi possível salvar.",
      });
    }
    setSaving(false);
  };

  const togglePublished = async (row: PastExamRow, value: boolean) => {
    try {
      await api.put(`/past-exams/${row.id}`, { is_published: value });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: value } : r)));
    } catch {
      setToast({ visible: true, type: "error", message: "Não foi possível atualizar." });
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/past-exams/${deleteId}`);
      setToast({ visible: true, type: "success", message: "Prova removida." });
      setDeleteId(null);
      fetchRows();
    } catch {
      setToast({ visible: true, type: "error", message: "Não foi possível remover." });
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 24 }}>
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">Provas anteriores</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Biblioteca de provas (PDF ou link) visível no app do aluno
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center gap-2 bg-violet-600 px-4 py-3 rounded-xl"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-white font-semibold">Nova prova</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-700">Filtros</Text>
          {hasActiveFilters ? (
            <TouchableOpacity onPress={clearFilters} className="flex-row items-center gap-1">
              <Ionicons name="close-circle-outline" size={16} color="#7C3AED" />
              <Text className="text-xs font-semibold text-violet-600">Limpar filtros</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: compactStack ? "column" : "row",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <View
            className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3"
            style={{ height: 44, minWidth: compactStack ? "100%" : 240, flex: compactStack ? undefined : 2 }}
          >
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Buscar por título ou descrição..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-2 text-sm text-gray-800"
            />
            {!!search && (
              <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <select
            value={filterCourseId}
            onChange={(e: any) => {
              setFilterCourseId(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            <option value="">Todos os cursos</option>
            {courseOptions.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.name}
              </option>
            ))}
          </select>

          <select
            value={filterSubjectId}
            onChange={(e: any) => {
              setFilterSubjectId(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            {filterSubjectOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filterExamType}
            onChange={(e: any) => {
              setFilterExamType(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            {EXAM_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filterExamYear}
            onChange={(e: any) => {
              setFilterExamYear(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            {yearFilterOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filterPublished}
            onChange={(e: any) => {
              setFilterPublished(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            {PUBLISHED_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </View>

        {!loading && meta.total > 0 ? (
          <Text className="text-xs text-gray-400">
            {meta.total} prova{meta.total !== 1 ? "s" : ""} encontrada{meta.total !== 1 ? "s" : ""}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7C3AED" />
      ) : rows.length === 0 ? (
        <Text className="text-gray-400">
          {hasActiveFilters
            ? "Nenhuma prova encontrada com os filtros selecionados."
            : "Nenhuma prova cadastrada."}
        </Text>
      ) : (
        <View className="gap-3">
          {rows.map((row) => (
            <View
              key={row.id}
              className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center gap-4"
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-800">{row.title}</Text>
                <Text className="text-xs text-gray-400 mt-1">
                  {[
                    formatPastExamDate(row),
                    row.exam_type_label,
                    row.subject?.name,
                    row.courses?.length
                      ? row.courses.map((c) => c.name).join(", ")
                      : row.course?.name,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Text>
                <Text className="text-xs text-gray-500 mt-1">PDF</Text>
              </View>
              <View className="items-center gap-1">
                <Text className="text-[10px] text-gray-400">Publicado</Text>
                <Switch
                  value={row.is_published}
                  onValueChange={(v) => togglePublished(row, v)}
                />
              </View>
              <TouchableOpacity onPress={() => openEdit(row)} accessibilityLabel="Editar prova">
                <Ionicons name="pencil-outline" size={20} color="#7C3AED" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDeleteId(row.id)} accessibilityLabel="Remover prova">
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          {meta.last_page > 1 ? (
            <Pagination
              currentPage={meta.current_page}
              lastPage={meta.last_page}
              total={meta.total}
              perPage={meta.per_page}
              onPageChange={setPage}
            />
          ) : null}
        </View>
      )}

      <Modal
        visible={modalOpen}
        title={editingId ? "Editar prova anterior" : "Nova prova anterior"}
        onClose={closeModal}
        size="sm"
        scrollViewClassName="py-0"
        footer={
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="bg-violet-600 px-5 py-2.5 rounded-xl items-center"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-sm font-semibold">Salvar</Text>
            )}
          </TouchableOpacity>
        }
      >
        <View className="gap-3">
          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 10 }}>
            <View className="flex-[2]">
              {renderFieldLabel("Título", true)}
              <input
                value={form.title}
                onChange={(e: any) => setForm((p) => ({ ...p, title: e.target.value }))}
                style={{
                  ...fieldStyle,
                  borderColor: errors.title ? "#FCA5A5" : "#E5E7EB",
                }}
              />
              {errors.title ? (
                <Text className="text-xs text-red-500 mt-1">{errors.title}</Text>
              ) : null}
            </View>
            <View className="flex-1">
              <DatePickerInput
                label="Data da prova"
                value={form.exam_date}
                onChangeText={(exam_date) => setForm((p) => ({ ...p, exam_date }))}
              />
            </View>
          </View>

          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 10 }}>
            <View className="flex-1">
              {renderFieldLabel("Tipo")}
              <select
                value={form.exam_type}
                onChange={(e: any) => setForm((p) => ({ ...p, exam_type: e.target.value }))}
                style={fieldStyle}
              >
                {EXAM_TYPE_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </View>
            <View className="flex-1">
              {renderFieldLabel("Publicar")}
              <select
                value={form.is_published}
                onChange={(e: any) => setForm((p) => ({ ...p, is_published: e.target.value }))}
                style={fieldStyle}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </View>
          </View>

          <View>
            {renderFieldLabel("Cursos")}
            <Text className="text-xs text-gray-400 mb-2">
              Opcional. Sem seleção, todos os alunos da escola veem a prova.
            </Text>
            {courseOptions.length === 0 ? (
              <Text className="text-sm text-gray-400">Nenhum curso disponível</Text>
            ) : (
              <View className="gap-2">
                {courseOptions.map((course) => {
                  const selected = form.course_ids.includes(course.id);
                  return (
                    <TouchableOpacity
                      key={course.id}
                      onPress={() => toggleCourse(course.id)}
                      activeOpacity={0.7}
                      className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl border ${
                        selected ? "bg-violet-50 border-violet-200" : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={18}
                        color={selected ? "#7C3AED" : "#9CA3AF"}
                      />
                      <Text
                        className={`text-sm font-medium ${
                          selected ? "text-violet-700" : "text-gray-700"
                        }`}
                      >
                        {course.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {form.course_ids.length > 0 ? (
              <Text className="text-xs text-green-600 mt-2">
                {form.course_ids.length} curso{form.course_ids.length !== 1 ? "s" : ""} selecionado
                {form.course_ids.length !== 1 ? "s" : ""}
              </Text>
            ) : null}
          </View>

          <View className="flex-1">
            {renderFieldLabel("Disciplina")}
            <select
              value={form.subject_id}
              onChange={(e: any) => setForm((p) => ({ ...p, subject_id: e.target.value }))}
              style={fieldStyle}
            >
              {subjectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </View>

          <View className="flex-1">
            {renderFieldLabel("Descrição")}
            <input
              value={form.description}
              onChange={(e: any) => setForm((p) => ({ ...p, description: e.target.value }))}
              style={fieldStyle}
            />
          </View>

          {editingId ? (
            <View className="rounded-xl border border-gray-100 bg-violet-50 px-3 py-2.5">
              <Text className="text-xs text-violet-700">
                O arquivo PDF atual não é alterado nesta edição. Para trocar o PDF, remova a prova e
                cadastre novamente.
              </Text>
            </View>
          ) : (
            <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  {renderFieldLabel("Arquivo PDF", true)}
                  <Text className="text-xs text-gray-400">Máximo {MAX_PDF_UPLOAD_KB} kB</Text>
                </View>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && !file.name.toLowerCase().endsWith(".pdf")) {
                      setPdfFile(null);
                      e.currentTarget.value = "";
                      setErrors((prev) => ({ ...prev, file: "Envie apenas arquivos PDF." }));
                    } else if (file && file.size > MAX_PDF_UPLOAD_BYTES) {
                      setPdfFile(null);
                      e.currentTarget.value = "";
                      setErrors((prev) => ({ ...prev, file: PDF_SIZE_ERROR }));
                    } else {
                      setPdfFile(file);
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.file;
                        return next;
                      });
                    }
                  }}
                  style={{ fontSize: 12, maxWidth: compactStack ? "100%" : 230 }}
                />
              </View>
              {pdfFile ? (
                <Text className="text-xs text-gray-500 mt-2" numberOfLines={1}>
                  {pdfFile.name} · {(pdfFile.size / 1024).toFixed(1)} kB
                </Text>
              ) : null}
              {errors.file ? (
                <Text className="text-xs text-red-600 mt-1">{errors.file}</Text>
              ) : null}
            </View>
          )}
        </View>
      </Modal>

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover prova"
        message="Deseja remover esta prova anterior?"
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
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
