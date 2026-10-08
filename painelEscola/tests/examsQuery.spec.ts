import { expect, test } from "@playwright/test";
import { DEFAULT_EXAMS_LIST_STATE, parseExamsListState, serializeExamsListState } from "../utils/examsQuery";

/** Testes de lógica pura (sem navegador): npx playwright test tests/examsQuery.spec.ts */

test.describe("filtros de simulados na URL", () => {
  test("estado padrão gera URL vazia e é lido de volta", () => {
    expect(serializeExamsListState(DEFAULT_EXAMS_LIST_STATE)).toBe("");
    expect(parseExamsListState("")).toEqual(DEFAULT_EXAMS_LIST_STATE);
  });

  test("ida e volta preserva busca, status, tipo e página", () => {
    const state = { search: "ENEM 2024", status: "published", examType: "enem", page: 3 };
    const query = serializeExamsListState(state);
    expect(query).toBe("busca=ENEM+2024&status=published&tipo=enem&pagina=3");
    expect(parseExamsListState(query)).toEqual(state);
  });

  test("ignora status, tipo e página inválidos", () => {
    const state = parseExamsListState("status=publicado!&tipo=&pagina=0&pagina=-2&busca=ok");
    expect(state.status).toBe("");
    expect(state.examType).toBe("");
    expect(state.page).toBe(1);
    expect(state.search).toBe("ok");
  });
});
