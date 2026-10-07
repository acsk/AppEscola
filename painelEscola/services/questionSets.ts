import api from "./api";
import type { QuestionBankQuestion } from "../types/questionBank";

/** Simulados do banco de questões (montados pelo admin ou pela importação de PDF) — /question-bank/question-sets. */

type Envelope<T> = { type: string; message: string; body: T };

export type QuestionSetStatus = "draft" | "published";
export type QuestionSetOrigin = "admin" | "pdf_import";

export const QUESTION_SET_ORIGIN_LABEL: Record<QuestionSetOrigin, string> = { pdf_import: "Importado de PDF", admin: "Montado pela escola" };

export type QuestionSet = {
  id: number;
  title: string;
  description: string | null;
  origin: QuestionSetOrigin;
  status: QuestionSetStatus;
  source_exam_name: string | null;
  exam_type: { id: number; slug: string; label: string; logo_url: string | null } | null;
  questions_count: number;
  attempts_count: number;
  practicable_count?: number;
  created_at: string;
  updated_at: string;
};

/** Questão do simulado; `practicable` = o aluno vê (objetiva, avulsa, com gabarito e alternativas). */
export type QuestionSetQuestion = QuestionBankQuestion & { practicable: boolean };

export type QuestionSetPage = {
  data: QuestionSet[];
  meta: { current_page: number; last_page: number; total: number; per_page: number };
};

export async function fetchQuestionSets(params: { status?: QuestionSetStatus; origin?: QuestionSetOrigin; search?: string; page?: number; per_page?: number }) {
  const { data } = await api.get<QuestionSetPage>("/question-bank/question-sets", { params });
  return data;
}

export async function fetchQuestionSet(id: number) {
  const { data } = await api.get<Envelope<{ question_set: QuestionSet; questions: QuestionSetQuestion[] }>>(`/question-bank/question-sets/${id}`);
  return data.body;
}

/** Cria em rascunho. Com `origin: "pdf_import"`, `exam_type` é obrigatório e vale para todas as questões. */
export async function createQuestionSet(payload: {
  title: string;
  description?: string | null;
  origin?: QuestionSetOrigin;
  exam_type?: string;
  source_exam_name?: string | null;
  question_ids?: number[];
}) {
  const { data } = await api.post<Envelope<QuestionSet>>("/question-bank/question-sets", payload);
  return data;
}

/** Sorteia questões avulsas prontas para o aluno pelos filtros (vazio = qualquer uma). */
export async function generateQuestionSet(payload: {
  title: string;
  description?: string | null;
  quantity: number;
  subject_ids?: number[];
  topic_ids?: number[];
  difficulty_ids?: number[];
  exam_type_ids?: number[];
}) {
  const { data } = await api.post<Envelope<QuestionSet>>("/question-bank/question-sets/generate", payload);
  return data;
}

export async function updateQuestionSet(id: number, payload: { title?: string; description?: string | null; status?: QuestionSetStatus }) {
  const { data } = await api.put<Envelope<QuestionSet>>(`/question-bank/question-sets/${id}`, payload);
  return data;
}

/** As questões continuam no banco. */
export async function deleteQuestionSet(id: number) {
  const { data } = await api.delete<Envelope<null>>(`/question-bank/question-sets/${id}`);
  return data;
}

/** Acrescenta ao fim (questões já presentes são ignoradas). */
export async function addQuestionsToSet(id: number, questionIds: number[]) {
  const { data } = await api.post<Envelope<QuestionSet>>(`/question-bank/question-sets/${id}/questions`, { question_ids: questionIds });
  return data;
}

export async function reorderQuestionSet(id: number, questionIds: number[]) {
  const { data } = await api.put<Envelope<QuestionSet>>(`/question-bank/question-sets/${id}/questions/order`, { question_ids: questionIds });
  return data;
}

export async function removeQuestionFromSet(id: number, questionId: number) {
  const { data } = await api.delete<Envelope<QuestionSet>>(`/question-bank/question-sets/${id}/questions/${questionId}`);
  return data;
}

// ── Ranking de participação ─────────────────────────────────────────────────

export type PracticeRankingPeriod = "week" | "month" | "all";

export type PracticeRankingRow = {
  position: number;
  student_id: number;
  name: string;
  enrollment_number: string | null;
  photo_url: string | null;
  /** Questões diferentes respondidas no período (critério do ranking). */
  questions: number;
  answered: number;
  correct: number;
  accuracy: number | null;
};

export async function fetchPracticeRanking(period: PracticeRankingPeriod, limit = 50) {
  const { data } = await api.get<Envelope<{ period: PracticeRankingPeriod; since: string | null; participants: number; ranking: PracticeRankingRow[] }>>(
    "/question-bank/practice-ranking", { params: { period, limit } }
  );
  return data.body;
}
