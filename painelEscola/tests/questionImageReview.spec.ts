import { expect, test } from "@playwright/test";
import { contentFromSuggestion, contentPayload, EMPTY_CONTENT_FORM, mergeContentSuggestion } from "../utils/questionContent";
import { imageContentSignature, imageReviewIssue } from "../utils/questionImageReview";
import type { AiImageReview, AiQuestionSuggestion } from "../types/questionAi";

const suggestion: AiQuestionSuggestion = {
  type: "essay",
  question_text: "Triângulo com 6 cm, 8 cm e 10 cm.",
  explanation: "Resposta esperada.",
  image_url: "https://school.test/storage/image.png",
};

const image: AiImageReview = {
  generation_id: "a-generation",
  image_url: suggestion.image_url ?? null,
  image_generation: {
    status: "READY", model: "test/image", attempts: 1,
    validation: { valida: true, confidence: 0.94, problemas: [], recomendacao: null },
    reason: null,
  },
};

test("a revisão preserva a imagem no payload de aprovação", () => {
  const form = contentFromSuggestion(suggestion);
  expect(contentPayload(form).image_url).toBe(suggestion.image_url);
  expect(imageReviewIssue(form, image, imageContentSignature(form))).toBeNull();
});

test("questão sem imagem mantém o formulário e fluxo antigos", () => {
  const form = contentFromSuggestion({ ...suggestion, image_url: undefined });
  expect(form.image_url).toBe("");
  expect(imageReviewIssue(form)).toBeNull();
  expect(EMPTY_CONTENT_FORM().image_url).toBe("");
});

test("alterar medidas invalida a imagem antes da aprovação", () => {
  const form = contentFromSuggestion(suggestion);
  const signature = imageContentSignature(form);
  expect(imageReviewIssue({ ...form, question_text: "Triângulo com 3 cm, 4 cm e 5 cm." }, image, signature))
    .toContain("Regenere");
});

test("imagem com validação reprovada não pode ser aprovada", () => {
  const form = contentFromSuggestion(suggestion);
  expect(imageReviewIssue(form, {
    ...image, image_generation: { ...image.image_generation, status: "NEEDS_REVIEW", reason: "A imagem mostra 4 cm em vez de 8 cm." },
  }, imageContentSignature(form))).toContain("4 cm");
});

test("mudança de gabarito invalida a imagem, mas mudança de explicação não", () => {
  const form = contentFromSuggestion({
    ...suggestion, type: "multiple_choice",
    options: [{ option_text: "6", is_correct: true }, { option_text: "8", is_correct: false }],
  });
  const signature = imageContentSignature(form);
  expect(imageReviewIssue({ ...form, explanation: "Outra explicação" }, image, signature)).toBeNull();
  expect(imageReviewIssue({ ...form, options: form.options.map((o) => ({ ...o, is_correct: !o.is_correct })) }, image, signature))
    .toContain("Regenere");
});

test("autocompletar preserva alternativas e explicação que já foram digitadas", () => {
  const form = contentFromSuggestion({
    ...suggestion, type: "multiple_choice",
    options: [{ option_text: "Texto digitado A", is_correct: false }, { option_text: "Texto digitado B", is_correct: true }],
  });
  const merged = mergeContentSuggestion(form, {
    ...suggestion, type: "multiple_choice", explanation: "Explicação da IA",
    options: [{ option_text: "Outro texto A", is_correct: true }, { option_text: "Outro texto B", is_correct: false }],
  }).form;
  expect(merged.options.map((option) => option.option_text)).toEqual(["Texto digitado A", "Texto digitado B"]);
  expect(merged.explanation).toBe(form.explanation);
});
