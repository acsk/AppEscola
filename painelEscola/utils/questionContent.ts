import type { QuestionBankQuestion } from "../types/questionBank";
import type { AiQuestionSuggestion } from "../types/questionAi";
import { plainRichText } from "./richText";

/** Formulário de conteúdo de questão avulsa (enunciado, imagem, alternativas, explicação). */
export type QuestionType = "multiple_choice" | "essay";

export type OptionDraft = { key: string; option_text: string; is_correct: boolean };

export type ContentForm = {
  type: QuestionType;
  question_text: string;
  image_url: string;
  explanation: string;
  options: OptionDraft[];
};

export const MAX_OPTIONS = 10;

let keySeq = 0;
export const newOptionKey = () => `opt-${Date.now()}-${keySeq++}`;

export function emptyOptions(count = 4): OptionDraft[] {
  return Array.from({ length: count }, () => ({ key: newOptionKey(), option_text: "", is_correct: false }));
}

export const EMPTY_CONTENT_FORM = (): ContentForm => ({
  type: "multiple_choice",
  question_text: "",
  image_url: "",
  explanation: "",
  options: emptyOptions(),
});

export function contentFromQuestion(q: QuestionBankQuestion): ContentForm {
  const options = (q.options ?? []).map((o) => ({ key: newOptionKey(), option_text: o.option_text, is_correct: o.is_correct }));
  return {
    type: q.type,
    question_text: q.question_text ?? "",
    image_url: q.image_url ?? "",
    explanation: q.explanation ?? "",
    options: q.type === "multiple_choice" && options.length ? options : emptyOptions(),
  };
}

/** Marca uma alternativa como a correta (só uma por questão). */
export function markCorrect(options: OptionDraft[], key: string): OptionDraft[] {
  return options.map((o) => ({ ...o, is_correct: o.key === key }));
}

/** Validação no cliente; espelha a da API (que continua sendo a fonte da verdade). */
export function validateContent(form: ContentForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!plainRichText(form.question_text).trim() && !form.image_url.trim()) {
    errors.question_text = "Informe o texto do enunciado, a imagem, ou ambos.";
  }
  if (form.type === "multiple_choice") {
    const filled = form.options.filter((o) => plainRichText(o.option_text).trim() !== "");
    if (filled.length < 2) {
      errors.options = "Informe pelo menos 2 alternativas preenchidas.";
    } else if (filled.filter((o) => o.is_correct).length !== 1) {
      errors.options = "Marque exatamente uma alternativa como correta.";
    }
  }
  return errors;
}

/** Payload da API: textos aparados, vazios viram null e alternativas em branco são descartadas. */
export function contentPayload(form: ContentForm) {
  const text = form.question_text.trim();
  const payload: Record<string, unknown> = {
    type: form.type,
    question_text: text || null,
    image_url: form.image_url.trim() || null,
    explanation: form.explanation.trim() || null,
  };
  if (form.type === "multiple_choice") {
    payload.options = form.options
      .filter((o) => plainRichText(o.option_text).trim() !== "")
      .map((o, i) => ({ option_text: o.option_text.trim(), is_correct: o.is_correct, order: i + 1 }));
  }
  return payload;
}

/** Conteúdo completo a partir de uma sugestão da IA (questões semelhantes). */
export function contentFromSuggestion(s: AiQuestionSuggestion): ContentForm {
  const options = (s.options ?? []).map((o) => ({ key: newOptionKey(), option_text: o.option_text, is_correct: o.is_correct }));
  return {
    type: s.type,
    question_text: s.question_text ?? "",
    image_url: s.image_url ?? "",
    explanation: s.explanation ?? "",
    options: s.type === "multiple_choice" && options.length ? options : emptyOptions(),
  };
}

/** Dissertativa convertida pela IA: enunciado reescrito, alternativas novas e resolução (a imagem fica). */
export function objectiveFromSuggestion(form: ContentForm, s: AiQuestionSuggestion): ContentForm {
  return {
    ...form,
    type: "multiple_choice",
    question_text: plainRichText(s.question_text).trim() ? s.question_text : form.question_text,
    explanation: plainRichText(s.explanation).trim() ? s.explanation : form.explanation,
    options: (s.options ?? []).map((o) => ({ key: newOptionKey(), option_text: o.option_text, is_correct: o.is_correct })),
  };
}

/**
 * Aplica a sugestão da IA sem apagar o que o usuário já preencheu:
 * - sem alternativas digitadas: usa as da IA (e o enunciado da IA, que vem sem as alternativas embutidas);
 * - com alternativas digitadas: mantém os textos e só marca a correta indicada;
 * - explicação só se estiver vazia.
 */
export function mergeContentSuggestion(form: ContentForm, s: AiQuestionSuggestion): { form: ContentForm; filled: string[] } {
  const filled: string[] = [];
  const next: ContentForm = { ...form, type: s.type };
  const typed = form.options.filter((o) => plainRichText(o.option_text).trim() !== "");

  if (s.type === "multiple_choice" && s.options?.length) {
    if (typed.length === 0) {
      next.options = s.options.map((o) => ({ key: newOptionKey(), option_text: o.option_text, is_correct: o.is_correct }));
      if (plainRichText(s.question_text).trim()) next.question_text = s.question_text;
      filled.push("alternativas");
    } else {
      const correct = s.options.findIndex((o) => o.is_correct);
      const target = typed[correct];
      if (target) next.options = markCorrect(form.options, target.key);
    }
    filled.push("gabarito");
  }
  if (!plainRichText(form.explanation).trim() && plainRichText(s.explanation).trim()) {
    next.explanation = s.explanation;
    filled.push("explicação");
  }
  return { form: next, filled };
}
