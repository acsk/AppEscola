import type {
  BatchItem,
  BatchResult,
  ClassificationPatch,
  QuestionBankSort,
  QuestionBankTab,
  QuestionBankTabCounts,
  SortDirection,
} from "../types/questionBank";

/**
 * Estado da listagem do banco de questões ↔ query string do hash (#/questoes?...).
 * Valores padrão são omitidos da URL; valores inválidos são ignorados.
 */

export const QUESTION_BANK_TABS: { key: QuestionBankTab; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "regulares", label: "Regulares" },
  { key: "anuladas", label: "Anuladas" },
  { key: "desatualizadas", label: "Desatualizadas" },
  { key: "sem_classificacao", label: "Sem classificação" },
];

/** Origem da questão (param `origin` da API). */
export const QUESTION_BANK_ORIGINS = [
  { key: "avulsa", label: "Avulsas" },
  { key: "avulsa_livre", label: "Avulsas fora de simulados do banco" },
  { key: "simulado_banco", label: "Em simulados do banco" },
  { key: "simulado", label: "De simulados oficiais (bloqueadas)" },
] as const;

export type QuestionBankOrigin = (typeof QUESTION_BANK_ORIGINS)[number]["key"];

export const PER_PAGE_OPTIONS = [20, 50, 100] as const;

export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export type QuestionBankListState = {
  search: string;
  subjectIds: number[];
  topicIds: number[];
  boardIds: number[];
  years: number[];
  difficultyIds: number[];
  origin: QuestionBankOrigin | "";
  examTypeIds: number[];
  /** Simulados oficiais. */
  examIds: number[];
  /** Simulados do banco. */
  questionSetIds: number[];
  /** Só questões que os alunos já erraram, da maior taxa de erro para a menor. */
  mostErrors: boolean;
  /** Esconde as que já foram marcadas como revalidadas. */
  hideRevalidated: boolean;
  /** Só questões sem disciplina. */
  withoutSubject: boolean;
  tab: QuestionBankTab;
  sort: QuestionBankSort;
  direction: SortDirection;
  page: number;
  perPage: PerPage;
};

export const DEFAULT_LIST_STATE: QuestionBankListState = {
  search: "",
  subjectIds: [],
  topicIds: [],
  boardIds: [],
  years: [],
  difficultyIds: [],
  origin: "",
  examTypeIds: [],
  examIds: [],
  questionSetIds: [],
  mostErrors: false,
  hideRevalidated: false,
  withoutSubject: false,
  tab: "todas",
  sort: "id",
  direction: "desc",
  page: 1,
  perPage: 20,
};

/** Chaves da URL (em português, como os slugs do painel). */
const URL_KEYS = {
  search: "busca",
  subjectIds: "disciplina",
  topicIds: "assunto",
  boardIds: "banca",
  years: "ano",
  difficultyIds: "dificuldade",
  origin: "origem",
  examTypeIds: "modalidade",
  examIds: "simulado",
  questionSetIds: "simuladoBanco",
  mostErrors: "erros",
  hideRevalidated: "ocultarRevalidadas",
  withoutSubject: "semDisciplina",
  tab: "aba",
  sort: "ordem",
  direction: "dir",
  page: "pagina",
  perPage: "porPagina",
} as const;

const SORT_URL: Record<QuestionBankSort, string> = { id: "numero", board: "banca", difficulty: "dificuldade", errors: "erros" };

const ID_LIST_FIELDS = [
  "subjectIds", "topicIds", "boardIds", "years", "difficultyIds", "examTypeIds", "examIds", "questionSetIds",
] as const;

function parseIdList(values: string[], isValid: (n: number) => boolean = (n) => n > 0): number[] {
  const ids = values
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
    .map(Number)
    .filter(isValid);
  return Array.from(new Set(ids));
}

/** Parte da query de um hash como "#/questoes/12?banca=1" → "banca=1". */
export function hashQuery(hash: string): string {
  const index = hash.indexOf("?");
  return index >= 0 ? hash.slice(index + 1) : "";
}

export function parseListState(query: string): QuestionBankListState {
  const params = new URLSearchParams(query);
  const state: QuestionBankListState = { ...DEFAULT_LIST_STATE };

  state.search = (params.get(URL_KEYS.search) ?? "").slice(0, 200);

  for (const field of ID_LIST_FIELDS) {
    const isValid = field === "years" ? (n: number) => n >= 1900 && n <= 2100 : undefined;
    state[field] = parseIdList(params.getAll(URL_KEYS[field]), isValid);
  }
  // Assunto sem disciplina não faz sentido no filtro (o select fica desabilitado).
  if (state.subjectIds.length === 0) state.topicIds = [];

  state.mostErrors = params.get(URL_KEYS.mostErrors) === "1";
  state.hideRevalidated = params.get(URL_KEYS.hideRevalidated) === "1";
  state.withoutSubject = params.get(URL_KEYS.withoutSubject) === "1";
  if (state.withoutSubject) {
    state.subjectIds = [];
    state.topicIds = [];
  }

  const origin = params.get(URL_KEYS.origin);
  if (QUESTION_BANK_ORIGINS.some((o) => o.key === origin)) state.origin = origin as QuestionBankOrigin;

  const tab = params.get(URL_KEYS.tab);
  if (QUESTION_BANK_TABS.some((t) => t.key === tab)) state.tab = tab as QuestionBankTab;

  const sortEntry = Object.entries(SORT_URL).find(([, slug]) => slug === params.get(URL_KEYS.sort));
  if (sortEntry) {
    state.sort = sortEntry[0] as QuestionBankSort;
    state.direction = defaultDirection(state.sort);
  }
  const direction = params.get(URL_KEYS.direction);
  if (direction === "asc" || direction === "desc") state.direction = direction;

  const page = Number(params.get(URL_KEYS.page));
  if (Number.isInteger(page) && page > 1) state.page = page;

  const perPage = Number(params.get(URL_KEYS.perPage));
  if ((PER_PAGE_OPTIONS as readonly number[]).includes(perPage)) state.perPage = perPage as PerPage;

  return state;
}

export function serializeListState(state: QuestionBankListState): string {
  const params = new URLSearchParams();
  const search = state.search.trim();
  if (search) params.set(URL_KEYS.search, search);

  for (const field of ID_LIST_FIELDS) {
    if (state[field].length) params.set(URL_KEYS[field], state[field].join(","));
  }
  if (state.mostErrors) params.set(URL_KEYS.mostErrors, "1");
  if (state.hideRevalidated) params.set(URL_KEYS.hideRevalidated, "1");
  if (state.withoutSubject) params.set(URL_KEYS.withoutSubject, "1");
  if (state.origin) params.set(URL_KEYS.origin, state.origin);
  if (state.tab !== DEFAULT_LIST_STATE.tab) params.set(URL_KEYS.tab, state.tab);
  if (state.sort !== DEFAULT_LIST_STATE.sort) params.set(URL_KEYS.sort, SORT_URL[state.sort]);
  if (state.direction !== defaultDirection(state.sort)) params.set(URL_KEYS.direction, state.direction);
  if (state.page > 1) params.set(URL_KEYS.page, String(state.page));
  if (state.perPage !== DEFAULT_LIST_STATE.perPage) params.set(URL_KEYS.perPage, String(state.perPage));

  return params.toString().replace(/%2C/g, ",");
}

/** Parâmetros da API (/question-bank/questions). */
export function toApiParams(state: QuestionBankListState, options: { paginate?: boolean } = {}) {
  const params: Record<string, string | number> = {
    tab: state.tab,
    sort: state.sort,
    direction: state.direction,
  };
  const search = normalizeSearchTerm(state.search);
  if (search) params.search = search;
  if (state.subjectIds.length) params.subject_id = state.subjectIds.join(",");
  if (state.topicIds.length) params.topic_id = state.topicIds.join(",");
  if (state.boardIds.length) params.board_id = state.boardIds.join(",");
  if (state.years.length) params.year = state.years.join(",");
  if (state.difficultyIds.length) params.difficulty_id = state.difficultyIds.join(",");
  if (state.origin) params.origin = state.origin;
  if (state.examTypeIds.length) params.exam_type_id = state.examTypeIds.join(",");
  if (state.examIds.length) params.exam_id = state.examIds.join(",");
  if (state.questionSetIds.length) params.question_set_id = state.questionSetIds.join(",");
  if (state.mostErrors) params.with_errors = 1;
  if (state.hideRevalidated) params.hide_revalidated = 1;
  if (state.withoutSubject) params.without_subject = 1;
  if (options.paginate !== false) {
    params.page = state.page;
    params.per_page = state.perPage;
  }
  return params;
}

/** Busca: espaços colapsados; acentos e maiúsculas são ignorados pelo servidor. */
export function normalizeSearchTerm(term: string): string {
  return term.replace(/\s+/g, " ").trim();
}

/** "#123" ou "123" → 123 (busca pelo id). */
export function searchIdFromTerm(term: string): number | null {
  const match = normalizeSearchTerm(term).match(/^#?(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Comparação sem acentos e sem maiúsculas (usada em filtros locais de listas curtas). */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function hasActiveFilters(state: QuestionBankListState): boolean {
  return state.mostErrors || state.hideRevalidated || state.withoutSubject || state.origin !== "" || ID_LIST_FIELDS.some((field) => state[field].length > 0);
}

export function clearFilters(state: QuestionBankListState): QuestionBankListState {
  return {
    ...state,
    subjectIds: [], topicIds: [], boardIds: [], years: [], difficultyIds: [],
    origin: "", examTypeIds: [], examIds: [], questionSetIds: [],
    mostErrors: false,
    hideRevalidated: false,
    withoutSubject: false,
    page: 1,
  };
}

/** Troca de disciplina limpa o assunto. */
export function withSubjectFilter(state: QuestionBankListState, subjectIds: number[]): QuestionBankListState {
  return { ...state, subjectIds, topicIds: [], withoutSubject: subjectIds.length > 0 ? false : state.withoutSubject, page: 1 };
}

function defaultDirection(sort: QuestionBankSort): SortDirection {
  return sort === "board" || sort === "difficulty" ? "asc" : "desc";
}

/** Liga o filtro das questões que os alunos mais erram e ordena pela taxa de erro. */
export function toggleMostErrors(state: QuestionBankListState): QuestionBankListState {
  const mostErrors = !state.mostErrors;
  if (mostErrors) {
    return { ...state, mostErrors, sort: "errors", direction: "desc", page: 1 };
  }
  return {
    ...state,
    mostErrors,
    sort: state.sort === "errors" ? "id" : state.sort,
    direction: state.sort === "errors" ? "desc" : state.direction,
    page: 1,
  };
}

/** Clique no cabeçalho: mesma coluna alterna a direção; outra coluna começa na direção padrão dela. */
export function nextSort(state: QuestionBankListState, sort: QuestionBankSort): QuestionBankListState {
  const direction: SortDirection =
    state.sort === sort ? (state.direction === "asc" ? "desc" : "asc") : defaultDirection(sort);
  return { ...state, sort, direction, page: 1 };
}

export function ariaSort(state: QuestionBankListState, sort: QuestionBankSort): "ascending" | "descending" | "none" {
  if (state.sort !== sort) return "none";
  return state.direction === "asc" ? "ascending" : "descending";
}

export function tabsWithCounts(counts: QuestionBankTabCounts | null) {
  return QUESTION_BANK_TABS.map((tab) => ({ ...tab, count: counts ? counts[tab.key] ?? 0 : null }));
}

/** "1–20 de 345" */
export function rangeLabel(page: number, perPage: number, total: number): string {
  if (total === 0) return "0 de 0";
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  return `${start}–${end} de ${total}`;
}

// ── Seleção ─────────────────────────────────────────────────────────────────

export type PageSelection = "none" | "some" | "all";

export function pageSelectionState(selected: ReadonlySet<number>, pageIds: number[]): PageSelection {
  if (pageIds.length === 0) return "none";
  const count = pageIds.filter((id) => selected.has(id)).length;
  if (count === 0) return "none";
  return count === pageIds.length ? "all" : "some";
}

export function togglePageSelection(selected: ReadonlySet<number>, pageIds: number[]): Set<number> {
  const next = new Set(selected);
  if (pageSelectionState(selected, pageIds) === "all") {
    pageIds.forEach((id) => next.delete(id));
  } else {
    pageIds.forEach((id) => next.add(id));
  }
  return next;
}

// ── Lote ────────────────────────────────────────────────────────────────────

/** Tamanho de cada PATCH em lote (a API aceita até 500 itens). */
export const BATCH_CHUNK_SIZE = 200;

export function buildBatchItems(ids: number[], patch: ClassificationPatch): BatchItem[] {
  return ids.map((id) => ({ id, ...patch }));
}

export function chunk<T>(items: T[], size: number = BATCH_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type BatchSummary = {
  updated: number;
  failed: number;
  failedIds: number[];
  /** Motivos agrupados: mensagem → quantidade. */
  reasons: { message: string; count: number }[];
  /** Itens para "Desfazer" (valores anteriores das que deram certo). */
  undoItems: BatchItem[];
};

export function summarizeBatch(results: BatchResult[]): BatchSummary {
  const failed = results.filter((r) => !r.ok);
  const reasons = new Map<string, number>();
  failed.forEach((r) => {
    const message = r.message ?? "Erro desconhecido.";
    reasons.set(message, (reasons.get(message) ?? 0) + 1);
  });

  return {
    updated: results.length - failed.length,
    failed: failed.length,
    failedIds: failed.map((r) => r.id),
    reasons: Array.from(reasons, ([message, count]) => ({ message, count })),
    undoItems: results.filter((r) => r.ok && r.previous).map((r) => ({ id: r.id, ...r.previous })),
  };
}

export function batchSummaryMessage(summary: BatchSummary): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const ok = plural(summary.updated, "questão atualizada", "questões atualizadas");
  if (summary.failed === 0) return `${ok}.`;
  const reasons = summary.reasons.map((r) => `${r.message} (${r.count})`).join("; ");
  return `${ok}; ${plural(summary.failed, "falhou", "falharam")}: ${reasons}`;
}
