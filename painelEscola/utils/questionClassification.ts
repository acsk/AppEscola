import type { ClassificationPatch, QuestionBankQuestion } from "../types/questionBank";

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

/** Normaliza o texto digitado de uma tag e evita duplicadas (sem diferenciar maiúsculas). */
export function addTag(tags: string[], raw: string): string[] {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 50);
  if (!name || tags.some((t) => t.toLocaleLowerCase() === name.toLocaleLowerCase())) return tags;
  return [...tags, name];
}
