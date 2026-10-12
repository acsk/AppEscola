import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type SearchableOption } from "../../components/ui/SearchableSelect";
import FormSelect from "../../components/ui/FormSelect";
import Modal from "../../components/ui/Modal";
import ToastBanner from "../../components/ui/ToastBanner";
import DataTableRow from "../../components/ui/DataTableRow";
import { TABLE_HEADER_CELL } from "../../components/ui/dataTableStyles";
import PageHeader from "../../components/ui/PageHeader";
import ActionsMenu from "../../components/ui/ActionsMenu";
import Icon from "../../components/ui/Icon";
import FilterChip, { ChipDivider, FilterChipShell, ToggleChip } from "../../components/ui/FilterChip";
import DifficultyMeter from "../../components/banco-questoes/DifficultyMeter";
import QuestionStatusBadge from "../../components/banco-questoes/QuestionStatusBadge";
import QuestionPreviewPanel from "../../components/banco-questoes/QuestionPreviewPanel";
import { color } from "../../constants/theme";
import { OfficialBadge, RevalidatedMark, StudentReviewMark } from "../../components/banco-questoes/QuestionMarks";
import BulkClassifyModal, { type BulkAction } from "../../components/banco-questoes/BulkClassifyModal";
import AiBulkClassifyModal from "../../components/banco-questoes/AiBulkClassifyModal";
import UndoToast from "../../components/banco-questoes/UndoToast";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs, useSubjectTopics } from "../../hooks/useQuestionBankCatalogs";
import { QUESTION_SET_ORIGIN_LABEL, fetchQuestionSet, fetchQuestionSets } from "../../services/questionSets";
import {
  fetchExamOptions,
  fetchQuestionBankIds,
  approveQuestionsManually,
  fetchQuestionBankPage,
  fetchQuestionBankYears,
  patchClassificationBatch,
  deleteStandaloneQuestion,
  patchQuestionClassification,
  type QuestionBankPage,
} from "../../services/questionBank";
import { getApiErrorMessage, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import {
  PER_PAGE_OPTIONS,
  QUESTION_BANK_ORIGINS,
  type PerPage,
  type QuestionBankOrigin,
  type QuestionBankListState,
  ariaSort,
  batchSummaryMessage,
  buildBatchItems,
  clearFilters,
  hashQuery,
  hasActiveFilters,
  nextSort,
  toggleMostErrors,
  pageSelectionState,
  parseListState,
  rangeLabel,
  serializeListState,
  summarizeBatch,
  tabsWithCounts,
  toApiParams,
  togglePageSelection,
  withSubjectFilter,
} from "../../utils/questionBankQuery";
import type { BatchItem, ClassificationPatch, QuestionBankQuestion, QuestionBankSort } from "../../types/questionBank";
import Tabs from "../../components/ui/Tabs";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Folder,
  List,
  Minus,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Tag,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react-native";
import ImportPdfModal from "../../components/banco-questoes/ImportPdfModal";
import ImportedExamsModal from "../../components/banco-questoes/ImportedExamsModal";
import QuestionSetsModal from "../../components/banco-questoes/question-sets/QuestionSetsModal";
import QuestionSetDetailModal from "../../components/banco-questoes/question-sets/QuestionSetDetailModal";
import AddToQuestionSetDialog from "../../components/banco-questoes/question-sets/AddToQuestionSetDialog";
import PracticeRankingModal from "../../components/banco-questoes/question-sets/PracticeRankingModal";
import { useQuestionAiStatus } from "../../hooks/useQuestionAiStatus";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { plainRichText } from "../../utils/richText";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const LIST_HASH = "#/questoes";
const DENSITY_KEY = "questoes_densidade";
const SEARCH_DEBOUNCE_MS = 300;

const COL = { select: 44, number: 88, difficulty: 140, errors: 104, board: 104, status: 132, actions: 40 };
/** Com a pré-visualização aberta: colunas mais estreitas, sem banca e situação. */
const COL_NARROW = { ...COL, number: 84, difficulty: 128, errors: 92 };
/** Largura mínima da janela para abrir a pré-visualização ao lado da lista (abaixo disso, a linha abre a página da questão). */
const PREVIEW_MIN_WIDTH = 1280;
const PREVIEW_WIDTH = 380;
/** A partir desta taxa de erro, a célula fica em `danger`. */
const HIGH_ERROR_RATE = 60;

function readStateFromHash(): QuestionBankListState {
  return parseListState(typeof window === "undefined" ? "" : hashQuery(window.location.hash));
}

function readDensity(): "padrao" | "compacta" {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compacta" ? "compacta" : "padrao";
  } catch {
    return "padrao";
  }
}

/** Chave dos filtros (sem página/ordem): mudou → limpa a seleção. */
const filtersKey = (s: QuestionBankListState) =>
  JSON.stringify([
    s.search, s.subjectIds, s.topicIds, s.boardIds, s.years, s.difficultyIds,
    s.origin, s.examTypeIds, s.examIds, s.questionSetIds, s.mostErrors, s.hideRevalidated, s.studentReview, s.withoutSubject, s.tab,
  ]);

export default function QuestionBankScreen({ navigate }: Props) {
  const { width, isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const catalogs = useQuestionBankCatalogs();
  const { ensureAvailable } = useQuestionAiStatus();
  const [importPdfOpen, setImportPdfOpen] = useState(false);
  const [importedExamsOpen, setImportedExamsOpen] = useState(false);
  const [questionSetsOpen, setQuestionSetsOpen] = useState(false);
  const [addToSet, setAddToSet] = useState<{ ids: number[]; blocked: number } | null>(null);
  const [checkingAddToSet, setCheckingAddToSet] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [addedSetId, setAddedSetId] = useState<number | null>(null);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [resumeImportId, setResumeImportId] = useState<string | null>(null);
  /** Importar PDF usa IA: confere a chave antes de abrir. */
  const openImportPdf = async (draftId: string | null = null) => {
    const unavailable = await ensureAvailable();
    if (unavailable) {
      setToast({ visible: true, type: "error", message: unavailable });
      return;
    }
    setResumeImportId(draftId);
    setImportPdfOpen(true);
  };

  // ── Estado na URL ──────────────────────────────────────────────────────────
  const [state, setState] = useState<QuestionBankListState>(readStateFromHash);
  const [searchText, setSearchText] = useState(state.search);

  const updateState = useCallback((next: QuestionBankListState, options: { replace?: boolean } = {}) => {
    const query = serializeListState(next);
    const hash = query ? `${LIST_HASH}?${query}` : LIST_HASH;
    setState(next);
    if (typeof window === "undefined") return;
    if (options.replace) {
      window.history.replaceState(window.history.state, "", hash);
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  // Voltar/avançar do navegador.
  useEffect(() => {
    const onHashChange = () => {
      if (/^#\/questoes(\?|$)/.test(window.location.hash)) {
        const next = readStateFromHash();
        setState(next);
        setSearchText(next.search);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Busca com debounce (substitui a entrada do histórico para não poluir o "voltar").
  useEffect(() => {
    if (searchText === state.search) return;
    const timer = setTimeout(() => updateState({ ...state, search: searchText, page: 1 }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, state, updateState]);

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<QuestionBankPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const requestSeq = useRef(0);
  const apiParams = useMemo(() => toApiParams(state), [state]);
  const apiParamsKey = JSON.stringify(apiParams);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const page = await fetchQuestionBankPage(JSON.parse(apiParamsKey));
      if (seq !== requestSeq.current) return;
      setResult(page);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setLoadError(getApiErrorMessage(error, "Não foi possível carregar as questões."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [apiParamsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchQuestionBankYears().then(setYears).catch(() => setYears([]));
  }, []);

  const rows = result?.data ?? [];
  const meta = result?.meta;
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Página fora do intervalo (ex.: link antigo) → última página válida.
  useEffect(() => {
    if (meta && meta.last_page >= 1 && state.page > meta.last_page) {
      updateState({ ...state, page: meta.last_page }, { replace: true });
    }
  }, [meta, state, updateState]);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const subjectFilterId = state.subjectIds.length === 1 ? state.subjectIds[0] : null;
  const { topics: filterTopics } = useSubjectTopics(subjectFilterId);
  const filterBox = (minWidth: number) => (isMobile ? { width: "100%" as const } : { flex: 1, minWidth });
  const single = (ids: number[]) => (ids.length === 1 ? String(ids[0]) : "");
  const toIds = (v: string) => (v ? [Number(v)] : []);

  const examFilterId = single(state.examIds);
  const setFilterId = single(state.questionSetIds);
  /** Nome do simulado escolhido quando o filtro vem da URL (as opções são buscadas sob demanda). */
  const [examFilterOption, setExamFilterOption] = useState<SearchableOption | undefined>();
  const [setFilterOption, setSetFilterOption] = useState<SearchableOption | undefined>();

  useEffect(() => {
    if (!examFilterId || examFilterOption?.value === examFilterId) return;
    let cancelled = false;
    fetchExamOptions({ ids: examFilterId })
      .then(([exam]) => {
        if (!cancelled && exam) setExamFilterOption({ value: String(exam.id), label: exam.title });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [examFilterId, examFilterOption?.value]);

  useEffect(() => {
    if (!setFilterId || setFilterOption?.value === setFilterId) return;
    let cancelled = false;
    fetchQuestionSet(Number(setFilterId))
      .then(({ question_set }) => {
        if (!cancelled) setSetFilterOption({ value: String(question_set.id), label: question_set.title });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [setFilterId, setFilterOption?.value]);

  const searchExamOptions = useCallback(
    async (query: string): Promise<SearchableOption[]> => [
      { value: "", label: "Todos" },
      ...(await fetchExamOptions({ search: query.trim() || undefined })).map((exam) => ({
        value: String(exam.id),
        label: exam.title,
        sublabel: `${exam.questions_count} ${exam.questions_count === 1 ? "questão" : "questões"}`,
      })),
    ],
    []
  );

  const searchSetOptions = useCallback(
    async (query: string): Promise<SearchableOption[]> => [
      { value: "", label: "Todos" },
      ...(await fetchQuestionSets({ search: query.trim() || undefined, per_page: 50 })).data.map((set) => ({
        value: String(set.id),
        label: set.title,
        sublabel: `${QUESTION_SET_ORIGIN_LABEL[set.origin]} · ${set.questions_count} ${set.questions_count === 1 ? "questão" : "questões"}`,
      })),
    ],
    []
  );

  // ── Densidade ──────────────────────────────────────────────────────────────
  const [density, setDensity] = useState<"padrao" | "compacta">(readDensity);
  const toggleDensity = () => {
    const next = density === "padrao" ? "compacta" : "padrao";
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {}
  };

  // ── Seleção ────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);

  const confirmApprove = async () => {
    const ids = Array.from(selected);
    if (!ids.length || approving) return;
    setApproving(true);
    try {
      const response = await approveQuestionsManually(ids);
      setApproveOpen(false);
      setSelected(new Set());
      showApiToast(setToast, response, response.message || "Questões aprovadas manualmente.");
      await load();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível aprovar as questões.");
    } finally {
      setApproving(false);
    }
  };
  const currentFiltersKey = filtersKey(state);
  useEffect(() => setSelected(new Set()), [currentFiltersKey]);

  const pageSelection = pageSelectionState(selected, pageIds);
  const total = meta?.total ?? 0;

  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const { ids, truncated } = await fetchQuestionBankIds(toApiParams(state, { paginate: false }));
      setSelected(new Set(ids));
      if (truncated) {
        setToast({ visible: true, type: "error", message: `Seleção limitada às primeiras ${ids.length} questões.` });
      }
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível selecionar todas as questões.");
    } finally {
      setSelectingAll(false);
    }
  };

  /**
   * Simulado do banco só aceita avulsas: separa as selecionadas que estão em simulado oficial.
   * A seleção sempre está dentro dos filtros atuais (é limpa quando eles mudam).
   */
  const openAddToSet = async () => {
    setCheckingAddToSet(true);
    try {
      const { ids } = await fetchQuestionBankIds({ ...toApiParams(state, { paginate: false }), origin: "simulado" });
      const official = new Set(ids);
      const allowed = Array.from(selected).filter((id) => !official.has(id));
      const blocked = selected.size - allowed.length;
      if (allowed.length === 0) {
        setToast({
          visible: true,
          type: "error",
          message: `${blocked === 1 ? "A questão selecionada pertence" : `As ${blocked} questões selecionadas pertencem`} a simulado oficial. Só questões avulsas entram em simulados do banco.`,
        });
        return;
      }
      setAddToSet({ ids: allowed, blocked });
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível verificar as questões selecionadas.");
    } finally {
      setCheckingAddToSet(false);
    }
  };

  // ── Feedback ───────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const [undo, setUndo] = useState<{ message: string; tone: "success" | "warning"; items: BatchItem[] } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const closeUndo = useCallback(() => setUndo(null), []);

  // ── Ações em massa ─────────────────────────────────────────────────────────
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [aiBulkOpen, setAiBulkOpen] = useState(false);

  const applyBulk = (patch: ClassificationPatch) => applyItems(buildBatchItems(Array.from(selected), patch));

  /** Aplica no lote (manual: mesmo valor; IA: valor por questão) e oferece "Desfazer". */
  const applyItems = async (items: BatchItem[]) => {
    setApplying(true);
    setProgress({ done: 0, total: items.length });
    try {
      const results = await patchClassificationBatch(items, (done, all) =>
        setProgress({ done, total: all })
      );
      const summary = summarizeBatch(results);
      setBulkAction(null);
      setAiBulkOpen(false);
      // Falhas continuam selecionadas para nova tentativa.
      setSelected(new Set(summary.failedIds));
      setUndo({
        message: batchSummaryMessage(summary),
        tone: summary.failed ? "warning" : "success",
        items: summary.undoItems,
      });
      void load();
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const runUndo = async () => {
    if (!undo?.items.length) return;
    setUndoing(true);
    try {
      const summary = summarizeBatch(await patchClassificationBatch(undo.items));
      setUndo(null);
      setToast({
        visible: true,
        type: summary.failed ? "error" : "success",
        message: summary.failed ? `Desfeito em parte. ${batchSummaryMessage(summary)}` : "Alteração desfeita.",
      });
      void load();
    } finally {
      setUndoing(false);
    }
  };

  // ── Ações por linha ────────────────────────────────────────────────────────
  const [menuRow, setMenuRow] = useState<QuestionBankQuestion | null>(null);
  const openClassify = (id: number) =>
    navigate("questoes-classificar", { questionId: id, query: serializeListState(state) });

  const [deleteRow, setDeleteRow] = useState<QuestionBankQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      showApiToast(setToast, await deleteStandaloneQuestion(deleteRow.id), "Questão removida com sucesso.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteRow.id);
        return next;
      });
      void load();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível excluir a questão.");
    } finally {
      setDeleting(false);
      setDeleteRow(null);
    }
  };

  // ── Pré-visualização lateral (desktop largo) ───────────────────────────────
  const canPreview = width >= PREVIEW_MIN_WIDTH;
  const [previewId, setPreviewId] = useState<number | null>(null);
  const previewRow = canPreview && previewId != null ? rows.find((r) => r.id === previewId) ?? null : null;
  const narrow = !!previewRow;
  const col = narrow ? COL_NARROW : COL;

  const onRowPress = (row: QuestionBankQuestion) => {
    if (canPreview) setPreviewId((current) => (current === row.id ? null : row.id));
    else openClassify(row.id);
  };

  /** Uma questão pela pré-visualização: só avulsas entram em simulados do banco. */
  const addOneToSet = (row: QuestionBankQuestion) => {
    if (row.exam) {
      setToast({ visible: true, type: "error", message: "Questão de simulado oficial não entra em simulados do banco." });
      return;
    }
    setAddToSet({ ids: [row.id], blocked: 0 });
  };

  // "/" foca a busca (fora de campos de texto).
  const searchRef = useRef<TextInput>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const tabs = tabsWithCounts(meta?.tab_counts ?? null);
  const filtered = hasActiveFilters(state) || state.search.trim() !== "";
  const noQuestionsAtAll = !filtered && (meta?.tab_counts.todas ?? 0) === 0;
  const optionLabel = (options: SearchableOption[], value: string) => options.find((o) => o.value === value)?.label;

  const subjectOptions = catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }));
  const topicOptions = filterTopics.map((t) => ({ value: String(t.id), label: t.name }));
  const boardOptions = catalogs.boards.map((b) => ({ value: String(b.id), label: b.name }));
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));
  const difficultyOptions = catalogs.difficulties.map((d) => ({ value: String(d.id), label: d.name }));
  const originOptions = QUESTION_BANK_ORIGINS.map((o) => ({ value: o.key, label: o.label }));
  const examTypeOptions = catalogs.examTypes.map((t) => ({ value: String(t.id), label: t.label }));
  const moreFiltersActive = !!(state.origin || state.examTypeIds.length || examFilterId || setFilterId);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const moreFiltersVisible = showMoreFilters || moreFiltersActive;

  const SortHeader = ({ label, sort, style }: { label: string; sort: QuestionBankSort; style: object }) => {
    const current = ariaSort(state, sort);
    return (
      <TouchableOpacity
        onPress={() => updateState(nextSort(state, sort))}
        style={[{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12 }, style]}
        role="columnheader"
        {...({ "aria-sort": current } as object)}
        aria-label={`Ordenar por ${label}`}
      >
        <Text className={`text-xs font-medium ${current === "none" ? "text-ink-muted" : "text-ink"}`}>{label}</Text>
        {current !== "none" && <Icon icon={current === "ascending" ? ArrowUp : ArrowDown} size={16} color={color.ink} />}
      </TouchableOpacity>
    );
  };

  const HeaderCell = ({ label, style }: { label: string; style: object }) => (
    <Text className={TABLE_HEADER_CELL} style={[{ paddingHorizontal: 12 }, style]} role="columnheader" numberOfLines={1}>
      {label}
    </Text>
  );

  const Checkbox = ({ checked, mixed, onPress, label }: { checked: boolean; mixed?: boolean; onPress: () => void; label: string }) => (
    <TouchableOpacity
      onPress={onPress}
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      style={{ width: col.select, alignItems: "center", justifyContent: "center", alignSelf: "stretch", paddingLeft: 4 }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 2,
          borderWidth: 1,
          borderColor: checked || mixed ? color.brand : color["border-strong"],
          backgroundColor: checked || mixed ? color.brand : color.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {mixed ? <Minus size={12} color={color["on-brand"]} strokeWidth={3} /> : checked ? <Check size={12} color={color["on-brand"]} strokeWidth={3} /> : null}
      </View>
    </TouchableOpacity>
  );

  /** Botão da barra de seleção (fundo `nav-bg`). */
  const SelButton = ({ label, icon, onPress, primary, caret, disabled }: { label: string; icon?: LucideIcon; onPress: () => void; primary?: boolean; caret?: boolean; disabled?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role="button"
      style={(s) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 4,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: primary ? color["nav-ink"] : (s as { hovered?: boolean }).hovered ? color["nav-hover"] : "transparent",
      })}
    >
      {icon ? <Icon icon={icon} color={primary ? color["nav-bg"] : color["nav-ink"]} /> : null}
      <Text className="font-medium" style={{ fontSize: 13, color: primary ? color["nav-bg"] : color["nav-ink"] }}>
        {label}
      </Text>
      {caret ? <Icon icon={ChevronDown} color={color["nav-ink"]} /> : null}
    </Pressable>
  );

  const allPageSelected = pageSelection === "all";
  const selectionLabel =
    allPageSelected && selected.size === pageIds.length
      ? `Todas as ${pageIds.length} desta página`
      : `${selected.size} ${selected.size === 1 ? "selecionada" : "selecionadas"}`;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 120, gap: 16 }}>
        {/* Cabeçalho */}
        <View style={{ zIndex: 30 }}>
          <PageHeader
            title="Banco de questões"
            description="Questões avulsas e de simulados. Classifique para facilitar a busca e a montagem de simulados."
            actions={
              <>
                <ActionsMenu
                  label="Mais opções"
                  heading="Organizar"
                  minWidth={260}
                  items={[
                    { key: "taxonomia", label: "Taxonomia (disciplinas e assuntos)", icon: Tag, onPress: () => navigate("questoes-taxonomia") },
                    { key: "sets", label: "Simulados do banco", icon: Folder, onPress: () => setQuestionSetsOpen(true) },
                    { key: "ranking", label: "Ranking de erros", icon: Trophy, onPress: () => setRankingOpen(true) },
                    { key: "importados", label: "Simulados importados", icon: Archive, onPress: () => setImportedExamsOpen(true), separatorBefore: true },
                  ]}
                />
                <Button variant="ai" icon={Sparkles} label="Importar PDF com IA" onPress={() => void openImportPdf()} />
                <Button
                  variant="primary"
                  icon={Plus}
                  label="Nova questão"
                  onPress={() => navigate("questoes-nova", { query: serializeListState(state) })}
                />
              </>
            }
          />
        </View>

        {/* Abas (contagens atualizam sem trocar de aba: aria-live) */}
        <View aria-live="polite">
          <Tabs
            accessibilityLabel="Situação das questões"
            items={tabs.map((tab) => ({ id: tab.key, label: tab.label, count: tab.count }))}
            value={state.tab}
            onChange={(tab) => updateState({ ...state, tab, page: 1 })}
          />
        </View>

        {/* Busca + densidade */}
        <View style={{ gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View
              className="flex-1 flex-row items-center bg-surface border border-border-strong rounded-ds-md"
              style={{ height: 40, paddingLeft: 12, paddingRight: 10 }}
            >
              <Icon icon={Search} color={color["ink-subtle"]} />
              <TextInput
                ref={searchRef}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar por nº (#123), enunciado, simulado ou tag"
                placeholderTextColor={color["ink-subtle"]}
                aria-label="Buscar questões"
                className="flex-1 text-sm text-ink"
                style={{ marginLeft: 10, height: 38 }}
              />
              {searchText ? (
                <TouchableOpacity onPress={() => setSearchText("")} aria-label="Limpar busca" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon icon={X} color={color["ink-subtle"]} />
                </TouchableOpacity>
              ) : Platform.OS === "web" && !isMobile ? (
                <View
                  aria-hidden
                  className="border border-border-strong rounded-ds-sm bg-surface"
                  style={{ borderBottomWidth: 2, paddingHorizontal: 5, paddingVertical: 2 }}
                >
                  <Text className="font-mono font-medium text-ink-muted" style={{ fontSize: 11, lineHeight: 12 }}>
                    /
                  </Text>
                </View>
              ) : null}
            </View>
            <View role="group" aria-label="Densidade da lista" className="flex-row border border-border-strong rounded-ds-md overflow-hidden" style={{ height: 40 }}>
              {([
                ["padrao", List, "Confortável"],
                ["compacta", Rows3, "Compacta"],
              ] as const).map(([value, glyph, label], i) => {
                const on = density === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => density !== value && toggleDensity()}
                    role="button"
                    aria-pressed={on}
                    aria-label={`Densidade ${label.toLowerCase()}`}
                    className={on ? "bg-surface-sunken" : "bg-surface"}
                    style={{ width: 40, alignItems: "center", justifyContent: "center", borderLeftWidth: i ? 1 : 0, borderLeftColor: color["border-strong"] }}
                  >
                    <Icon icon={glyph} color={on ? color.ink : color["ink-muted"]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Filtros em chips */}
          <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
            <FilterChip
              label="Disciplina"
              options={subjectOptions}
              value={single(state.subjectIds)}
              onChange={(v) => updateState(withSubjectFilter(state, toIds(v)))}
            />
            <FilterChip
              label="Assunto"
              modalTitle={subjectFilterId ? "Filtrar por assunto" : "Escolha a disciplina primeiro"}
              disabled={!subjectFilterId}
              options={topicOptions}
              value={single(state.topicIds)}
              onChange={(v) => updateState({ ...state, topicIds: toIds(v), page: 1 })}
            />
            <FilterChip label="Banca" options={boardOptions} value={single(state.boardIds)} onChange={(v) => updateState({ ...state, boardIds: toIds(v), page: 1 })} />
            <FilterChip label="Ano" options={yearOptions} value={single(state.years)} onChange={(v) => updateState({ ...state, years: toIds(v), page: 1 })} />
            <FilterChip
              label="Dificuldade"
              options={difficultyOptions}
              value={single(state.difficultyIds)}
              onChange={(v) => updateState({ ...state, difficultyIds: toIds(v), page: 1 })}
            />
            {moreFiltersVisible ? (
              <>
                <FilterChip
                  label="Origem"
                  options={originOptions}
                  value={state.origin}
                  onChange={(v) => updateState({ ...state, origin: v as QuestionBankOrigin | "", page: 1 })}
                />
                <FilterChip
                  label="Modalidade"
                  options={examTypeOptions}
                  value={single(state.examTypeIds)}
                  onChange={(v) => updateState({ ...state, examTypeIds: toIds(v), page: 1 })}
                />
                <FilterChip
                  label="Simulado oficial"
                  options={[]}
                  onSearch={searchExamOptions}
                  selectedOption={examFilterOption}
                  value={examFilterId}
                  onChange={(v) => updateState({ ...state, examIds: toIds(v), page: 1 })}
                />
                <FilterChip
                  label="Simulado do banco"
                  options={[]}
                  onSearch={searchSetOptions}
                  selectedOption={setFilterOption}
                  value={setFilterId}
                  onChange={(v) => updateState({ ...state, questionSetIds: toIds(v), page: 1 })}
                />
              </>
            ) : null}
            {!moreFiltersActive && (
              <FilterChipShell label={showMoreFilters ? "Menos filtros" : "Mais filtros"} onPress={() => setShowMoreFilters((v) => !v)} />
            )}
            <ChipDivider />
            <ToggleChip
              label="Mais erros"
              accessibilityLabel="Mostrar só as questões que os alunos mais erram"
              checked={state.mostErrors}
              onPress={() => updateState(toggleMostErrors(state))}
            />
            <ToggleChip
              label="Sem revalidadas"
              accessibilityLabel="Ocultar questões já marcadas como revalidadas"
              checked={state.hideRevalidated}
              onPress={() => updateState({ ...state, hideRevalidated: !state.hideRevalidated, page: 1 })}
            />
            <ToggleChip
              label="Revisão dos alunos"
              accessibilityLabel="Mostrar só questões que alunos marcaram pedindo revisão"
              checked={state.studentReview}
              onPress={() => updateState({ ...state, studentReview: !state.studentReview, page: 1 })}
            />
            <ToggleChip
              label="Sem disciplina"
              accessibilityLabel="Mostrar só questões sem disciplina"
              checked={state.withoutSubject}
              onPress={() =>
                updateState({
                  ...state,
                  withoutSubject: !state.withoutSubject,
                  subjectIds: state.withoutSubject ? state.subjectIds : [],
                  topicIds: state.withoutSubject ? state.topicIds : [],
                  page: 1,
                })
              }
            />
            {hasActiveFilters(state) && (
              <TouchableOpacity onPress={() => updateState(clearFilters(state))} style={{ marginLeft: 8 }} role="button">
                <Text className="font-medium text-brand" style={{ fontSize: 13 }}>
                  Limpar
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Barra de seleção / ações em lote (invertida, em `nav-bg`) */}
        {selected.size > 0 && (
          <View
            role="toolbar"
            aria-label="Ações em lote"
            className="bg-nav-bg rounded-ds-md"
            style={{
              zIndex: 20,
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              gap: 12,
              minHeight: 52,
              paddingVertical: isMobile ? 12 : 8,
              paddingLeft: 16,
              paddingRight: 12,
            }}
          >
            <View className="flex-row items-center flex-wrap" style={{ gap: 12 }}>
              <Text className="font-semibold text-nav-ink" style={{ fontSize: 14 }} aria-live="polite">
                {selectionLabel}
              </Text>
              {allPageSelected && total > selected.size && (
                <TouchableOpacity onPress={selectAllMatching} disabled={selectingAll}>
                  <Text className="font-medium text-nav-ink-muted underline" style={{ fontSize: 13 }}>
                    {selectingAll ? "Selecionando..." : `Selecionar todas as ${total}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View className="flex-row flex-wrap items-center" style={{ gap: 4, marginLeft: isMobile ? 0 : "auto" }}>
              <ActionsMenu
                align={isMobile ? "left" : "right"}
                renderTrigger={({ toggle }) => <SelButton label="Classificar" icon={Tag} caret onPress={toggle} />}
                items={(
                  [
                    ["subject", "Disciplina e assuntos"],
                    ["difficulty", "Dificuldade"],
                    ["board", "Banca"],
                    ["year", "Ano"],
                    ["add_tags", "Tags"],
                  ] as [BulkAction, string][]
                ).map(([action, label]) => ({ key: action, label, onPress: () => setBulkAction(action) }))}
              />
              <ActionsMenu
                align={isMobile ? "left" : "right"}
                renderTrigger={({ toggle }) => <SelButton label="Marcar como" caret onPress={toggle} />}
                items={[
                  { key: "approve", label: "Aprovada manualmente", icon: Check, onPress: () => setApproveOpen(true), disabled: approving },
                  { key: "annul", label: "Anulada", onPress: () => setBulkAction("annul") },
                  { key: "outdate", label: "Desatualizada", onPress: () => setBulkAction("outdate") },
                ]}
              />
              <SelButton label="Atualizar com IA" icon={Sparkles} onPress={() => setAiBulkOpen(true)} />
              <View style={{ width: 1, height: 20, backgroundColor: color["nav-divider"], marginHorizontal: 4 }} />
              <SelButton
                primary
                icon={Plus}
                label={checkingAddToSet ? "Verificando..." : "Adicionar a simulado"}
                disabled={checkingAddToSet}
                onPress={() => void openAddToSet()}
              />
              <TouchableOpacity
                onPress={() => setSelected(new Set())}
                aria-label="Limpar seleção"
                style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 4 }}
              >
                <Icon icon={X} color={color["nav-ink"]} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Lista + pré-visualização */}
        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile} style={{ width: "100%" }} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
              <View
                className="bg-surface rounded-ds-md overflow-hidden border border-border"
                role="table"
                aria-label="Questões"
                style={{ width: "100%", minWidth: isMobile ? tableMinWidth ?? 760 : narrow ? 600 : 900 }}
              >
                <View className="flex-row items-center bg-surface-sunken border-b border-border" style={{ height: 40 }} role="row">
                  <Checkbox
                    checked={allPageSelected}
                    mixed={pageSelection === "some"}
                    onPress={() => setSelected(togglePageSelection(selected, pageIds))}
                    label="Selecionar questões desta página"
                  />
                  <SortHeader label="Nº" sort="id" style={{ width: col.number }} />
                  <HeaderCell label="Enunciado" style={{ flex: 1, minWidth: 240 }} />
                  <SortHeader label="Dificuldade" sort="difficulty" style={{ width: col.difficulty }} />
                  <SortHeader label="Erros" sort="errors" style={{ width: col.errors }} />
                  {!narrow && <SortHeader label="Banca · ano" sort="board" style={{ width: col.board }} />}
                  {!narrow && <HeaderCell label="Situação" style={{ width: col.status }} />}
                  <View style={{ width: col.actions }} />
                </View>

                {loading && !result ? (
                  Array.from({ length: 6 }, (_, i) => (
                    <View key={i} className="flex-row items-center border-b border-border" style={{ paddingVertical: 18, paddingHorizontal: 16, gap: 16 }} aria-hidden>
                      <View className="bg-surface-sunken" style={{ width: 16, height: 16 }} />
                      <View className="bg-surface-sunken" style={{ width: 40, height: 12 }} />
                      <View className="bg-surface-sunken flex-1" style={{ height: 12 }} />
                      <View className="bg-surface-sunken" style={{ width: 90, height: 12 }} />
                      <View className="bg-surface-sunken" style={{ width: 70, height: 12 }} />
                    </View>
                  ))
                ) : loadError ? (
                  <View className="py-14 items-center gap-3 px-6">
                    <Text className="text-sm text-ink-muted text-center">{loadError}</Text>
                    <Button variant="primary" label="Tentar novamente" onPress={() => void load()} />
                  </View>
                ) : rows.length === 0 ? (
                  <View className="py-14 items-center gap-2 px-6">
                    <Text className="text-sm text-ink-muted text-center">
                      {noQuestionsAtAll ? "Nenhuma questão cadastrada ainda." : "Nenhuma questão encontrada com esses filtros."}
                    </Text>
                    {!noQuestionsAtAll && filtered && (
                      <TouchableOpacity
                        onPress={() => {
                          setSearchText("");
                          updateState({ ...clearFilters(state), search: "" });
                        }}
                      >
                        <Text className="font-medium text-brand" style={{ fontSize: 13 }}>
                          Limpar busca e filtros
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={{ opacity: loading ? 0.6 : 1 }}>
                    {rows.map((row, i) => {
                      const isSelected = selected.has(row.id);
                      const isOpen = previewRow?.id === row.id;
                      const errorRate = row.error_rate ?? 0;
                      const highError = errorRate >= HIGH_ERROR_RATE;
                      const stem = plainRichText(row.question_text).trim() || (row.image_url ? "[Enunciado em imagem]" : "[Sem enunciado]");
                      const path = row.subject
                        ? [row.subject.name, row.topics.map((t) => t.name).join(", ")].filter(Boolean).join(" › ")
                        : "Sem disciplina";
                      return (
                        <DataTableRow
                          key={row.id}
                          index={i}
                          onPress={() => onRowPress(row)}
                          style={[
                            { paddingHorizontal: 0, paddingVertical: 0, minHeight: density === "compacta" ? 44 : 64, alignItems: "center" },
                            isSelected ? { backgroundColor: color["brand-tint"] } : null,
                            isOpen && Platform.OS === "web" ? ({ boxShadow: `inset 3px 0 0 ${color.accent}` } as object) : null,
                          ]}
                        >
                          <Checkbox
                            checked={isSelected}
                            onPress={() => {
                              const next = new Set(selected);
                              next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                              setSelected(next);
                            }}
                            label={`Selecionar questão ${row.id}`}
                          />
                          <View style={{ width: col.number, paddingHorizontal: 12, gap: 5 }}>
                            <Text className="font-mono font-medium text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                              #{row.id}
                            </Text>
                            {row.exam ? (
                              <OfficialBadge title={`Questão do simulado oficial "${row.exam.title}": conteúdo não editável e não entra em simulados do banco.`} />
                            ) : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 240, paddingHorizontal: 12, paddingVertical: density === "compacta" ? 6 : 10 }}>
                            <Text className="font-medium text-ink" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
                              {stem}
                            </Text>
                            {density !== "compacta" && (
                              <View className="flex-row items-center" style={{ gap: 6, marginTop: 3, overflow: "hidden" }}>
                                <View className="flex-row items-center" style={{ gap: 4, flexShrink: 0, maxWidth: "55%" }}>
                                  <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                                    {row.exam ? row.exam.title : row.source_exam_name || "Avulsa"}
                                  </Text>
                                </View>
                                <View style={{ width: 3, height: 3, backgroundColor: color["border-strong"] }} />
                                <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1 }} numberOfLines={1}>
                                  {path}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ width: col.difficulty, paddingHorizontal: 12 }}>
                            <DifficultyMeter difficulty={row.difficulty} levels={catalogs.difficulties.length} emptyLabel="Sem nível" />
                          </View>
                          <View style={{ width: col.errors, paddingHorizontal: 12 }}>
                            {row.answer_count ? (
                              <View style={{ gap: 4 }} aria-label={`${errorRate}% de erro (${row.wrong_count ?? 0} de ${row.answer_count})`}>
                                <Text className={`font-mono font-medium ${highError ? "text-danger" : "text-ink"}`} style={{ fontSize: 13 }}>
                                  {errorRate}%
                                </Text>
                                <View className="bg-surface-sunken border border-border" style={{ height: 4 }}>
                                  <View style={{ width: `${Math.min(100, errorRate)}%`, height: "100%", backgroundColor: highError ? color.danger : color["ink-muted"] }} />
                                </View>
                              </View>
                            ) : (
                              <Text className="text-ink-subtle" style={{ fontSize: 13 }} numberOfLines={1}>
                                Sem dados
                              </Text>
                            )}
                          </View>
                          {!narrow && (
                            <View style={{ width: col.board, paddingHorizontal: 12 }}>
                              {row.board || row.year ? (
                                <>
                                  <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
                                    {row.board?.name ?? "—"}
                                  </Text>
                                  {row.year ? (
                                    <Text className="font-mono text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
                                      {row.year}
                                    </Text>
                                  ) : null}
                                </>
                              ) : (
                                <Text className="text-ink-subtle" style={{ fontSize: 13 }}>
                                  —
                                </Text>
                              )}
                            </View>
                          )}
                          {!narrow && (
                            <View style={{ width: col.status, paddingHorizontal: 12 }}>
                              {(row.issue_reports_count ?? 0) > 0 ? (
                                <StudentReviewMark />
                              ) : row.is_annulled || row.is_outdated ? (
                                <QuestionStatusBadge isAnnulled={row.is_annulled} isOutdated={row.is_outdated} />
                              ) : row.revalidated_at ? (
                                <RevalidatedMark />
                              ) : (
                                <Text className="text-ink-subtle" style={{ fontSize: 13 }}>
                                  Regular
                                </Text>
                              )}
                            </View>
                          )}
                          <View style={{ width: col.actions, alignItems: "center" }}>
                            <TouchableOpacity
                              onPress={() => setMenuRow(row)}
                              aria-label={`Ações da questão ${row.id}`}
                              className="rounded-ds-sm items-center justify-center"
                              style={{ width: 28, height: 28 }}
                            >
                              <Icon icon={Ellipsis} color={color["ink-subtle"]} />
                            </TouchableOpacity>
                          </View>
                        </DataTableRow>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Rodapé: intervalo, por página, paginação */}
            {meta && meta.total > 0 && (
              <View className="flex-row flex-wrap items-center" style={{ gap: 16, marginTop: 12 }}>
                <Text className="text-ink-muted" style={{ fontSize: 13 }} aria-live="polite">
                  {rangeLabel(meta.current_page, meta.per_page, meta.total)}
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-ink-muted" style={{ fontSize: 13 }}>
                    Por página
                  </Text>
                  <View style={{ width: 84, marginBottom: -8 }}>
                    <FormSelect
                      dense
                      label=""
                      value={state.perPage}
                      options={PER_PAGE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                      onChange={(v) => updateState({ ...state, perPage: Number(v) as PerPage, page: 1 })}
                    />
                  </View>
                </View>
                {meta.last_page > 1 && (
                  <View role="navigation" aria-label="Paginação" className="flex-row items-center" style={{ gap: 8, marginLeft: "auto" }}>
                    <Button
                      size="sm"
                      iconOnly
                      icon={ChevronLeft}
                      accessibilityLabel="Página anterior"
                      disabled={meta.current_page <= 1}
                      onPress={() => updateState({ ...state, page: meta.current_page - 1 })}
                    />
                    <Text className="font-mono text-ink" style={{ fontSize: 13 }}>
                      {meta.current_page} / {meta.last_page}
                    </Text>
                    <Button
                      size="sm"
                      iconOnly
                      icon={ChevronRight}
                      accessibilityLabel="Próxima página"
                      disabled={meta.current_page >= meta.last_page}
                      onPress={() => updateState({ ...state, page: meta.current_page + 1 })}
                    />
                  </View>
                )}
              </View>
            )}
            {loading && result && (
              <View className="mt-3 items-center">
                <ActivityIndicator color={color.brand} />
              </View>
            )}
          </View>

          {previewRow && (
            <View style={{ width: PREVIEW_WIDTH }}>
              <QuestionPreviewPanel
                question={previewRow}
                onClose={() => setPreviewId(null)}
                onOpenFull={openClassify}
                onEdit={(id) => navigate("questoes-editar", { questionId: id, query: serializeListState(state) })}
                onOpenExam={(examId) => navigate("simulados-form", { examId })}
                onAddToSet={() => addOneToSet(previewRow)}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!menuRow} title={menuRow ? `Questão #${menuRow.id}` : ""} onClose={() => setMenuRow(null)} size="sm" compact>
        {menuRow && (
          <View style={{ gap: 6 }}>
            {menuRow.exam && (
              <View className="flex-row items-start gap-3 px-3 py-2 rounded-ds-md bg-warning-tint mb-1">
                <Ionicons name="lock-closed" size={28} color="var(--ds-warning)" />
                <Text className="text-xs text-ink flex-1">
                  Questão do simulado oficial "{menuRow.exam.title}". O conteúdo não pode ser editado aqui (só a classificação) e
                  ela não pode ser incluída em simulados do banco.
                </Text>
              </View>
            )}
            {(
              [
                // Classificar e gerar semelhantes só na edição.
                ["eye-outline", "Visualizar", () => openClassify(menuRow.id)],
                ["pencil-outline", "Editar", () => navigate("questoes-editar", { questionId: menuRow.id, query: serializeListState(state) })],
                ...(menuRow.exam
                  ? [["document-text-outline", `Abrir simulado "${menuRow.exam.title}"`, () => navigate("simulados-form", { examId: menuRow.exam!.id })]]
                  : [["trash-outline", "Excluir questão", () => { setDeleteRow(menuRow); setMenuRow(null); }]]),
              ] as [keyof typeof Ionicons.glyphMap, string, () => void][]
            ).map(([icon, label, action]) => {
              const destructive = icon === "trash-outline";
              return (
                <TouchableOpacity
                  key={label}
                  onPress={action}
                  className={`flex-row items-center gap-3 px-3 rounded-ds-md border py-2 min-h-control-md justify-center ${
                    destructive ? "border-danger bg-danger" : "border-border-strong"
                  }`}
                >
                  <Ionicons name={icon} size={18} color={destructive ? "var(--ds-on-danger)" : "var(--ds-brand)"} />
                  <Text className={`text-sm ${destructive ? "font-semibold text-on-danger" : "text-ink"}`}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Modal>

      <ImportedExamsModal
        visible={importedExamsOpen}
        onClose={() => setImportedExamsOpen(false)}
        onOpenExam={(examId) => navigate("simulados-form", { examId })}
        onResumeImport={(draftId) => {
          setImportedExamsOpen(false);
          void openImportPdf(draftId);
        }}
        onChanged={() => void load()}
        setToast={setToast}
      />

      <QuestionSetsModal
        visible={questionSetsOpen}
        catalogs={catalogs}
        onClose={() => setQuestionSetsOpen(false)}
        onResumeImport={(draftId) => {
          setQuestionSetsOpen(false);
          void openImportPdf(draftId);
        }}
        setToast={setToast}
      />

      <AddToQuestionSetDialog
        visible={addToSet !== null}
        questionIds={addToSet?.ids ?? []}
        blockedCount={addToSet?.blocked ?? 0}
        onCancel={() => setAddToSet(null)}
        onDone={(set) => {
          setAddToSet(null);
          setSelected(new Set());
          setAddedSetId(set.id);
        }}
        setToast={setToast}
      />

      <QuestionSetDetailModal setId={addedSetId} onClose={() => setAddedSetId(null)} onChanged={() => {}} setToast={setToast} />

      <PracticeRankingModal visible={rankingOpen} onClose={() => setRankingOpen(false)} taxonomy={catalogs.taxonomy} />

      <ImportPdfModal
        visible={importPdfOpen}
        catalogs={catalogs}
        resumeDraftId={resumeImportId}
        onClose={() => {
          setImportPdfOpen(false);
          setResumeImportId(null);
        }}
        onCreated={(count) => {
          setToast({ visible: true, type: "success", message: `${count} questão(ões) importada(s) do PDF.` });
          void load();
        }}
        setToast={setToast}
      />

      <ConfirmModal
        visible={approveOpen}
        title="Aprovar manualmente"
        message={`${selected.size} ${selected.size === 1 ? "questão passa" : "questões passam"} a valer no mobile. Respostas de prática feitas antes desta aprovação deixam de contar e o aluno responde de novo.`}
        confirmLabel="Aprovar"
        cancelLabel="Cancelar"
        tone="primary"
        loading={approving}
        onConfirm={() => void confirmApprove()}
        onCancel={() => { if (!approving) setApproveOpen(false); }}
      />

      <ConfirmModal
        visible={!!deleteRow}
        title="Excluir questão"
        message={`Excluir a questão #${deleteRow?.id ?? ""}? Ela deixa de aparecer no banco de questões.`}
        confirmLabel="Excluir questão"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteRow(null)}
      />

      <BulkClassifyModal
        visible={bulkAction !== null}
        initialAction={bulkAction ?? "difficulty"}
        count={selected.size}
        catalogs={catalogs}
        applying={applying}
        progress={progress}
        onClose={() => setBulkAction(null)}
        onApply={(patch) => void applyBulk(patch)}
      />

      <AiBulkClassifyModal
        visible={aiBulkOpen}
        ids={Array.from(selected)}
        catalogs={catalogs}
        applying={applying}
        progress={progress}
        ensureAvailable={ensureAvailable}
        onClose={() => setAiBulkOpen(false)}
        onConfirm={(items) => void applyItems(items)}
      />

      <UndoToast
        visible={!!undo}
        message={undo?.message ?? ""}
        tone={undo?.tone}
        onUndo={undo?.items.length ? runUndo : undefined}
        undoing={undoing}
        onClose={closeUndo}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
