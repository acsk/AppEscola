import api from "./api";
import type { AiQuestionSuggestion, AiStatus } from "../types/questionAi";

/** IA do banco de questões (só sugere; o salvamento usa os endpoints normais de questão avulsa). */

export async function fetchAiStatus(): Promise<AiStatus> {
  const { data } = await api.get("/question-bank/ai/status");
  return data.body;
}

/** Devolve o envelope completo (toast usa a mensagem da API). */
export async function aiAutofillQuestion(payload: {
  question_text: string;
  type?: string;
  options?: { option_text: string }[];
}) {
  const { data } = await api.post("/question-bank/ai/autofill", payload, { timeout: 120000 });
  return data as { type: string; message: string; body: AiQuestionSuggestion };
}

export async function aiSimilarQuestions(
  questionId: number,
  params: { quantity: number; difficulty_id?: number | null; options_count?: number | null; instructions?: string }
) {
  const { data } = await api.post(`/question-bank/questions/${questionId}/ai/similar`, params, { timeout: 180000 });
  return data as { type: string; message: string; body: { questions: AiQuestionSuggestion[] } };
}
