import { expect, test } from "@playwright/test";
import { EMPTY_CONTENT_FORM, contentPayload, markCorrect, validateContent } from "../utils/questionContent";

/** Lógica pura (sem navegador): npx playwright test tests/questionContent.spec.ts --project=chromium */

test.describe("conteúdo de questão avulsa", () => {
  test("exige enunciado ou imagem", () => {
    const form = { ...EMPTY_CONTENT_FORM(), type: "essay" as const };
    expect(validateContent(form).question_text).toBeTruthy();
    expect(validateContent({ ...form, image_url: "https://x/y.png" })).toEqual({});
  });

  test("objetiva: 2 alternativas preenchidas e exatamente uma correta", () => {
    const base = { ...EMPTY_CONTENT_FORM(), question_text: "Quanto é 2 + 2?" };
    expect(validateContent(base).options).toBe("Informe pelo menos 2 alternativas preenchidas.");

    const filled = base.options.map((o, i) => ({ ...o, option_text: String(i + 3) }));
    expect(validateContent({ ...base, options: filled }).options).toBe("Marque exatamente uma alternativa como correta.");
    expect(validateContent({ ...base, options: markCorrect(filled, filled[1].key) })).toEqual({});
  });

  test("marcar a correta desmarca as outras", () => {
    const opts = EMPTY_CONTENT_FORM().options;
    const once = markCorrect(opts, opts[0].key);
    const twice = markCorrect(once, opts[2].key);
    expect(twice.map((o) => o.is_correct)).toEqual([false, false, true, false]);
  });

  test("payload descarta alternativas vazias e numera a ordem", () => {
    const form = EMPTY_CONTENT_FORM();
    form.question_text = "  Enunciado  ";
    form.options[0] = { ...form.options[0], option_text: " A ", is_correct: true };
    form.options[2] = { ...form.options[2], option_text: "C" };
    expect(contentPayload(form)).toEqual({
      type: "multiple_choice",
      question_text: "Enunciado",
      image_url: null,
      explanation: null,
      options: [
        { option_text: "A", is_correct: true, order: 1 },
        { option_text: "C", is_correct: false, order: 2 },
      ],
    });
    expect(contentPayload({ ...form, type: "essay" })).not.toHaveProperty("options");
  });
});
