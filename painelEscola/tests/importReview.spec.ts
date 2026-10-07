import { expect, test } from "@playwright/test";
import { findSourcePage, questionSnippet, questionTextRun, reviewIssues, reviewStatus } from "../utils/importReview";
import { EMPTY_CLASSIFICATION_FORM } from "../utils/questionClassification";

/** Lógica pura (sem navegador): npx playwright test tests/importReview.spec.ts --project=chromium */

const base = {
  content: {
    type: "multiple_choice" as const,
    question_text: "<b>Texto I</b>\nTexto de apoio longo.\n\nDe acordo com o texto, a urina clara indica que estamos",
    image_url: "",
    explanation: "",
    options: [
      { key: "a", option_text: "infectados", is_correct: false },
      { key: "b", option_text: "hidratados", is_correct: true },
    ],
  },
  classification: { ...EMPTY_CLASSIFICATION_FORM, subject_id: 2, topic_ids: [10] },
  needsImage: false,
  answerFromPdf: false,
};

test("pendências e status da revisão", () => {
  expect(reviewIssues(base)).toEqual([]);
  expect(reviewStatus(base, [])).toBe("check");
  expect(reviewStatus({ ...base, reviewed: true }, [])).toBe("ok");

  const noAnswer = { ...base, content: { ...base.content, options: base.content.options.map((o) => ({ ...o, is_correct: false })) } };
  expect(reviewIssues(noAnswer)).toEqual(["gabarito"]);
  expect(reviewIssues({ ...base, needsImage: true })).toEqual(["imagem"]);

  const noTopic = { ...base, classification: { ...base.classification, topic_ids: [] } };
  expect(reviewIssues(noTopic)).toEqual([]); // disciplina sem assuntos cadastrados
  expect(reviewIssues(noTopic, () => true)).toEqual(["assunto"]);
  expect(reviewIssues({ ...base, classification: EMPTY_CLASSIFICATION_FORM })).toEqual(["disciplina"]);
  // Revisada mas com pendência nova: volta a "warn".
  expect(reviewStatus({ ...noAnswer, reviewed: true }, ["gabarito"])).toBe("warn");
});

test("resumo usa o comando, não o texto de apoio", () => {
  expect(questionSnippet(base.content.question_text, 30)).toBe("De acordo com o texto, a urin…");
  expect(questionSnippet("")).toBe("Sem enunciado");
});

test("página e trecho da questão no PDF", () => {
  const pages = ["Capa", "1. Outra questão qualquer", "3. De acordo com o  texto, a urina clara indica que estamos\na) infectados"];
  expect(findSourcePage(pages, base.content.question_text)).toBe(3);
  expect(findSourcePage(pages, "curto")).toBeNull();

  const items = ["Galo de campina", "3. De acordo com o texto, a urina", "clara indica que estamos", "a)", "infectados", "b)", "hidratados", "4. Próxima"];
  expect(questionTextRun(items, base.content.question_text, ["infectados", "hidratados"])).toEqual([1, 2, 4, 6]);
});
