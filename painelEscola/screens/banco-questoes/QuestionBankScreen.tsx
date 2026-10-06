import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SearchableSelect from "../../components/ui/SearchableSelect";
import FormSelect from "../../components/ui/FormSelect";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";
import ToastBanner from "../../components/ui/ToastBanner";
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
import DifficultyMeter from "../../components/banco-questoes/DifficultyMeter";
import QuestionStatusBadge from "../../components/banco-questoes/QuestionStatusBadge";
import BulkClassifyModal, { type BulkAction } from "../../components/banco-questoes/BulkClassifyModal";
import UndoToast from "../../components/banco-questoes/UndoToast";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useQuestionBankCatalogs, useSubjectTopics } from "../../hooks/useQuestionBankCatalogs";
import {
  fetchQuestionBankIds,
  fetchQuestionBankPage,
  fetchQuestionBankYears,
  patchClassificationBatch,
  patchQuestionClassification,
  type QuestionBankPage,
} from "../../services/questionBank";
import { getApiErrorMessage, showApiErrorToast, showApiToast } from "../../utils/apiErrors";
import {
  PER_PAGE_OPTIONS,
  type PerPage,
  type QuestionBankListState,
  ariaSort,
  batchSummaryMessage,
  buildBatchItems,
  clearFilters,
  hashQuery,
  hasActiveFilters,
  nextSort,
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

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const LIST_HASH = "#/questoes";
const DENSITY_KEY = "questoes_densidade";
const SEARCH_DEBOUNCE_MS = 300;

const COL = { select: 40, number: 110, board: 150, difficulty: 150, status: 130, actions: 44 };

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
  JSON.stringify([s.search, s.subjectIds, s.topicIds, s.boardIds, s.years, s.difficultyIds, s.tab]);

export default function QuestionBankScreen({ navigate }: Props) {
  const { isMobile, contentPadding, tableMinWidth } = useResponsiveLayout();
  const catalogs = useQuestionBankCatalogs();

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

  // ── Densidade ──────────────────────────────────────────────────────────────
  const [density, setDensity] = useState<"padrao" | "compacta">(readDensity);
  const toggleDensity = () => {
    const next = density === "padrao" ? "compacta" : "padrao";
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {}
  };
  const rowPadding = density === "compacta" ? 6 : 12;

  // ── Seleção ────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
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

  const applyBulk = async (patch: ClassificationPatch) => {
    const ids = Array.from(selected);
    setApplying(true);
    setProgress({ done: 0, total: ids.length });
    try {
      const results = await patchClassificationBatch(buildBatchItems(ids, patch), (done, all) =>
        setProgress({ done, total: all })
      );
      const summary = summarizeBatch(results);
      setBulkAction(null);
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

  const quickPatch = async (row: QuestionBankQuestion, patch: ClassificationPatch) => {
    setMenuRow(null);
    try {
      showApiToast(setToast, await patchQuestionClassification(row.id, patch), "Classificação salva com sucesso.");
      void load();
    } catch (error) {
      showApiErrorToast(setToast, error, "Não foi possível salvar.");
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const tabs = tabsWithCounts(meta?.tab_counts ?? null);
  const filtered = hasActiveFilters(state) || state.search.trim() !== "";
  const noQuestionsAtAll = !filtered && (meta?.tab_counts.todas ?? 0) === 0;

  const SortHeader = ({ label, sort, style }: { label: string; sort: QuestionBankSort; style: object }) => {
    const current = ariaSort(state, sort);
    return (
      <TouchableOpacity
        onPress={() => updateState(nextSort(state, sort))}
        style={[{ flexDirection: "row", alignItems: "center", gap: 4 }, style]}
        role="columnheader"
        {...({ "aria-sort": current } as object)}
        aria-label={`Ordenar por ${label}`}
      >
        <Text className={TABLE_HEADER_CELL}>{label}</Text>
        <Ionicons
          name={current === "ascending" ? "arrow-up" : current === "descending" ? "arrow-down" : "swap-vertical"}
          size={12}
          color={current === "none" ? "#5F6878" : "#1C3D63"}
        />
      </TouchableOpacity>
    );
  };

  const Checkbox = ({ checked, mixed, onPress, label }: { checked: boolean; mixed?: boolean; onPress: () => void; label: string }) => (
    <TouchableOpacity
      onPress={onPress}
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      style={{ width: COL.select, alignItems: "center" }}
    >
      <Ionicons
        name={mixed ? "remove-circle" : checked ? "checkbox" : "square-outline"}
        size={18}
        color={checked || mixed ? "#1C3D63" : "#5F6878"}
      />
    </TouchableOpacity>
  );

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 120 }}>
        {/* Cabeçalho */}
        <View className="mb-5" style={{ flexDirection: isMobile ? "column" : "row", gap: 12, justifyContent: "space-between" }}>
          <View>
            <Text className="text-[28px] leading-9 font-semibold text-ink tracking-tight">Banco de questões</Text>
            <Text className="text-sm text-ink-muted mt-1">
              Questões avulsas e de simulados. Classifique para facilitar a busca e a montagem de simulados.
            </Text>
          </View>
          <View className="flex-row gap-2 items-start">
            <TouchableOpacity
              onPress={toggleDensity}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-ds-md border border-border bg-surface"
              aria-label={`Densidade: ${density === "padrao" ? "Padrão" : "Compacta"}. Alternar`}
            >
              <Ionicons name={density === "padrao" ? "reorder-four-outline" : "reorder-three-outline"} size={16} color="#4B5463" />
              <Text className="text-xs font-semibold text-ink-muted">{density === "padrao" ? "Padrão" : "Compacta"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigate("questoes-taxonomia")}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-ds-md bg-brand"
            >
              <Ionicons name="git-network-outline" size={16} color="#FFFFFF" />
              <Text className="text-xs font-semibold text-white">Taxonomia</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Abas (contagens atualizam sem trocar de aba: aria-live) */}
        <View className="mb-4" aria-live="polite">
          <Tabs
            accessibilityLabel="Situação das questões"
            items={tabs.map((tab) => ({ id: tab.key, label: tab.label, count: tab.count }))}
            value={state.tab}
            onChange={(tab) => updateState({ ...state, tab, page: 1 })}
          />
        </View>

        {/* Busca */}
        <View
          className="flex-row items-center bg-surface border border-border rounded-ds-md px-4 mb-3"
          style={{ height: 44 }}
        >
          <Ionicons name="search-outline" size={16} color="#5F6878" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar por nº (#123), enunciado, simulado ou tag..."
            placeholderTextColor="#5F6878"
            aria-label="Buscar questões"
            className="flex-1 ml-2 text-sm text-ink"
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText("")} aria-label="Limpar busca">
              <Ionicons name="close-circle" size={16} color="#5F6878" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtros */}
        <View className="mb-4" style={{ flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 12, alignItems: isMobile ? "stretch" : "flex-end" }}>
          <View style={filterBox(170)}>
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Disciplina"
              placeholder="Todas"
              modalTitle="Filtrar por disciplina"
              options={[{ value: "", label: "Todas" }, ...catalogs.subjects.map((s) => ({ value: String(s.id), label: s.name }))]}
              value={single(state.subjectIds)}
              onChange={(v) => updateState(withSubjectFilter(state, toIds(v)))}
            />
          </View>
          <View style={filterBox(170)}>
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Assunto"
              placeholder={subjectFilterId ? "Todos" : "Escolha a disciplina"}
              modalTitle="Filtrar por assunto"
              disabled={!subjectFilterId}
              options={[{ value: "", label: "Todos" }, ...filterTopics.map((t) => ({ value: String(t.id), label: t.name }))]}
              value={single(state.topicIds)}
              onChange={(v) => updateState({ ...state, topicIds: toIds(v), page: 1 })}
            />
          </View>
          <View style={filterBox(150)}>
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Banca"
              placeholder="Todas"
              modalTitle="Filtrar por banca"
              options={[{ value: "", label: "Todas" }, ...catalogs.boards.map((b) => ({ value: String(b.id), label: b.name }))]}
              value={single(state.boardIds)}
              onChange={(v) => updateState({ ...state, boardIds: toIds(v), page: 1 })}
            />
          </View>
          <View style={filterBox(120)}>
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Ano"
              placeholder="Todos"
              modalTitle="Filtrar por ano"
              options={[{ value: "", label: "Todos" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
              value={single(state.years)}
              onChange={(v) => updateState({ ...state, years: toIds(v), page: 1 })}
            />
          </View>
          <View style={filterBox(150)}>
            <SearchableSelect
              dense
              showSelectedPreview={false}
              label="Dificuldade"
              placeholder="Todas"
              modalTitle="Filtrar por dificuldade"
              options={[{ value: "", label: "Todas" }, ...catalogs.difficulties.map((d) => ({ value: String(d.id), label: d.name }))]}
              value={single(state.difficultyIds)}
              onChange={(v) => updateState({ ...state, difficultyIds: toIds(v), page: 1 })}
            />
          </View>
          {hasActiveFilters(state) && (
            <TouchableOpacity
              onPress={() => updateState(clearFilters(state))}
              className="flex-row items-center gap-1 px-3 rounded-ds-md border border-border bg-surface justify-center"
              style={{ height: 44 }}
            >
              <Ionicons name="close-outline" size={16} color="#4B5463" />
              <Text className="text-xs font-semibold text-ink-muted">Limpar filtros</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Barra de seleção / ações em massa */}
        {selected.size > 0 && (
          <View
            className="mb-3 rounded-ds-md border border-border bg-brand-tint px-4 py-3"
            style={{ flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}
          >
            <Text className="text-sm font-semibold text-brand" aria-live="polite">
              {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
            </Text>
            <View className="flex-row flex-wrap gap-2" style={{ flex: 1 }}>
              {(
                [
                  ["difficulty", "Dificuldade"],
                  ["subject", "Disciplina e assuntos"],
                  ["board", "Banca"],
                  ["year", "Ano"],
                  ["add_tags", "Tags"],
                  ["annul", "Anuladas"],
                  ["outdate", "Desatualizadas"],
                ] as [BulkAction, string][]
              ).map(([action, label]) => (
                <TouchableOpacity
                  key={action}
                  onPress={() => setBulkAction(action)}
                  aria-label={`Em massa: ${label}`}
                  className="px-3 py-1.5 rounded-ds-md bg-surface border border-border"
                >
                  <Text className="text-xs font-semibold text-brand">{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setSelected(new Set())}>
              <Text className="text-xs font-semibold text-ink-muted">Limpar seleção</Text>
            </TouchableOpacity>
          </View>
        )}
        {pageSelection === "all" && total > selected.size && (
          <View className="mb-3 flex-row items-center gap-2">
            <Text className="text-xs text-ink-muted">Todas as {pageIds.length} desta página estão selecionadas.</Text>
            <TouchableOpacity onPress={selectAllMatching} disabled={selectingAll}>
              <Text className="text-xs font-semibold text-brand">
                {selectingAll ? "Selecionando..." : `Selecionar todas as ${total}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tabela */}
        <ScrollView horizontal showsHorizontalScrollIndicator={isMobile} style={{ width: "100%" }} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
          <View
            className="bg-surface rounded-ds-md overflow-hidden border border-border"
            role="table"
            style={{ width: "100%", minWidth: isMobile ? tableMinWidth : 980, }}
          >
            <View className={TABLE_HEADER_ROW} style={[TABLE_HEADER_ROW_STYLE, { alignItems: "center" }]} role="row">
              <Checkbox
                checked={pageSelection === "all"}
                mixed={pageSelection === "some"}
                onPress={() => setSelected(togglePageSelection(selected, pageIds))}
                label="Selecionar questões desta página"
              />
              <SortHeader label="Nº" sort="id" style={{ width: COL.number }} />
              <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 280 }} role="columnheader">
                Enunciado
              </Text>
              <SortHeader label="Banca · Ano" sort="board" style={{ width: COL.board }} />
              <SortHeader label="Dificuldade" sort="difficulty" style={{ width: COL.difficulty }} />
              <Text className={TABLE_HEADER_CELL} style={{ width: COL.status }} role="columnheader">
                Situação
              </Text>
              <View style={{ width: COL.actions }} />
            </View>

            {loading && !result ? (
              Array.from({ length: 6 }, (_, i) => (
                <View key={i} className="flex-row items-center px-3 py-4 gap-4" aria-hidden>
                  <View className="bg-surface-sunken rounded-ds-md" style={{ width: 18, height: 18 }} />
                  <View className="bg-surface-sunken rounded-ds-md" style={{ width: 70, height: 12 }} />
                  <View className="bg-surface-sunken rounded-ds-md flex-1" style={{ height: 12 }} />
                  <View className="bg-surface-sunken rounded-ds-md" style={{ width: 100, height: 12 }} />
                  <View className="bg-surface-sunken rounded-ds-md" style={{ width: 90, height: 12 }} />
                </View>
              ))
            ) : loadError ? (
              <View className="py-14 items-center gap-3 px-6">
                <Ionicons name="cloud-offline-outline" size={32} color="#B0261B" />
                <Text className="text-sm text-ink-muted text-center">{loadError}</Text>
                <TouchableOpacity onPress={() => void load()} className="px-4 py-2 rounded-ds-md bg-brand">
                  <Text className="text-sm font-semibold text-white">Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : rows.length === 0 ? (
              <View className="py-14 items-center gap-2 px-6">
                <Ionicons name="document-text-outline" size={32} color="#7A8393" />
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
                    <Text className="text-xs font-semibold text-brand">Limpar busca e filtros</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ opacity: loading ? 0.6 : 1 }}>
                {rows.map((row, i) => (
                  <DataTableRow key={row.id} index={i} style={{ paddingVertical: rowPadding }}>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onPress={() => {
                        const next = new Set(selected);
                        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                        setSelected(next);
                      }}
                      label={`Selecionar questão ${row.id}`}
                    />
                    <View style={{ width: COL.number }}>
                      <Text className={TABLE_CELL_SEMIBOLD}>#{row.id}</Text>
                      <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                        {row.exam ? row.exam.title : "Avulsa"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 280, paddingRight: 12 }}>
                      <TouchableOpacity onPress={() => openClassify(row.id)} role="link" aria-label={`Classificar questão ${row.id}`}>
                        <Text className="text-xs text-brand font-medium" numberOfLines={density === "compacta" ? 1 : 2}>
                          {row.question_text?.trim() || (row.image_url ? "[Enunciado em imagem]" : "[Sem enunciado]")}
                        </Text>
                      </TouchableOpacity>
                      <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                        {row.subject
                          ? [row.subject.name, row.topics.map((t) => t.name).join(", ")].filter(Boolean).join(" › ")
                          : "Sem disciplina"}
                      </Text>
                    </View>
                    <View style={{ width: COL.board }}>
                      <Text className={row.board || row.year ? TABLE_CELL : TABLE_CELL_MUTED}>
                        {[row.board?.name, row.year].filter(Boolean).join(" · ") || "—"}
                      </Text>
                    </View>
                    <View style={{ width: COL.difficulty }}>
                      <DifficultyMeter difficulty={row.difficulty} levels={catalogs.difficulties.length} />
                    </View>
                    <View style={{ width: COL.status }}>
                      <QuestionStatusBadge isAnnulled={row.is_annulled} isOutdated={row.is_outdated} />
                    </View>
                    <View style={{ width: COL.actions, alignItems: "flex-end" }}>
                      <TouchableOpacity onPress={() => setMenuRow(row)} aria-label={`Ações da questão ${row.id}`} className="p-1.5 rounded-ds-md">
                        <Ionicons name="ellipsis-vertical" size={16} color="#4B5463" />
                      </TouchableOpacity>
                    </View>
                  </DataTableRow>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Paginação */}
        {meta && meta.total > 0 && (
          <View className="mt-4" style={{ flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between" }}>
            <View className="flex-row items-center gap-3">
              <Text className={TABLE_CELL_MUTED} aria-live="polite">
                {rangeLabel(meta.current_page, meta.per_page, meta.total)}
              </Text>
              <View style={{ width: 130 }}>
                <FormSelect
                  dense
                  label="Por página"
                  value={state.perPage}
                  options={PER_PAGE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                  onChange={(v) => updateState({ ...state, perPage: Number(v) as PerPage, page: 1 })}
                />
              </View>
            </View>
            {meta.last_page > 1 && (
              <Pagination
                currentPage={meta.current_page}
                lastPage={meta.last_page}
                total={meta.total}
                perPage={meta.per_page}
                onPageChange={(page) => updateState({ ...state, page })}
              />
            )}
          </View>
        )}
        {loading && result && (
          <View className="mt-3 items-center">
            <ActivityIndicator color="#1C3D63" />
          </View>
        )}
      </ScrollView>

      <Modal visible={!!menuRow} title={menuRow ? `Questão #${menuRow.id}` : ""} onClose={() => setMenuRow(null)} size="sm" compact>
        {menuRow && (
          <View style={{ gap: 6 }}>
            {(
              [
                ["create-outline", "Classificar", () => openClassify(menuRow.id)],
                [
                  "ban-outline",
                  menuRow.is_annulled ? "Desmarcar anulada" : "Marcar como anulada",
                  () => quickPatch(menuRow, { is_annulled: !menuRow.is_annulled }),
                ],
                [
                  "time-outline",
                  menuRow.is_outdated ? "Desmarcar desatualizada" : "Marcar como desatualizada",
                  () => quickPatch(menuRow, { is_outdated: !menuRow.is_outdated }),
                ],
                ...(menuRow.exam
                  ? [["document-text-outline", `Abrir simulado "${menuRow.exam.title}"`, () => navigate("simulados-form", { examId: menuRow.exam!.id })]]
                  : []),
              ] as [keyof typeof Ionicons.glyphMap, string, () => void][]
            ).map(([icon, label, action]) => (
              <TouchableOpacity key={label} onPress={action} className="flex-row items-center gap-3 px-3 py-3 rounded-ds-md border border-border">
                <Ionicons name={icon} size={18} color="#1C3D63" />
                <Text className="text-sm text-ink">{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>

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
