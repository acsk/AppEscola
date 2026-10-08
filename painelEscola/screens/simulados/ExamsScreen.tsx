import React, { useState, useEffect, useCallback } from "react";
import { hashQuery } from "../../utils/questionBankQuery";
import { parseExamsListState, serializeExamsListState, type ExamsListState } from "../../utils/examsQuery";
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
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import ExamPreviewPlayer from "../../components/simulados/ExamPreviewPlayer";
import ExamActionsModal, {
  ExamDeliveryReportsModal,
  type ExamActionKey,
} from "../../components/simulados/ExamActionsModal";
import ExamQuestionErrorsReportModal from "../../components/simulados/ExamQuestionErrorsReportModal";
import { mapApiPreviewQuestion } from "../../components/simulados/examPreviewUtils";
import { fetchExamDeliveryReport } from "../../services/examDeliveryReport";
import {
  exportExamDeliveryPdf,
  type ExamDeliveryPdfKind,
} from "../../utils/examDeliveryPdf";
import ToastBanner from "../../components/ui/ToastBanner";
import ExamTypeLogo from "../../components/ui/ExamTypeLogo";
import { showApiErrorToast } from "../../utils/apiErrors";
import { canManageExams } from "../../utils/permissions";
import { useAuth } from "../../contexts/AuthContext";
import type {
  ExamListItem,
  ExamPreviewPlayerQuestion,
  ExamsScreenProps,
} from "../../types/simulados";

const PDF_KIND_SUCCESS_MESSAGE: Record<ExamDeliveryPdfKind, string> = {
  pending: "PDF de quem não entregou gerado com sucesso.",
  delivered: "PDF de quem entregou gerado com sucesso.",
  completed: "PDF de resultado completo gerado com sucesso.",
  pending_review: "PDF parcial (aguardando correção) gerado com sucesso.",
  awaiting_release: "PDF parcial (aguardando liberação) gerado com sucesso.",
};

// ── Subject icon helpers ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  calculator: Calculator, "book-open": BookOpen, "flask-conical": FlaskConical,
  landmark: Landmark, globe: Globe, dumbbell: Dumbbell, languages: Languages,
  atom: Atom, music: Music, palette: Palette, code2: Code2, brain: Brain,
  "book-marked": BookMarked, "graduation-cap": GraduationCap, microscope: Microscope,
  earth: Earth, lightbulb: Lightbulb, "pen-line": PenLine, sigma: Sigma,
};

/** Ícone da matéria como ícone de linha na cor do texto (o design system aboliu ícones em quadrados coloridos). */
function SubjectIcon({ icon, size = 16 }: { icon?: string | null; color?: string | null; size?: number }) {
  const IconComp = icon ? ICON_MAP[icon] : null;
  return IconComp ? (
    <IconComp size={size} color="var(--ds-ink-muted)" strokeWidth={1.5} />
  ) : (
    <Ionicons name="book-outline" size={size} color="var(--ds-ink-muted)" />
  );
}

function fmtRespondedPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

const LIST_HASH = "#/simulados";
const SEARCH_DEBOUNCE_MS = 300;

function readStateFromHash(): ExamsListState {
  return parseExamsListState(typeof window === "undefined" ? "" : hashQuery(window.location.hash));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExamsScreen({ navigate }: ExamsScreenProps) {
  const { user } = useAuth();
  const allowManageExams = canManageExams(user?.role);
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const examStatuses = useExamStatuses();
  const examTypes = useExamTypes();

  const [rows, setRows] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ExamsListState>(readStateFromHash);
  const [searchText, setSearchText] = useState(state.search);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuExam, setMenuExam] = useState<ExamListItem | null>(null);
  const [reportsExam, setReportsExam] = useState<ExamListItem | null>(null);
  const [errorsReportExam, setErrorsReportExam] = useState<ExamListItem | null>(null);
  const [exportingPdfKind, setExportingPdfKind] = useState<ExamDeliveryPdfKind | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

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

  const updateState = useCallback((next: ExamsListState, options: { replace?: boolean } = {}) => {
    const query = serializeExamsListState(next);
    const hash = query ? `${LIST_HASH}?${query}` : LIST_HASH;
    setState(next);
    if (typeof window === "undefined") return;
    if (options.replace) {
      window.history.replaceState(window.history.state, "", hash);
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  const listQuery = serializeExamsListState({ ...state, search: searchText });
  const openListTarget = (screen: string, params: Record<string, unknown> = {}) => {
    navigate(screen, listQuery ? { ...params, query: listQuery } : params);
  };

  // Voltar/avançar do navegador restaura busca, status, tipo e página.
  useEffect(() => {
    const onHashChange = () => {
      if (/^#\/simulados(\?|$)/.test(window.location.hash)) {
        const next = readStateFromHash();
        setState(next);
        setSearchText(next.search);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Busca com debounce (substitui a entrada do histórico para não criar um passo por tecla).
  useEffect(() => {
    if (searchText === state.search) return;
    const timer = setTimeout(() => updateState({ ...state, search: searchText, page: 1 }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, state, updateState]);

  // Preview
  const [previewExam, setPreviewExam] = useState<ExamListItem | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<ExamPreviewPlayerQuestion[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = async (exam: ExamListItem) => {
    setPreviewExam(exam);
    setPreviewQuestions([]);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/exams/${exam.id}/questions`);
      const raw = data.body ?? data;
      const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setPreviewQuestions(items.map((q: Parameters<typeof mapApiPreviewQuestion>[0]) => mapApiPreviewQuestion(q)));
    } catch {
      setPreviewQuestions([]);
    }
    setPreviewLoading(false);
  };

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: state.page };
      if (state.search) params.search = state.search;
      if (state.status) params.status = state.status;
      if (state.examType) params.exam_type = state.examType;
      const { data } = await api.get("/exams", { params });
      setRows(data.data);
      setMeta(data.meta);
    } catch {}
    setLoading(false);
  }, [state.page, state.search, state.status, state.examType]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const remove = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/exams/${deleteId}`);
      setDeleteId(null);
      setToast({ visible: true, type: "success", message: data?.message ?? "Simulado removido." });
      fetchExams();
    } catch (error) {
      setDeleteId(null);
      showApiErrorToast(setToast, error, "Não foi possível excluir o simulado.");
    }
    setDeleting(false);
  };

  const handleExportDeliveryPdf = async (
    exam: ExamListItem,
    kind: ExamDeliveryPdfKind,
  ) => {
    setExportingPdfKind(kind);
    try {
      const report = await fetchExamDeliveryReport(exam.id);
      await exportExamDeliveryPdf(report, kind);
      setReportsExam(null);
      setMenuExam(null);
      setToast({
        visible: true,
        type: "success",
        message: PDF_KIND_SUCCESS_MESSAGE[kind],
      });
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível gerar o PDF de entregas.");
    }
    setExportingPdfKind(null);
  };

  const handleExamAction = (action: ExamActionKey) => {
    const exam = menuExam;
    if (!exam) return;

    if (action === "preview") {
      openPreview(exam);
      return;
    }
    if (action === "edit") {
      openListTarget("simulados-form", { examId: exam.id });
      return;
    }
    if (action === "open_delivery_reports") {
      setReportsExam(exam);
      setMenuExam(null);
      return;
    }
    if (action === "open_question_errors_report") {
      setErrorsReportExam(exam);
      setMenuExam(null);
      return;
    }
    if (action === "delete") {
      setDeleteId(exam.id);
    }
  };

  const renderMenuButton = (exam: ExamListItem, stopPropagation = false) => (
    <TouchableOpacity
      onPress={(event: { stopPropagation?: () => void }) => {
        if (stopPropagation) event?.stopPropagation?.();
        setMenuExam(exam);
      }}
      className="p-1.5 bg-surface-sunken rounded-ds-md border border-border"
      activeOpacity={0.85}
      accessibilityLabel="Ações do simulado"
    >
      <Ionicons name="ellipsis-horizontal" size={16} color="var(--ds-ink-muted)" />
    </TouchableOpacity>
  );

  const selectStyle = {
    border: "1px solid #D9DDE3",
    borderRadius: 4,
    padding: "0 14px",
    fontSize: 14,
    color: "var(--ds-ink)",
    backgroundColor: "var(--ds-surface)",
    height: 44,
    minWidth: isMobile ? "100%" : 160,
  };

  const GRID = {
    questions: 110,
    duration: 110,
    status: 110,
    delivered: 140,
    actions: 42,
  };

  return (
    <View className="flex-1">
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabeçalho */}
      <View className="mb-6" style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Simulados</Text>
          <Text className="text-sm text-ink-muted">
            Crie e gerencie simulados com questões objetivas e discursivas
          </Text>
        </View>
        {allowManageExams && (
          <TouchableOpacity
            onPress={() => openListTarget("simulados-form", { examId: null })}
            className="flex-row items-center bg-brand px-5 rounded-ds-md py-2 min-h-control-md justify-center"
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="var(--ds-on-brand)" />
            <Text className="text-on-brand font-medium text-sm ml-1.5">
              Novo simulado
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cards de resumo de tentativas */}
      {summary !== null && (
        <View className="flex-row gap-3 mb-5 flex-wrap">
          <TouchableOpacity
            onPress={() => openListTarget("simulados-tentativas", { status: "in_progress" })}
            className="flex-1 bg-surface rounded-ds-md p-4 border border-border"
            style={{ minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="time-outline" size={15} color="var(--ds-warning)" />
              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-wide">Em andamento</Text>
            </View>
            <Text className="text-3xl font-semibold text-ink">{summary.in_progress}</Text>
            <Text className="text-xs text-ink-subtle mt-1">realizando agora</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openListTarget("simulados-tentativas", { status: "pending_review" })}
            className="flex-1 rounded-ds-md p-4 border"
            style={{ minWidth: 140,
              backgroundColor: summary.pending_review > 0 ? 'var(--ds-warning-tint)' : 'white',
              borderColor: summary.pending_review > 0 ? 'var(--ds-warning)' : 'var(--ds-warning-tint)',
            }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="create-outline" size={15} color="var(--ds-warning)" />
              <Text className="text-xs font-semibold text-warning uppercase tracking-wide">Corrigir</Text>
              {summary.pending_review > 0 && (
                <View className="bg-warning rounded-ds-sm px-1.5" style={{ marginLeft: 'auto' }}>
                  <Text className="text-on-brand text-xs font-medium">{summary.pending_review}</Text>
                </View>
              )}
            </View>
            <Text className="text-3xl font-semibold" style={{ color: summary.pending_review > 0 ? 'var(--ds-warning)' : 'var(--ds-ink)' }}>
              {summary.pending_review}
            </Text>
            <Text className="text-xs text-amber-500 mt-1">aguardam correção</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openListTarget("simulados-tentativas", { status: "awaiting_release" })}
            className="flex-1 bg-surface rounded-ds-md p-4 border border-border"
            style={{ minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="lock-closed-outline" size={15} color="var(--ds-brand)" />
              <Text className="text-xs font-semibold text-brand uppercase tracking-wide">Aguardando</Text>
            </View>
            <Text className="text-3xl font-semibold" style={{ color: summary.awaiting_release > 0 ? 'var(--ds-brand)' : 'var(--ds-ink)' }}>
              {summary.awaiting_release}
            </Text>
            <Text className="text-xs text-ink-subtle mt-1">aguardam liberação</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openListTarget("simulados-tentativas", { status: "completed" })}
            className="flex-1 bg-surface rounded-ds-md p-4 border border-success"
            style={{ minWidth: 140 }}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="checkmark-circle-outline" size={15} color="var(--ds-success)" />
              <Text className="text-xs font-semibold text-success uppercase tracking-wide">Concluídas</Text>
            </View>
            <Text className="text-3xl font-semibold text-ink">{summary.completed}</Text>
            <Text className="text-xs text-ink-subtle mt-1">finalizadas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openListTarget("simulados-tentativas")}
            className="bg-surface rounded-ds-md p-4 border border-border"
            style={{ minWidth: 140, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={20} color="var(--ds-brand)" />
            <Text className="text-xs font-semibold text-brand mt-1">Ver todas</Text>
            <Text className="text-xs text-ink-subtle">{summary.total} tentativas</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filtros */}
      <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 12 }}>
        <View
          className="flex-row items-center bg-surface border border-border rounded-ds-md px-4"
          style={{ height: 44, minWidth: isMobile ? "100%" : 260, flex: 1 }}
        >
          <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar por título..."
            placeholderTextColor="var(--ds-ink-subtle)"
            className="flex-1 ml-2 text-sm text-ink"
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
            </TouchableOpacity>
          )}
        </View>
        <select
          value={state.status}
          onChange={(e: any) => updateState({ ...state, status: e.target.value, page: 1 })}
          style={selectStyle}
        >
          <option value="">Todos os status</option>
          {examStatuses.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <select
          value={state.examType}
          onChange={(e: any) => updateState({ ...state, examType: e.target.value, page: 1 })}
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
        className="bg-surface rounded-ds-md overflow-hidden border border-border"
        style={{
          width: "100%",
          minWidth: isMobile ? tableMinWidth : 1220,
        }}
      >
        <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 3, minWidth: 260 }}>
            Título / Tipo
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ flex: 2, minWidth: 220 }}>
            Curso / Matéria
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ width: GRID.questions, textAlign: "center" }}>
            Questões
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ width: GRID.duration, textAlign: "center" }}>
            Duração
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ width: GRID.status, textAlign: "center" }}>
            Status
          </Text>
          <Text className={TABLE_HEADER_CELL} style={{ width: GRID.delivered, textAlign: "center" }}>
            Entregues
          </Text>
          <View style={{ width: GRID.actions }} />
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="var(--ds-brand)" />
          </View>
        ) : rows.length === 0 ? (
          <View className="py-16 items-center gap-2">
            <Ionicons name="document-text-outline" size={32} color="var(--ds-border-strong)" />
            <Text className="text-sm text-ink-subtle">Nenhum simulado encontrado</Text>
          </View>
        ) : (
          rows.map((exam, i) => (
            <DataTableRow key={exam.id} index={i} onPress={() => setMenuExam(exam)}>
              <View className="flex-row items-center" style={{ flex: 3, minWidth: 260, gap: 10 }}>
                <ExamTypeLogo label={exam.exam_type_label ?? exam.exam_type} logoUrl={exam.exam_type_logo_url} size={34} />
                <View className="flex-1">
                  <Text className={TABLE_CELL_SEMIBOLD}>{exam.title}</Text>
                  <Text className={TABLE_CELL_SUBLINE}>
                    {exam.exam_type_label ?? exam.exam_type}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 2, minWidth: 220 }}>
                <Text className={TABLE_CELL}>
                  {exam.courses?.length
                    ? exam.courses.map((c) => c.name).join(", ")
                    : exam.course?.name ?? "—"}
                </Text>
                {exam.subject ? (
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <SubjectIcon icon={exam.subject.icon} color={exam.subject.color} size={12} />
                    <Text className={TABLE_CELL_MUTED}>{exam.subject.name}</Text>
                  </View>
                ) : (
                  <Text className={TABLE_CELL_MUTED}>—</Text>
                )}
              </View>
              <View style={{ width: GRID.questions, alignItems: "center" }}>
                <Text className={TABLE_CELL}>{exam.total_questions}</Text>
                <Text className={TABLE_CELL_MUTED}>{exam.total_points} pts</Text>
              </View>
              <View style={{ width: GRID.duration, alignItems: "center" }}>
                <Text className={TABLE_CELL}>
                  {exam.duration_minutes ? `${exam.duration_minutes} min` : "—"}
                </Text>
              </View>
              <View style={{ width: GRID.status, alignItems: "center" }}>
                <Badge
                  label={exam.status_label ?? exam.status}
                  slug={exam.status}
                />
              </View>
              <View style={{ width: GRID.delivered, alignItems: "center" }}>
                <Text className={TABLE_CELL_SEMIBOLD}>
                  {fmtRespondedPct(exam.responded_students_percentage)}
                </Text>
                <Text className={TABLE_CELL_MUTED}>
                  {(exam.responded_students_count ?? 0)}/{(exam.eligible_students_count ?? 0)} alunos
                </Text>
              </View>
              <View style={{ width: GRID.actions }} className="flex-row justify-end">
                {renderMenuButton(exam, true)}
              </View>
            </DataTableRow>
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
            onPageChange={(page) => updateState({ ...state, page })}
          />
        </View>
      )}

      {/* Total */}
      {!loading && (
        <Text className="text-xs text-ink-subtle mt-3 text-center">
          {meta.total} simulado{meta.total !== 1 ? "s" : ""} encontrado{meta.total !== 1 ? "s" : ""}
        </Text>
      )}
    </ScrollView>

      <ExamActionsModal
        visible={!!menuExam}
        exam={menuExam}
        onClose={() => setMenuExam(null)}
        onSelect={handleExamAction}
        canManage={allowManageExams}
      />

      <ExamQuestionErrorsReportModal
        visible={!!errorsReportExam}
        examId={errorsReportExam?.id ?? null}
        examTitle={errorsReportExam?.title}
        onClose={() => setErrorsReportExam(null)}
        setToast={setToast}
      />

      <ExamDeliveryReportsModal
        visible={!!reportsExam}
        exam={reportsExam}
        exportingPdfKind={exportingPdfKind}
        onClose={() => {
          if (!exportingPdfKind) setReportsExam(null);
        }}
        onBack={() => {
          if (exportingPdfKind || !reportsExam) return;
          setMenuExam(reportsExam);
          setReportsExam(null);
        }}
        onSelect={(kind) => {
          if (!reportsExam) return;
          void handleExportDeliveryPdf(reportsExam, kind);
        }}
      />

      <ConfirmModal
        visible={deleteId !== null}
        title="Remover simulado"
        message="Tem certeza que deseja remover este simulado? Esta ação não poderá ser desfeita."
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      {/* ── Modal de teste do simulado ───────────────────────────────────────── */}
      <Modal
        visible={previewExam !== null}
        title="Testar simulado"
        onClose={() => setPreviewExam(null)}
        size="lg"
        showScrollIndicator
      >
        {previewExam && (
          <ExamPreviewPlayer
            key={previewExam.id}
            questions={previewQuestions}
            loading={previewLoading}
            gradeObjective
            emptyMessage="Nenhuma questão cadastrada"
            examMeta={{
              title: previewExam.title,
              exam_type_label: previewExam.exam_type_label,
              exam_type: previewExam.exam_type,
              status_label: previewExam.status_label,
              status: previewExam.status,
              duration_minutes: previewExam.duration_minutes,
              passing_score: previewExam.passing_score,
              total_points: previewExam.total_points,
              courses: previewExam.courses?.length
                ? previewExam.courses.map((c) => c.name)
                : previewExam.course?.name
                  ? [previewExam.course.name]
                  : [],
              subject: previewExam.subject?.name ?? null,
            }}
            header={
              <View
                className="mb-2 p-5 rounded-ds-md border border-border"
                style={{ backgroundColor: "var(--ds-surface-sunken)" }}
              >
                <View className="flex-row items-start justify-between gap-4 mb-3">
                  <Text className="text-xl font-semibold text-ink flex-1">
                    {previewExam.title}
                  </Text>
                  <Badge
                    label={previewExam.exam_type_label ?? previewExam.exam_type}
                    slug={previewExam.exam_type}
                  />
                </View>
                <View className="flex-row gap-4 flex-wrap">
                  {previewExam.duration_minutes != null && (
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="time-outline" size={14} color="var(--ds-ink-muted)" />
                      <Text className="text-sm text-ink-muted">
                        {previewExam.duration_minutes} min
                      </Text>
                    </View>
                  )}
                  {previewExam.passing_score != null && (
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="ribbon-outline" size={14} color="var(--ds-ink-muted)" />
                      <Text className="text-sm text-ink-muted">
                        Mínimo: {previewExam.passing_score}%
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="help-circle-outline" size={14} color="var(--ds-ink-muted)" />
                    <Text className="text-sm text-ink-muted">
                      {previewExam.total_questions} questão
                      {previewExam.total_questions !== 1 ? "ões" : ""}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="star-outline" size={14} color="var(--ds-ink-muted)" />
                    <Text className="text-sm text-ink-muted">{previewExam.total_points} pontos</Text>
                  </View>
                  {(previewExam.courses?.length || previewExam.course) && (
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="book-outline" size={14} color="var(--ds-ink-muted)" />
                      <Text className="text-sm text-ink-muted">
                        {previewExam.courses?.length
                          ? previewExam.courses.map((c) => c.name).join(", ")
                          : previewExam.course?.name}
                      </Text>
                    </View>
                  )}
                  {previewExam.subject && (
                    <View className="flex-row items-center gap-1.5">
                      <SubjectIcon
                        icon={previewExam.subject.icon}
                        color={previewExam.subject.color}
                        size={14}
                      />
                      <Text className="text-sm text-ink-muted">{previewExam.subject.name}</Text>
                    </View>
                  )}
                </View>
              </View>
            }
          />
        )}
      </Modal>
    </View>
  );
}
