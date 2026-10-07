import { expect, test } from "@playwright/test";
import {
  DEFAULT_LIST_STATE,
  ariaSort,
  batchSummaryMessage,
  chunk,
  foldText,
  hashQuery,
  nextSort,
  pageSelectionState,
  parseListState,
  rangeLabel,
  searchIdFromTerm,
  serializeListState,
  summarizeBatch,
  tabsWithCounts,
  toApiParams,
  togglePageSelection,
  withSubjectFilter,
} from "../utils/questionBankQuery";
import {
  EMPTY_CLASSIFICATION_FORM,
  addTag,
  diffClassification,
  withSubject,
  applyClassificationSuggestion,
} from "../utils/questionClassification";

/** Testes de lógica pura (sem navegador): npx playwright test tests/questionBankQuery.spec.ts */

test.describe("estado da listagem na URL", () => {
  test("estado padrão gera URL vazia e é lido de volta", () => {
    expect(serializeListState(DEFAULT_LIST_STATE)).toBe("");
    expect(parseListState("")).toEqual(DEFAULT_LIST_STATE);
  });

  test("ida e volta preserva filtros, aba, ordem e página", () => {
    const state = {
      ...DEFAULT_LIST_STATE,
      search: "função afim",
      subjectIds: [3],
      topicIds: [7, 8],
      boardIds: [1, 2],
      years: [2023],
      tab: "sem_classificacao" as const,
      sort: "difficulty" as const,
      direction: "desc" as const,
      page: 3,
      perPage: 50 as const,
    };
    const query = serializeListState(state);
    expect(query).toContain("banca=1,2");
    expect(parseListState(query)).toEqual(state);
  });

  test("aceita valores repetidos e por vírgula", () => {
    const state = parseListState("banca=1&banca=2,3&ano=2020");
    expect(state.boardIds).toEqual([1, 2, 3]);
    expect(state.years).toEqual([2020]);
  });

  test("ignora valores inválidos", () => {
    const state = parseListState(
      "banca=abc,-1,0,4&ano=1800,2024&aba=xyz&ordem=foo&dir=up&pagina=-2&porPagina=33&assunto=5"
    );
    expect(state.boardIds).toEqual([4]);
    expect(state.years).toEqual([2024]);
    expect(state.tab).toBe("todas");
    expect(state.sort).toBe("id");
    expect(state.direction).toBe("desc");
    expect(state.page).toBe(1);
    expect(state.perPage).toBe(20);
    // assunto sem disciplina é descartado
    expect(state.topicIds).toEqual([]);
  });

  test("lê a query a partir do hash", () => {
    expect(hashQuery("#/questoes/12?banca=1")).toBe("banca=1");
    expect(hashQuery("#/questoes")).toBe("");
  });

  test("trocar a disciplina limpa o assunto e volta para a página 1", () => {
    const state = { ...DEFAULT_LIST_STATE, subjectIds: [1], topicIds: [9], page: 4 };
    expect(withSubjectFilter(state, [2])).toMatchObject({ subjectIds: [2], topicIds: [], page: 1 });
  });

  test("parâmetros da API usam vírgula e omitem filtros vazios", () => {
    const params = toApiParams({ ...DEFAULT_LIST_STATE, boardIds: [1, 2], search: "  a   b " });
    expect(params).toMatchObject({ board_id: "1,2", search: "a b", page: 1, per_page: 20 });
    expect(params).not.toHaveProperty("subject_id");
    expect(toApiParams(DEFAULT_LIST_STATE, { paginate: false })).not.toHaveProperty("page");
  });
});

test.describe("busca", () => {
  test("#123 e 123 viram busca por id", () => {
    expect(searchIdFromTerm("#123")).toBe(123);
    expect(searchIdFromTerm(" 123 ")).toBe(123);
    expect(searchIdFromTerm("123a")).toBeNull();
  });

  test("comparação local ignora acentos e maiúsculas", () => {
    expect(foldText("ÁLGEBRA Linear")).toBe(foldText("algebra linear"));
  });
});

test.describe("ordenação", () => {
  test("alterna direção na mesma coluna e começa crescente em outra", () => {
    const byBoard = nextSort(DEFAULT_LIST_STATE, "board");
    expect(byBoard).toMatchObject({ sort: "board", direction: "asc" });
    expect(nextSort(byBoard, "board").direction).toBe("desc");
    expect(nextSort(DEFAULT_LIST_STATE, "id").direction).toBe("asc");
  });

  test("aria-sort reflete a coluna ativa", () => {
    const state = nextSort(DEFAULT_LIST_STATE, "difficulty");
    expect(ariaSort(state, "difficulty")).toBe("ascending");
    expect(ariaSort(state, "id")).toBe("none");
  });
});

test.describe("abas e paginação", () => {
  test("contagem por aba vem do servidor e fica nula enquanto carrega", () => {
    const tabs = tabsWithCounts({ todas: 10, regulares: 6, anuladas: 2, desatualizadas: 1, sem_classificacao: 4 });
    expect(tabs.map((t) => t.count)).toEqual([10, 6, 2, 1, 4]);
    expect(tabsWithCounts(null).every((t) => t.count === null)).toBe(true);
  });

  test("rótulo do intervalo", () => {
    expect(rangeLabel(1, 20, 345)).toBe("1–20 de 345");
    expect(rangeLabel(18, 20, 345)).toBe("341–345 de 345");
    expect(rangeLabel(1, 20, 0)).toBe("0 de 0");
  });
});

test.describe("seleção", () => {
  test("estado da página e alternância", () => {
    const page = [1, 2, 3];
    expect(pageSelectionState(new Set(), page)).toBe("none");
    expect(pageSelectionState(new Set([2]), page)).toBe("some");
    const all = togglePageSelection(new Set([2, 99]), page);
    expect(pageSelectionState(all, page)).toBe("all");
    expect(Array.from(togglePageSelection(all, page))).toEqual([99]);
  });
});

test.describe("lote", () => {
  test("falha parcial: conta, agrupa motivos e só desfaz as que deram certo", () => {
    const summary = summarizeBatch([
      { id: 1, ok: true, previous: { year: 2019, tags: [] } },
      { id: 2, ok: false, message: "Assunto não encontrado." },
      { id: 3, ok: false, message: "Assunto não encontrado." },
      { id: 4, ok: true, previous: { year: null } },
    ]);
    expect(summary).toMatchObject({ updated: 2, failed: 2, failedIds: [2, 3] });
    expect(summary.reasons).toEqual([{ message: "Assunto não encontrado.", count: 2 }]);
    expect(summary.undoItems).toEqual([
      { id: 1, year: 2019, tags: [] },
      { id: 4, year: null },
    ]);
    expect(batchSummaryMessage(summary)).toBe(
      "2 questões atualizadas; 2 falharam: Assunto não encontrado. (2)"
    );
  });

  test("divide em blocos", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

test.describe("formulário de classificação", () => {
  test("PATCH só leva o que mudou e null remove", () => {
    const initial = { ...EMPTY_CLASSIFICATION_FORM, board_id: 3, year: 2020, tags: ["ENEM"] };
    const current = { ...initial, board_id: null, tags: ["enem"] };
    expect(diffClassification(initial, current)).toEqual({ board_id: null });
  });

  test("trocar a disciplina descarta assuntos de outra disciplina e envia os assuntos", () => {
    const topicSubject = new Map([[10, 1], [20, 2]]);
    const initial = { ...EMPTY_CLASSIFICATION_FORM, subject_id: 1, topic_ids: [10] };
    const changed = withSubject(initial, 2, topicSubject);
    expect(changed.topic_ids).toEqual([]);
    expect(diffClassification(initial, changed)).toEqual({ subject_id: 2, topic_ids: [] });
  });

  test("tags sem duplicar e com espaços normalizados", () => {
    expect(addTag(["Funções"], "  funções ")).toEqual(["Funções"]);
    expect(addTag([], "  revisão   final ")).toEqual(["revisão final"]);
  });
});

test("autocompletar da importação sobrescreve disciplina/assuntos e mantém a modalidade", () => {
  const form = { ...EMPTY_CLASSIFICATION_FORM, subject_id: 1, topic_ids: [10], difficulty_id: 2, exam_type_id: 15, tags: ["a"] };
  const next = applyClassificationSuggestion(form, { subject_id: 3, topic_ids: [30, 31], difficulty_id: 4, exam_type_id: 2, tags: ["b"] });
  expect(next).toMatchObject({ subject_id: 3, topic_ids: [30, 31], difficulty_id: 4, exam_type_id: 15, tags: ["a", "b"] });
  // Sem disciplina sugerida, não apaga a classificação existente.
  expect(applyClassificationSuggestion(form, { tags: [] })).toMatchObject({ subject_id: 1, topic_ids: [10] });
});
