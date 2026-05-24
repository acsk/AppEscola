import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../services/api";
import { parseApiErrors } from "../../utils/apiErrors";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import ToastBanner from "../../components/ui/ToastBanner";
import type { WithNavigate } from "../../types/navigation";

type PastExamRow = {
  id: number;
  title: string;
  description: string | null;
  exam_year: number | null;
  exam_type: string | null;
  exam_type_label: string | null;
  type: "file";
  content: string;
  is_published: boolean;
  subject: { id: number; name: string } | null;
  course: { id: number; name: string } | null;
};

const EXAM_TYPE_OPTIONS = [
  { value: "", label: "Nenhum" },
  { value: "enem", label: "ENEM" },
  { value: "vestibular", label: "Vestibular" },
  { value: "fuvest", label: "FUVEST" },
  { value: "concurso", label: "Concurso" },
  { value: "custom", label: "Outro" },
];

const EMPTY_FORM = {
  title: "",
  description: "",
  exam_year: "",
  exam_type: "",
  course_id: "",
  subject_id: "",
  is_published: "true",
};

const MAX_PDF_UPLOAD_KB = 150;
const MAX_PDF_UPLOAD_BYTES = MAX_PDF_UPLOAD_KB * 1024;
const PDF_SIZE_ERROR = `O PDF deve ter no máximo ${MAX_PDF_UPLOAD_KB} kB.`;

export default function PastExamsScreen({ navigate }: WithNavigate) {
  const { width } = useWindowDimensions();
  const compactStack = width < 640;
  const [rows, setRows] = useState<PastExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [courseOptions, setCourseOptions] = useState<{ value: string; label: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/past-exams", { params: { per_page: 100 } });
      const body = data?.body ?? data;
      setRows(body?.data ?? body ?? []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          api.get("/courses", { params: { per_page: 200 } }),
          api.get("/subjects", { params: { status: "active", per_page: 200 } }),
        ]);
        setCourseOptions([
          { value: "", label: "Todos os cursos" },
          ...(cRes.data.data ?? cRes.data).map((c: { id: number; name: string }) => ({
            value: String(c.id),
            label: c.name,
          })),
        ]);
        setSubjectOptions([
          { value: "", label: "Nenhuma" },
          ...(sRes.data.data ?? sRes.data).map((s: { id: number; name: string }) => ({
            value: String(s.id),
            label: s.name,
          })),
        ]);
      } catch {}
    })();
  }, [fetchRows]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setPdfFile(null);
    setErrors({});
    setModalOpen(true);
  };

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
    if (!pdfFile) localErrors.file = "Selecione o arquivo PDF da prova.";
    if (pdfFile && pdfFile.size > MAX_PDF_UPLOAD_BYTES) localErrors.file = PDF_SIZE_ERROR;
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("title", form.title.trim());
      if (form.description.trim()) formData.append("description", form.description.trim());
      if (form.exam_year) formData.append("exam_year", form.exam_year);
      if (form.exam_type) formData.append("exam_type", form.exam_type);
      if (form.course_id) formData.append("course_id", form.course_id);
      if (form.subject_id) formData.append("subject_id", form.subject_id);
      formData.append("is_published", form.is_published === "true" ? "1" : "0");
      formData.append("file", pdfFile as File);

      const { data } = await api.post("/past-exams/upload", formData);
      setToast({
        visible: true,
        type: "success",
        message: data?.message ?? "Prova cadastrada.",
      });
      setModalOpen(false);
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

      {loading ? (
        <ActivityIndicator size="large" color="#7C3AED" />
      ) : rows.length === 0 ? (
        <Text className="text-gray-400">Nenhuma prova cadastrada.</Text>
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
                  {[row.exam_year, row.exam_type_label, row.subject?.name, row.course?.name]
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
              <TouchableOpacity onPress={() => setDeleteId(row.id)}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={modalOpen}
        title="Nova prova anterior"
        onClose={() => setModalOpen(false)}
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
              {renderFieldLabel("Ano")}
              <input
                value={form.exam_year}
                inputMode="numeric"
                onChange={(e: any) =>
                  setForm((p) => ({
                    ...p,
                    exam_year: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                style={fieldStyle}
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
                {EXAM_TYPE_OPTIONS.map((option) => (
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

          <View style={{ flexDirection: compactStack ? "column" : "row", gap: 10 }}>
            <View className="flex-1">
              {renderFieldLabel("Curso")}
              <select
                value={form.course_id}
                onChange={(e: any) => setForm((p) => ({ ...p, course_id: e.target.value }))}
                style={fieldStyle}
              >
                {courseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
          </View>

          <View className="flex-1">
            {renderFieldLabel("Descrição")}
            <input
              value={form.description}
              onChange={(e: any) => setForm((p) => ({ ...p, description: e.target.value }))}
              style={fieldStyle}
            />
          </View>

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
