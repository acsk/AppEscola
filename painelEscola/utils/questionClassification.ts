import type { ClassificationPatch, QuestionBankQuestion } from "../types/questionBank";
import { plainRichText } from "./richText";

/** Formulário de classificação de uma questão (somente classificação; conteúdo é só leitura). */
export type ClassificationForm = {
  difficulty_id: number | null;
  subject_id: number | null;
  topic_ids: number[];
  board_id: number | null;
  year: number | null;
  exam_type_id: number | null;
  is_annulled: boolean;
  is_outdated: boolean;
  tags: string[];
};

export const EMPTY_CLASSIFICATION_FORM: ClassificationForm = {
  difficulty_id: null,
  subject_id: null,
  topic_ids: [],
  board_id: null,
  year: null,
  exam_type_id: null,
  is_annulled: false,
  is_outdated: false,
  tags: [],
};

export function formFromQuestion(q: QuestionBankQuestion): ClassificationForm {
  return {
    difficulty_id: q.difficulty_id,
    subject_id: q.subject_id,
    topic_ids: [...q.topic_ids],
    board_id: q.board_id,
    year: q.year,
    exam_type_id: q.exam_type_id,
    is_annulled: q.is_annulled,
    is_outdated: q.is_outdated,
    tags: [...q.tags],
  };
}

/** Trocar a disciplina descarta os assuntos que não são da nova disciplina. */
export function withSubject(
  form: ClassificationForm,
  subjectId: number | null,
  topicSubjectById: ReadonlyMap<number, number>
): ClassificationForm {
  return {
    ...form,
    subject_id: subjectId,
    topic_ids: form.topic_ids.filter((id) => subjectId !== null && topicSubjectById.get(id) === subjectId),
  };
}

const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((v) => b.includes(v));

const sameTags = (a: string[], b: string[]) =>
  sameSet(a.map((t) => t.toLocaleLowerCase()), b.map((t) => t.toLocaleLowerCase()));

/** PATCH apenas com os campos alterados (campo ausente não altera; null remove). */
export function diffClassification(initial: ClassificationForm, current: ClassificationForm): ClassificationPatch {
  const patch: ClassificationPatch = {};
  if (initial.difficulty_id !== current.difficulty_id) patch.difficulty_id = current.difficulty_id;
  if (initial.subject_id !== current.subject_id) patch.subject_id = current.subject_id;
  if (!sameSet(initial.topic_ids, current.topic_ids) || initial.subject_id !== current.subject_id) {
    patch.topic_ids = current.topic_ids;
  }
  if (initial.board_id !== current.board_id) patch.board_id = current.board_id;
  if (initial.year !== current.year) patch.year = current.year;
  if (initial.exam_type_id !== current.exam_type_id && current.exam_type_id !== null) {
    patch.exam_type_id = current.exam_type_id;
  }
  if (initial.is_annulled !== current.is_annulled) patch.is_annulled = current.is_annulled;
  if (initial.is_outdated !== current.is_outdated) patch.is_outdated = current.is_outdated;
  if (!sameTags(initial.tags, current.tags)) patch.tags = current.tags;
  return patch;
}

export function isDirty(initial: ClassificationForm, current: ClassificationForm): boolean {
  return Object.keys(diffClassification(initial, current)).length > 0;
}

/**
 * Disciplina e assunto obrigatórios (espelha App\Support\QuestionClassificationRequirement).
 * O assunto só é exigido quando a disciplina tem assuntos cadastrados na taxonomia.
 */
export function validateClassification(
  form: Pick<ClassificationForm, "subject_id" | "topic_ids">,
  taxonomy: { id: number; topics: unknown[] }[]
): Record<string, string> {
  if (!form.subject_id) return { subject_id: "Selecione a disciplina da questão." };
  const hasTopics = taxonomy.some((s) => s.id === form.subject_id && s.topics.length > 0);
  if (hasTopics && form.topic_ids.length === 0) return { topic_ids: "Selecione pelo menos um assunto da disciplina." };
  return {};
}

/** Normaliza o texto digitado de uma tag e evita duplicadas (sem diferenciar maiúsculas). */
export function addTag(tags: string[], raw: string): string[] {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 50);
  if (!name || tags.some((t) => t.toLocaleLowerCase() === name.toLocaleLowerCase())) return tags;
  return [...tags, name];
}

/** Preenche só os campos de classificação vazios com a sugestão da IA (tags são somadas). */
export function mergeClassificationSuggestion(
  form: ClassificationForm,
  s: Partial<Pick<ClassificationForm, "difficulty_id" | "subject_id" | "topic_ids" | "board_id" | "year" | "exam_type_id" | "tags">>
): { form: ClassificationForm; changed: boolean } {
  const next = { ...form };
  if (next.subject_id === null && s.subject_id) {
    next.subject_id = s.subject_id;
    if (next.topic_ids.length === 0 && s.topic_ids?.length) next.topic_ids = [...s.topic_ids];
  } else if (next.subject_id !== null && next.subject_id === s.subject_id && next.topic_ids.length === 0 && s.topic_ids?.length) {
    next.topic_ids = [...s.topic_ids];
  }
  if (next.difficulty_id === null && s.difficulty_id) next.difficulty_id = s.difficulty_id;
  if (next.board_id === null && s.board_id) next.board_id = s.board_id;
  if (next.year === null && s.year) next.year = s.year;
  if (next.exam_type_id === null && s.exam_type_id) next.exam_type_id = s.exam_type_id;
  next.tags = (s.tags ?? []).reduce(addTag, next.tags);
  return { form: next, changed: isDirty(form, next) };
}

/**
 * Aplica a sugestão da IA sobrescrevendo o que ela trouxe (pedido explícito de "autocompletar" sobre
 * uma questão já pré-classificada, ex.: importação de PDF). Disciplina e assuntos andam juntos; tags somam.
 */
export function applyClassificationSuggestion(
  form: ClassificationForm,
  s: Partial<Pick<ClassificationForm, "difficulty_id" | "subject_id" | "topic_ids" | "board_id" | "year" | "exam_type_id" | "tags">>
): ClassificationForm {
  const next = { ...form };
  if (s.subject_id) {
    next.subject_id = s.subject_id;
    next.topic_ids = [...(s.topic_ids ?? [])];
  }
  if (s.difficulty_id) next.difficulty_id = s.difficulty_id;
  if (s.board_id) next.board_id = s.board_id;
  if (s.year) next.year = s.year;
  if (s.exam_type_id && next.exam_type_id === null) next.exam_type_id = s.exam_type_id;
  next.tags = (s.tags ?? []).reduce(addTag, next.tags);
  return next;
}

/** Mesma regra da API (App\Support\QuestionYear): só o começo do enunciado traz banca e ano. */
const YEAR_HEADER_CHARS = 160;
const YEAR_CITATION_WORDS = /adaptad|dispon[ií]vel|acesso|fonte|lei\b|decreto|art\.|p\.\s*\d/iu;

function validYear(year: number): number | null {
  return year >= 1900 && year <= new Date().getFullYear() + 1 ? year : null;
}

/**
 * Ano da prova citado na questão: cabeçalho do enunciado ("(ENEM 2019)", "UFRGS/2018 –") ou, sem ele,
 * o nome da prova de origem ("ENEM 2023 - 1º dia"). Anos soltos no texto ("Em 1945, ...") não contam.
 */
export function detectQuestionYear(statementHtml: string, sourceExamName = ""): number | null {
  const head = plainRichText(statementHtml).trim().slice(0, YEAR_HEADER_CHARS);
  const bracketed = /[([]\s*(\p{L}[^()[\]\n]{0,40}?)\b((?:19|20)\d{2})\b[^()[\]\n]{0,25}[)\]]/gu;
  for (const match of head.matchAll(bracketed)) {
    if (!YEAR_CITATION_WORDS.test(match[0])) return validYear(Number(match[2]));
  }
  const acronym = head.match(/^\s*(?:\d{1,3}\s*[.)\-–]\s*)?(?:QUEST[ÃA]O\s*\d+\s*[.)\-–:]?\s*)?\p{Lu}[\p{Lu}\d\-/ ]{1,30}?[\s/\-–]+((?:19|20)\d{2})\b/u);
  if (acronym) return validYear(Number(acronym[1]));
  const fromName = sourceExamName.match(/\b((?:19|20)\d{2})\b/);
  return fromName ? validYear(Number(fromName[1])) : null;
}

/** Classificação completa a partir de uma sugestão da IA (questões semelhantes). */
export function classificationFromSuggestion(
  s: Partial<Pick<ClassificationForm, "difficulty_id" | "subject_id" | "topic_ids" | "board_id" | "year" | "exam_type_id" | "tags">>
): ClassificationForm {
  return mergeClassificationSuggestion(EMPTY_CLASSIFICATION_FORM, s).form;
}
