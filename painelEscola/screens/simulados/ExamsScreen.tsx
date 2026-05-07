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
import {
  Calculator, BookOpen, FlaskConical, Landmark, Globe,
  Dumbbell, Languages, Atom, Music, Palette, Code2,
  Brain, BookMarked, GraduationCap, Microscope, Earth,
  Lightbulb, PenLine, Sigma,
} from "lucide-react-native";
import api from "../../services/api";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Modal from "../../components/ui/Modal";
import { useExamStatuses, useExamTypes } from "../../hooks/useDomains";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

// ── Subject icon helpers ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  calculator: Calculator, "book-open": BookOpen, "flask-conical": FlaskConical,
  landmark: Landmark, globe: Globe, dumbbell: Dumbbell, languages: Languages,
  atom: Atom, music: Music, palette: Palette, code2: Code2, brain: Brain,
  "book-marked": BookMarked, "graduation-cap": GraduationCap, microscope: Microscope,
  earth: Earth, lightbulb: Lightbulb, "pen-line": PenLine, sigma: Sigma,
};

function SubjectIcon({ icon, color, size = 18 }: { icon?: string | null; color?: string | null; size?: number }) {
  const bg = color ?? "#8B5CF6";
  const IconComp = icon ? ICON_MAP[icon] : null;
  return (
    <View style={{ width: size + 12, height: size + 12, borderRadius: 8, backgroundColor: bg + "22", alignItems: "center", justifyContent: "center" }}>
      {IconComp ? <IconComp size={size} color={bg} strokeWidth={2} /> : <Ionicons name="book-outline" size={size} color={bg} />}
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Exam = {
  id: number;
  title: string;
  exam_type: string;
  exam_type_label: string;
  status: string;
  status_label: string;
  duration_minutes: number | null;
  passing_score: number | null;
  release_results_after_end?: boolean;
  total_questions: number;
  total_points: number;
  course: { id: number; name: string } | null;
  subject: { id: number; name: string; icon: string | null; color: string | null } | null;
};

type PreviewQuestion = {
  id: number;
  type: "multiple_choice" | "essay";
  question_text: string;
  image_url: string | null;
  video_url: string | null;
  points: number;
  order: number;
  options: { id: number; option_text: string; order: number; triggers_text_input: boolean }[];
};

interface Props {
  navigate: (screen: string, params?: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExamsScreen({ navigate }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const examStatuses = useExamStatuses();
  const examTypes = useExamTypes();

  const [rows, setRows] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Summary de tentativas
  type Summary = { in_progress: number; pending_review: number; awaiting_release: number; completed: number; total: number };
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/exam-attempts/summary");
      setSummary(data.body ?? data);
    } catch {}
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Preview
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSelected, setPreviewSelected] = useState<Record<number, number | null>>({});
  const [previewTexts, setPreviewTexts] = useState<Record<number, string>>({});

  const openPreview = async (exam: Exam) => {
    setPreviewExam(exam);
    setPreviewSelected({});
    setPreviewTexts({});
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/exams/${exam.id}/questions`);
      setPreviewQuestions(data.body ?? data);
    } catch {}
    setPreviewLoading(false);
  };

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.exam_type = typeFilter;
      const { data } = await api.get("/exams", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter, typeFilter]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/exams/${deleteId}`);
      setDeleteId(null);
      fetchExams();
    } catch {}
    setDeleting(false);
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
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-2xl font-bold text-gray-800">Simulados</Text>
          <Text className="text-sm text-gray-500">
            Crie e gerencie simulados com questões objetivas e discursivas
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigate("simulados-form", { examId: null })}
          className="flex-row items-center bg-violet-600 px-5 py-2.5 rounded-xl"
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white font-semibold text-sm ml-1.5">
            Novo Simulado
          </Text>
        </TouchableOpacity>
      </View>

      {/* Cards de resumo de tentativas */}
      {summary !== null && (
        <View className="flex-row gap-3 mb-5 flex-wrap">
          <TouchableOpacity
            onPress={() => navigate("simulados-tentativas", { status: "in_progress" })}
            className="flex-1 bg-white rounded-2xl p-4 border border-gray-100"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="time-outline" size={15} color="#F59E0B" />
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Em andamento</Text>
            </View>
            <Text className="text-3xl font-bold text-gray-800">{summary.in_progress}</Text>
            <Text className="text-xs text-gray-400 mt-1">realizando agora</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigate("simulados-tentativas", { status: "pending_review" })}
            className="flex-1 rounded-2xl p-4 border"
            style={{
              shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, minWidth: 140,
              backgroundColor: summary.pending_review > 0 ? '#FFFBEB' : 'white',
              borderColor: summary.pending_review > 0 ? '#FDE68A' : '#FEF3C7',
            }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="create-outline" size={15} color="#D97706" />
              <Text className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Corrigir</Text>
              {summary.pending_review > 0 && (
                <View className="bg-amber-500 rounded-full px-1.5" style={{ marginLeft: 'auto' }}>
                  <Text className="text-white text-xs font-bold">{summary.pending_review}</Text>
                </View>
              )}
            </View>
            <Text className="text-3xl font-bold" style={{ color: summary.pending_review > 0 ? '#D97706' : '#1F2937' }}>
              {summary.pending_review}
            </Text>
            <Text className="text-xs text-amber-500 mt-1">aguardam correção</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigate("simulados-tentativas", { status: "awaiting_release" })}
            className="flex-1 bg-white rounded-2xl p-4 border border-cyan-100"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="lock-closed-outline" size={15} color="#0891B2" />
              <Text className="text-xs font-semibold text-cyan-600 uppercase tracking-wide">Aguardando</Text>
            </View>
            <Text className="text-3xl font-bold" style={{ color: summary.awaiting_release > 0 ? '#0891B2' : '#1F2937' }}>
              {summary.awaiting_release}
            </Text>
            <Text className="text-xs text-gray-400 mt-1">aguardam liberação</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigate("simulados-tentativas", { status: "completed" })}
            className="flex-1 bg-white rounded-2xl p-4 border border-green-100"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
              <Text className="text-xs font-semibold text-green-600 uppercase tracking-wide">Concluídas</Text>
            </View>
            <Text className="text-3xl font-bold text-gray-800">{summary.completed}</Text>
            <Text className="text-xs text-gray-400 mt-1">finalizadas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigate("simulados-tentativas")}
            className="bg-white rounded-2xl p-4 border border-violet-100"
            style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, minWidth: 140, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={20} color="#7C3AED" />
            <Text className="text-xs font-semibold text-violet-600 mt-1">Ver todas</Text>
            <Text className="text-xs text-gray-400">{summary.total} tentativas</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 12 }}>
        <View
          className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4"
          style={{ height: 44, minWidth: isMobile ? "100%" : 260, flex: 1 }}
        >
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar por título..."
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
          onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Todos os status</option>
          {examStatuses.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e: any) => { setTypeFilter(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Todos os tipos</option>
          {examTypes.map((t) => (
            <option key={t.slug} value={t.slug}>{t.label}</option>
          ))}
        </select>
      </View>

      {/* Tabela */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={isMobile}
        style={{ width: "100%" }}
        contentContainerStyle={{ width: isMobile ? undefined : "100%" }}
      >
      <View
        className="bg-white rounded-2xl overflow-hidden"
        style={{ width: "100%", minWidth: tableMinWidth, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
      >
        <View className="flex-row bg-gray-50 border-b border-gray-100 px-4 py-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 3 }}>
            Título / Tipo
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ flex: 2 }}>
            Curso / Matéria
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 90, textAlign: "center" }}>
            Questões
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 90, textAlign: "center" }}>
            Duração
          </Text>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: 90, textAlign: "center" }}>
            Status
          </Text>
          <View style={{ width: 80 }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center gap-2">
            <Ionicons name="document-text-outline" size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400">Nenhum simulado encontrado</Text>
          </View>
        ) : (
          rows.map((exam, i) => (
            <View
              key={exam.id}
              className={`flex-row items-center px-4 py-3 ${i < rows.length - 1 ? "border-b border-gray-50" : ""}`}
            >
              <View style={{ flex: 3 }}>
                <Text className="text-sm font-medium text-gray-800">{exam.title}</Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {exam.exam_type_label ?? exam.exam_type}
                </Text>
              </View>
              <View style={{ flex: 2 }}>
                <Text className="text-sm text-gray-700">
                  {exam.course?.name ?? <Text className="text-gray-400">—</Text>}
                </Text>
                {exam.subject ? (
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <SubjectIcon icon={exam.subject.icon} color={exam.subject.color} size={12} />
                    <Text className="text-xs text-gray-500">{exam.subject.name}</Text>
                  </View>
                ) : (
                  <Text className="text-xs text-gray-400">—</Text>
                )}
              </View>
              <View style={{ width: 90, alignItems: "center" }}>
                <Text className="text-sm text-gray-700">{exam.total_questions}</Text>
                <Text className="text-xs text-gray-400">{exam.total_points} pts</Text>
              </View>
              <View style={{ width: 90, alignItems: "center" }}>
                <Text className="text-sm text-gray-700">
                  {exam.duration_minutes ? `${exam.duration_minutes} min` : "—"}
                </Text>
              </View>
              <View style={{ width: 90, alignItems: "center" }}>
                <Badge
                  label={exam.status_label ?? exam.status}
                  slug={exam.status}
                />
              </View>
              <View className="flex-row gap-1" style={{ width: 108, justifyContent: "flex-end" }}>
                <TouchableOpacity
                  onPress={() => openPreview(exam)}
                  className="p-2 rounded-lg bg-blue-50"
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={15} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigate("simulados-form", { examId: exam.id })}
                  className="p-2 rounded-lg bg-violet-50"
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil-outline" size={15} color="#7C3AED" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteId(exam.id)}
                  className="p-2 rounded-lg bg-red-50"
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>

      {/* Paginação */}
      {meta.last_page > 1 && (
        <View className="mt-4">
          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onPageChange={setPage}
          />
        </View>
      )}

      {/* Total */}
      {!loading && (
        <Text className="text-xs text-gray-400 mt-3 text-center">
          {meta.total} simulado{meta.total !== 1 ? "s" : ""} encontrado{meta.total !== 1 ? "s" : ""}
        </Text>
      )}

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover simulado"
        message="Tem certeza que deseja remover este simulado? Esta ação não poderá ser desfeita."
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── Modal de Pré-visualização ───────────────────────────────────────── */}
      <Modal
        visible={previewExam !== null}
        title="Pré-visualização do Simulado"
        onClose={() => setPreviewExam(null)}
        size="lg"
      >
        {previewExam && (
          <View>
            {/* Banner de aviso */}
            <View
              className="flex-row items-center gap-2 mb-5 px-4 py-3 rounded-xl"
              style={{ backgroundColor: "#EFF6FF" }}
            >
              <Ionicons name="eye-outline" size={16} color="#3B82F6" />
              <Text className="text-sm text-blue-700 font-medium flex-1">
                Pré-visualização — as interações não serão salvas.
              </Text>
            </View>

            {/* Cabeçalho do simulado */}
            <View
              className="mb-6 p-5 rounded-2xl border border-gray-100"
              style={{ backgroundColor: "#FAFAFA" }}
            >
              <View className="flex-row items-start justify-between gap-4 mb-3">
                <Text className="text-xl font-bold text-gray-800 flex-1">
                  {previewExam.title}
                </Text>
                <Badge label={previewExam.exam_type_label ?? previewExam.exam_type} slug={previewExam.exam_type} />
              </View>
              <View className="flex-row gap-4 flex-wrap">
                {previewExam.duration_minutes != null && (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={14} color="#6B7280" />
                    <Text className="text-sm text-gray-500">{previewExam.duration_minutes} min</Text>
                  </View>
                )}
                {previewExam.passing_score != null && (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="ribbon-outline" size={14} color="#6B7280" />
                    <Text className="text-sm text-gray-500">Mínimo: {previewExam.passing_score}%</Text>
                  </View>
                )}
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="help-circle-outline" size={14} color="#6B7280" />
                  <Text className="text-sm text-gray-500">
                    {previewExam.total_questions} questão{previewExam.total_questions !== 1 ? "ões" : ""}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="star-outline" size={14} color="#6B7280" />
                  <Text className="text-sm text-gray-500">{previewExam.total_points} pontos</Text>
                </View>
                {previewExam.course && (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="book-outline" size={14} color="#6B7280" />
                    <Text className="text-sm text-gray-500">{previewExam.course.name}</Text>
                  </View>
                )}
                {previewExam.subject && (
                  <View className="flex-row items-center gap-1.5">
                    <SubjectIcon icon={previewExam.subject.icon} color={previewExam.subject.color} size={14} />
                    <Text className="text-sm text-gray-500">{previewExam.subject.name}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Questões */}
            {previewLoading ? (
              <View className="py-12 items-center">
                <ActivityIndicator color="#7C3AED" />
              </View>
            ) : previewQuestions.length === 0 ? (
              <View className="py-10 items-center gap-2">
                <Ionicons name="help-circle-outline" size={32} color="#D1D5DB" />
                <Text className="text-sm text-gray-400">Nenhuma questão cadastrada</Text>
              </View>
            ) : (
              previewQuestions.map((q) => {
                const selected = previewSelected[q.id];
                return (
                  <View
                    key={q.id}
                    className="mb-5 rounded-2xl border border-gray-100 overflow-hidden"
                  >
                    {/* Cabeçalho da questão */}
                    <View
                      className="flex-row items-center justify-between px-5 py-3"
                      style={{ backgroundColor: "#F5F3FF" }}
                    >
                      <View className="flex-row items-center gap-2">
                        <View
                          className="items-center justify-center rounded-lg"
                          style={{ width: 28, height: 28, backgroundColor: "#7C3AED" }}
                        >
                          <Text className="text-xs font-bold text-white">{q.order}</Text>
                        </View>
                        <Text className="text-xs font-semibold text-violet-700">
                          {q.type === "essay"
                            ? "Discursiva"
                            : q.options.some((o) => o.triggers_text_input)
                            ? 'Objetiva c/ "Outro"'
                            : "Objetiva"}
                        </Text>
                      </View>
                      <Text className="text-xs text-violet-600 font-semibold">
                        {q.points} pt{q.points !== 1 ? "s" : ""}
                      </Text>
                    </View>

                    <View className="px-5 py-4">
                      {/* Enunciado */}
                      <Text className="text-sm font-medium text-gray-800 mb-4 leading-relaxed">
                        {q.question_text}
                      </Text>

                      {/* Imagem opcional */}
                      {q.image_url && (
                        <View
                          className="mb-4 rounded-xl overflow-hidden items-center justify-center"
                          style={{ backgroundColor: "#F3F4F6", height: 160 }}
                        >
                          <Ionicons name="image-outline" size={28} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400 mt-1 px-4 text-center" numberOfLines={1}>
                            {q.image_url}
                          </Text>
                        </View>
                      )}

                      {/* Opções – objetiva */}
                      {q.type === "multiple_choice" &&
                        q.options.map((opt) => {
                          const isSelected = selected === opt.id;
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              onPress={() => {
                                const newId = isSelected ? null : opt.id;
                                setPreviewSelected((prev) => ({ ...prev, [q.id]: newId }));
                                if (isSelected || !opt.triggers_text_input) {
                                  setPreviewTexts((prev) => ({ ...prev, [q.id]: "" }));
                                }
                              }}
                              activeOpacity={0.75}
                              className={`flex-row items-center gap-3 mb-2.5 px-4 py-3 rounded-xl border ${
                                isSelected
                                  ? "border-violet-400 bg-violet-50"
                                  : "border-gray-200 bg-white"
                              }`}
                            >
                              <View
                                className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                                  isSelected ? "border-violet-500" : "border-gray-300"
                                }`}
                              >
                                {isSelected && (
                                  <View
                                    className="rounded-full bg-violet-500"
                                    style={{ width: 10, height: 10 }}
                                  />
                                )}
                              </View>
                              <Text
                                className={`text-sm flex-1 ${
                                  isSelected ? "text-violet-800 font-medium" : "text-gray-700"
                                }`}
                              >
                                {opt.option_text}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                      {/* Textarea – discursiva */}
                      {q.type === "essay" && (
                        <textarea
                          value={previewTexts[q.id] ?? ""}
                          onChange={(e: any) =>
                            setPreviewTexts((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Escreva sua resposta aqui..."
                          rows={4}
                          style={{
                            width: "100%",
                            border: "1px solid #E5E7EB",
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 14,
                            color: "#1F2937",
                            backgroundColor: "#F9FAFB",
                            resize: "vertical" as const,
                            fontFamily: "inherit",
                            outline: "none",
                          }}
                        />
                      )}
                      {/* Textarea – opção com triggers_text_input */}
                      {q.type === "multiple_choice" &&
                        selected != null &&
                        q.options.find((o) => o.id === selected)?.triggers_text_input && (
                          <View className="mt-3">
                            <Text className="text-xs font-semibold text-gray-500 mb-2">
                              Especifique:
                            </Text>
                            <textarea
                              value={previewTexts[q.id] ?? ""}
                              onChange={(e: any) =>
                                setPreviewTexts((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder="Especifique..."
                              rows={3}
                              style={{
                                width: "100%",
                                border: "1px solid #E5E7EB",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                color: "#1F2937",
                                backgroundColor: "#F9FAFB",
                                resize: "vertical" as const,
                                fontFamily: "inherit",
                                outline: "none",
                              }}
                            />
                          </View>
                        )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Rodapé visual – botão de finalizar */}
            {!previewLoading && previewQuestions.length > 0 && (
              <View
                className="mt-2 mb-4 rounded-2xl border border-dashed border-gray-300 items-center py-6 gap-2"
              >
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />
                <Text className="text-sm text-gray-400">
                  Na versão do aluno, aqui apareceria o botão "Finalizar Simulado"
                </Text>
              </View>
            )}
          </View>
        )}
      </Modal>
    </ScrollView>
  );
}
