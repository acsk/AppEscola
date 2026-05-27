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
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import SearchableSelect from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import Pagination from "../../components/ui/Pagination";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useExamTypes, domainToOptions } from "../../hooks/useDomains";
import type { WithNavigate } from "../../types/navigation";

type PastExamMaterialKind = "prova" | "exercicio";

type PastExamRow = {
  id: number;
  title: string;
  description: string | null;
  exam_year: number | null;
  exam_date: string | null;
  exam_type: string | null;
  exam_type_label: string | null;
  material_kind?: PastExamMaterialKind;
  material_kind_label?: string | null;
  type: "file";
  content: string;
  file_size?: number | null;
  is_published: boolean;
  subject: { id: number; name: string } | null;
  course: { id: number; name: string } | null;
  courses?: { id: number; name: string }[];
  course_ids?: number[];
};


const PUBLISHED_FILTER_OPTIONS = [
  { value: "", label: "Todas publicações" },
  { value: "1", label: "Publicadas" },
  { value: "0", label: "Não publicadas" },
];

const MATERIAL_KIND_OPTIONS = [
  { value: "", label: "Prova e exercício" },
  { value: "prova", label: "Prova" },
  { value: "exercicio", label: "Exercício" },
];

const MATERIAL_KIND_FORM_OPTIONS = [
  { value: "prova", label: "Prova" },
  { value: "exercicio", label: "Exercício" },
];

const EMPTY_FORM = {
  title: "",
  description: "",
  exam_date: "",
  exam_type: "",
  material_kind: "prova" as PastExamMaterialKind,
  course_ids: [] as number[],
  subject_id: "",
  is_published: "true",
};

function validateExamDateField(
  display: string,
  materialKind: PastExamMaterialKind,
): string | null {
  const trimmed = display.trim();
  if (!trimmed) {
    return materialKind === "prova" ? "Informe o ano da prova." : null;
  }
  const iso = displayToISO(trimmed);
  if (!iso) return "Informe a data completa (dd/mm/aaaa) ou o ano da prova.";
  const year = Number(iso.slice(0, 4));
  if (year < 1990 || year > 2100) return "A data da prova deve ser de 1990 em diante.";
  return null;
}

function mapPastExamApiErrors(
  raw: Record<string, string | string[]>
): Record<string, string> {
  const parsed = parseApiErrors(raw);
  if (parsed.exam_year && !parsed.exam_date) {
    parsed.exam_date = parsed.exam_year;
    delete parsed.exam_year;
  }
  return parsed;
}

// Não aplicamos limite de tamanho no frontend.
// Se o backend tiver limites (upload_max_filesize / etc), a API vai retornar 413/422 e a UI exibe o erro.

function pdfFileNameFromContent(content: string): string {
  try {
    const path = new URL(content).pathname;
    const name = path.split("/").pop();
    return name ? decodeURIComponent(name) : "prova.pdf";
  } catch {
    return "Arquivo atual.pdf";
  }
}

function formatFileSizeKb(bytes?: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function formatPastExamDate(row: { exam_date?: string | null; exam_year?: number | null }): string | null {
  if (row.exam_date) {
    const display = isoToDisplay(row.exam_date);
    if (display) return display;
  }
  if (row.exam_year) return String(row.exam_year);
  return null;
}

export default function PastExamsScreen({ navigate }: WithNavigate) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const { width } = useWindowDimensions();
  const compactStack = width < 640;
  const examTypes = useExamTypes();
  const examTypeFormOptions = domainToOptions(examTypes);
  const examTypeFilterOptions = [
    { value: "", label: "Todos os tipos" },
    ...domainToOptions(examTypes),
  ];
  const [rows, setRows] = useState<PastExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [editingPdfLabel, setEditingPdfLabel] = useState<string | null>(null);
  const [courseOptions, setCourseOptions] = useState<{ id: number; name: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [filterSubjectOptions, setFilterSubjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterExamType, setFilterExamType] = useState("");
  const [filterExamYear, setFilterExamYear] = useState("");
  const [filterPublished, setFilterPublished] = useState("");
  const [filterMaterialKind, setFilterMaterialKind] = useState("");
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
  const [coursePickerKey, setCoursePickerKey] = useState(0);

  const courseSearchOptions = useMemo(
    () => courseOptions.map((c) => ({ value: String(c.id), label: c.name })),
    [courseOptions]
  );

  const availableCourseOptions = useMemo(
    () =>
      courseSearchOptions.filter((o) => !form.course_ids.includes(Number(o.value))),
    [courseSearchOptions, form.course_ids]
  );

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
    filterPublished !== "" ||
    !!filterMaterialKind;

  const clearFilters = () => {
    setSearch("");
    setFilterCourseId("");
    setFilterSubjectId("");
    setFilterExamType("");
    setFilterExamYear("");
    setFilterPublished("");
    setFilterMaterialKind("");
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
      if (filterMaterialKind) params.material_kind = filterMaterialKind;

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
    filterMaterialKind,
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

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setPdfFile(null);
    setEditingPdfLabel(null);
    setErrors({});
    setCoursePickerKey((k) => k + 1);
  };

  const addCourseFromPicker = (courseIdStr: string) => {
    const id = Number(courseIdStr);
    if (!Number.isFinite(id) || id <= 0) return;
    setForm((prev) =>
      prev.course_ids.includes(id)
        ? prev
        : { ...prev, course_ids: [...prev.course_ids, id] }
    );
    setCoursePickerKey((k) => k + 1);
  };

  const removeCourse = (courseId: number) => {
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.filter((id) => id !== courseId),
    }));
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPdfFile(null);
    setEditingPdfLabel(null);
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
      exam_date: row.exam_date
        ? isoToDisplay(row.exam_date)
        : row.exam_year
          ? `01/01/${row.exam_year}`
          : "",
      exam_type: row.exam_type ?? "",
      material_kind: row.material_kind ?? "prova",
      course_ids: courseIds,
      subject_id: row.subject ? String(row.subject.id) : "",
      is_published: row.is_published ? "true" : "false",
    });
    setEditingId(row.id);
    setPdfFile(null);
    setEditingPdfLabel(row.content ? pdfFileNameFromContent(row.content) : null);
    setErrors({});
    setModalOpen(true);
  };

  const selectStyle = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 14,
    color: "#374151",
    backgroundColor: "white",
    height: 44,
    minWidth: isMobile ? "100%" : 160,
  } as const;

  const handlePdfInputChange = (e: any) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfFile(null);
      e.currentTarget.value = "";
      setErrors((prev) => ({ ...prev, file: "Envie apenas arquivos PDF." }));
      return;
    }
    setPdfFile(file);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.file;
      return next;
    });
  };

  const renderPdfField = () => (
    <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-700">
            Arquivo PDF{!editingId ? " *" : ""}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            Envie qualquer tamanho de PDF (limite do servidor pode se aplicar).
            {editingId ? " · deixe em branco para manter o arquivo atual" : ""}
          </Text>
        </View>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={handlePdfInputChange}
          style={{ fontSize: 12, maxWidth: compactStack ? "100%" : 230 }}
        />
      </View>
      {pdfFile ? (
        <Text className="text-xs text-gray-600 mt-2" numberOfLines={1}>
          Novo: {pdfFile.name} · {(pdfFile.size / 1024).toFixed(1)} kB
        </Text>
      ) : editingPdfLabel ? (
        <Text className="text-xs text-gray-500 mt-2" numberOfLines={1}>
          Atual: {editingPdfLabel}
        </Text>
      ) : null}
      {errors.file ? (
        <Text className="text-xs text-red-600 mt-1">{errors.file}</Text>
      ) : null}
    </View>
  );

  const courseNamesForRow = (row: PastExamRow) =>
    row.courses?.length
      ? row.courses.map((c) => c.name).join(", ")
      : row.course?.name ?? "—";

  const renderTableRow = (row: PastExamRow, index: number) => {
    const dateLabel = formatPastExamDate(row) ?? "—";
    const sizeLabel = formatFileSizeKb(row.file_size);

    if (isMobile) {
      return (
        <View
          key={row.id}
          className="bg-white border border-gray-200 rounded-xl p-3"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 1,
          }}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View style={{ flex: 1 }}>
              <Text className="text-sm font-semibold text-gray-800">{row.title}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {[row.material_kind_label, dateLabel, row.exam_type_label, row.subject?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>
                {courseNamesForRow(row)}
                {sizeLabel ? ` · ${sizeLabel}` : ""}
              </Text>
            </View>
            <Badge
              label={row.is_published ? "Publicado" : "Rascunho"}
              slug={row.is_published ? "published" : "draft"}
            />
          </View>
          <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <View className="flex-row items-center gap-2">
              <Text className="text-[10px] text-gray-400">Publicado</Text>
              <Switch value={row.is_published} onValueChange={(v) => togglePublished(row, v)} />
            </View>
            <View className="flex-row gap-1">
              {row.content ? (
                <TouchableOpacity
                  onPress={() => window.open(row.content, "_blank", "noopener,noreferrer")}
                  className="p-2 rounded-lg bg-blue-50"
                  accessibilityLabel="Abrir PDF"
                >
                  <Ionicons name="open-outline" size={15} color="#3B82F6" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => openEdit(row)}
                className="p-2 rounded-lg bg-violet-50"
                accessibilityLabel="Editar prova"
              >
                <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDeleteId(row.id)}
                className="p-2 rounded-lg bg-red-50"
                accessibilityLabel="Remover prova"
              >
                <Ionicons name="trash-outline" size={15} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View
        key={row.id}
        className={`flex-row items-center px-4 py-3 ${
          index < rows.length - 1 ? "border-b border-gray-50" : ""
        }`}
      >
        <View style={{ flex: 3 }}>
          <Text className="text-sm font-medium text-gray-800">{row.title}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {row.material_kind_label ?? "Prova"}
            {row.exam_type_label ? ` · ${row.exam_type_label}` : ""}
            {sizeLabel ? ` · ${sizeLabel}` : ""}
          </Text>
        </View>
        <Text className="text-sm text-gray-600" style={{ width: 108 }}>
          {dateLabel}
        </Text>
        <Text className="text-sm text-gray-600" style={{ flex: 2 }} numberOfLines={1}>
          {row.subject?.name ?? "—"}
        </Text>
        <Text className="text-sm text-gray-600" style={{ flex: 2 }} numberOfLines={2}>
          {courseNamesForRow(row)}
        </Text>
        <View style={{ width: 100, alignItems: "center" }}>
          <Badge
            label={row.is_published ? "Publicado" : "Rascunho"}
            slug={row.is_published ? "published" : "draft"}
          />
        </View>
        <View style={{ width: 72, alignItems: "center" }}>
          <Switch value={row.is_published} onValueChange={(v) => togglePublished(row, v)} />
        </View>
        <View className="flex-row gap-1" style={{ width: 108, justifyContent: "flex-end" }}>
          {row.content ? (
            <TouchableOpacity
              onPress={() => window.open(row.content, "_blank", "noopener,noreferrer")}
              className="p-2 rounded-lg bg-blue-50"
              accessibilityLabel="Abrir PDF"
            >
              <Ionicons name="open-outline" size={15} color="#3B82F6" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => openEdit(row)}
            className="p-2 rounded-lg bg-violet-50"
            accessibilityLabel="Editar prova"
          >
            <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDeleteId(row.id)}
            className="p-2 rounded-lg bg-red-50"
            accessibilityLabel="Remover prova"
          >
            <Ionicons name="trash-outline" size={15} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const save = async () => {
    if (saving) return;

    const localErrors: Record<string, string> = {};
    if (!form.title.trim()) localErrors.title = "Título obrigatório";
    if (!form.exam_type) {
      localErrors.exam_type =
        examTypeFormOptions.length === 0
          ? "Nenhum tipo de prova cadastrado. Cadastre em Administração → Tipos de prova."
          : "Selecione a classificação da prova.";
    }
    if (!editingId && !pdfFile) localErrors.file = "Selecione o arquivo PDF da prova.";
    const examDateError = validateExamDateField(form.exam_date, form.material_kind);
    if (examDateError) localErrors.exam_date = examDateError;
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      setToast({
        visible: true,
        type: "error",
        message: "Corrija os campos destacados antes de salvar.",
      });
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
          exam_type: form.exam_type,
          material_kind: form.material_kind,
          subject_id: form.subject_id ? Number(form.subject_id) : null,
          course_ids: form.course_ids,
          is_published: form.is_published === "true",
        };
        const { data } = await api.put(`/past-exams/${editingId}`, payload);
        if (pdfFile) {
          const fileData = new FormData();
          fileData.append("file", pdfFile);
          await api.post(`/past-exams/${editingId}/replace-file`, fileData);
        }
        setToast({
          visible: true,
          type: "success",
          message: pdfFile
            ? "Prova e arquivo atualizados."
            : (data?.message ?? "Prova atualizada."),
        });
      } else {
        const formData = new FormData();
        formData.append("title", form.title.trim());
        if (form.description.trim()) formData.append("description", form.description.trim());
        const examDateIso = displayToISO(form.exam_date);
        if (examDateIso) {
          formData.append("exam_date", examDateIso);
        }
        formData.append("exam_type", form.exam_type);
        formData.append("material_kind", form.material_kind);
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
      setErrors(
        mapPastExamApiErrors(
          e?.response?.data?.body?.errors ?? e?.response?.data?.errors ?? {}
        )
      );
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

  const hasFormErrors = Object.keys(errors).length > 0;

  return (
    <>
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
          <Text className="text-2xl font-bold text-gray-800">Provas anteriores</Text>
          <Text className="text-sm text-gray-500">
            Biblioteca de provas e exercícios em PDF visível no app do aluno
          </Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">Novo material</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-4 gap-3">
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
            flexDirection: isMobile ? "column" : "row",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <View
            className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
            style={{ height: 44, minWidth: isMobile ? "100%" : 260, flex: isMobile ? undefined : 2 }}
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
            {examTypeFilterOptions.map((option) => (
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

          <select
            value={filterMaterialKind}
            onChange={(e: any) => {
              setFilterMaterialKind(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            {MATERIAL_KIND_OPTIONS.map((option) => (
              <option key={option.value || "all-kinds"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </View>

      </View>

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
          {!isMobile ? (
            <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 3 }}
              >
                Título / Tipo
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ width: 108 }}
              >
                Data
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 2 }}
              >
                Disciplina
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ flex: 2 }}
              >
                Cursos
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ width: 100, textAlign: "center" }}
              >
                Status
              </Text>
              <Text
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                style={{ width: 72, textAlign: "center" }}
              >
                Publicar
              </Text>
              <View style={{ width: 108 }} />
            </View>
          ) : null}

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : rows.length === 0 ? (
            <View className="py-16 items-center gap-2 px-4">
              <Ionicons name="document-text-outline" size={32} color="#D1D5DB" />
              <Text className="text-sm text-gray-400 text-center">
                {hasActiveFilters
                  ? "Nenhuma prova encontrada com os filtros selecionados."
                  : "Nenhuma prova cadastrada."}
              </Text>
            </View>
          ) : (
            rows.map((row, index) => renderTableRow(row, index))
          )}
        </View>
      </ScrollView>

      {meta.last_page > 1 ? (
        <View className="mt-4">
          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onPageChange={setPage}
          />
        </View>
      ) : null}
    </ScrollView>

    <Modal
        visible={modalOpen}
        title={editingId ? "Editar prova anterior" : "Nova prova anterior"}
        onClose={closeModal}
        size="lg"
        scrollViewClassName="py-0"
        footer={
          <>
            <TouchableOpacity
              onPress={closeModal}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white items-center"
              style={{ flex: 1 }}
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              className="bg-violet-600 px-5 py-2.5 rounded-xl items-center"
              style={{ flex: 1, zIndex: 2 }}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white text-sm font-semibold">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        <View className="gap-1">
          {hasFormErrors ? (
            <View className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 flex-row items-start gap-2">
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text className="flex-1 text-xs text-red-700">
                {Object.values(errors).join(" ")}
              </Text>
            </View>
          ) : null}
          <FormInput
            label="Título"
            required
            value={form.title}
            onChangeText={(title) => setForm((p) => ({ ...p, title }))}
            error={errors.title}
          />

          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 12 }}>
            <View style={{ flex: 1, minWidth: compactStack ? undefined : 220 }}>
              <DatePickerInput
                label={form.material_kind === "prova" ? "Ano / data da prova" : "Data (opcional)"}
                required={form.material_kind === "prova"}
                value={form.exam_date}
                onChangeText={(exam_date) => {
                  setForm((p) => ({ ...p, exam_date }));
                  if (errors.exam_date) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.exam_date;
                      return next;
                    });
                  }
                }}
                error={errors.exam_date}
              />
            </View>
            <View style={{ flex: 1, minWidth: compactStack ? undefined : 200 }}>
              <FormSelect
                label="Publicar"
                value={form.is_published}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Não" },
                ]}
                onChange={(is_published) => setForm((p) => ({ ...p, is_published }))}
              />
            </View>
          </View>

          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormSelect
                label="Tipo"
                required
                value={form.material_kind}
                options={MATERIAL_KIND_FORM_OPTIONS}
                onChange={(material_kind) =>
                  setForm((p) => ({ ...p, material_kind: material_kind as PastExamMaterialKind }))
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormSelect
                label="Classificação"
                required
                value={form.exam_type}
                options={examTypeFormOptions}
                placeholder="Selecione a classificação"
                onChange={(exam_type) => {
                  setForm((p) => ({ ...p, exam_type }));
                  if (errors.exam_type) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.exam_type;
                      return next;
                    });
                  }
                }}
                error={errors.exam_type}
              />
            </View>
          </View>

          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 12 }}>
            <View style={{ flex: 1, minWidth: compactStack ? undefined : 240 }}>
              <SearchableSelect
                key={coursePickerKey}
                label="Cursos"
                placeholder={
                  courseOptions.length === 0
                    ? "Nenhum curso disponível"
                    : availableCourseOptions.length === 0
                      ? "Todos os cursos já foram adicionados"
                      : "Buscar e adicionar curso..."
                }
                modalTitle="Adicionar curso"
                options={availableCourseOptions}
                value=""
                disabled={courseOptions.length === 0 || availableCourseOptions.length === 0}
                onChange={addCourseFromPicker}
              />
              <Text className="text-xs text-gray-400 -mt-2 mb-1">
                Opcional. Sem curso, todos os alunos da escola veem a prova.
              </Text>
              {form.course_ids.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 mt-1">
                  {form.course_ids.map((id) => {
                    const course = courseOptions.find((c) => c.id === id);
                    return (
                      <View
                        key={id}
                        className="flex-row items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1"
                      >
                        <Text className="text-xs font-semibold text-violet-800">
                          {course?.name ?? `Curso #${id}`}
                        </Text>
                        <TouchableOpacity
                          onPress={() => removeCourse(id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityLabel={`Remover ${course?.name ?? "curso"}`}
                        >
                          <Ionicons name="close-circle" size={16} color="#7C3AED" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: compactStack ? undefined : 240 }}>
              <SearchableSelect
                label="Disciplina"
                value={form.subject_id}
                options={subjectOptions.filter((o) => o.value !== "")}
                placeholder="Nenhuma (opcional)"
                modalTitle="Selecionar disciplina"
                onChange={(subject_id) => setForm((p) => ({ ...p, subject_id }))}
              />
            </View>
          </View>

          <FormInput
            label="Descrição"
            value={form.description}
            onChangeText={(description) => setForm((p) => ({ ...p, description }))}
          />

          {renderPdfField()}
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
    </>
  );
}
