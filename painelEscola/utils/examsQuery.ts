/**
 * Estado da listagem de simulados ↔ query string do hash (#/simulados?...).
 * Valores padrão são omitidos da URL; valores inválidos são ignorados.
 */

export type ExamsListState = {
  search: string;
  status: string;
  examType: string;
  page: number;
};

export const DEFAULT_EXAMS_LIST_STATE: ExamsListState = {
  search: "",
  status: "",
  examType: "",
  page: 1,
};

const URL_KEYS = {
  search: "busca",
  status: "status",
  examType: "tipo",
  page: "pagina",
} as const;

/** Slug de status/modalidade: o que a API aceita em ?status= e ?exam_type=. */
const SLUG = /^[a-z0-9_-]{1,64}$/i;

export function parseExamsListState(query: string): ExamsListState {
  const params = new URLSearchParams(query);
  const state: ExamsListState = { ...DEFAULT_EXAMS_LIST_STATE };

  state.search = (params.get(URL_KEYS.search) ?? "").slice(0, 200);

  const status = params.get(URL_KEYS.status) ?? "";
  if (SLUG.test(status)) state.status = status;

  const examType = params.get(URL_KEYS.examType) ?? "";
  if (SLUG.test(examType)) state.examType = examType;

  const page = Number(params.get(URL_KEYS.page));
  if (Number.isInteger(page) && page > 1) state.page = page;

  return state;
}

export function serializeExamsListState(state: ExamsListState): string {
  const params = new URLSearchParams();
  const search = state.search.trim();
  if (search) params.set(URL_KEYS.search, search);
  if (SLUG.test(state.status)) params.set(URL_KEYS.status, state.status);
  if (SLUG.test(state.examType)) params.set(URL_KEYS.examType, state.examType);
  if (state.page > 1) params.set(URL_KEYS.page, String(state.page));
  return params.toString();
}
