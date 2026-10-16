import api from "./api";
import { getApiResponseBody } from "../utils/apiErrors";

export type MissedQuestionScope = "collective" | "student";

export type MissedQuestionRow = {
  id: number;
  type: "multiple_choice" | "essay";
  options_count: number;
  difficulty_id: number | null;
  difficulty: string | null;
  subject: string | null;
  topics: string[];
  snippet: string;
  image_url: string | null;
  wrong_count: number;
  answer_count: number;
  error_rate: number | null;
  students_wrong: number;
  generation_note: string;
};

export type MissedQuestionBrief = {
  scope: MissedQuestionScope;
  student: { id: number; name: string; enrollment_number: string | null } | null;
  min_answers: number | null;
  questions: MissedQuestionRow[];
  summary: string;
};

export async function fetchMissedQuestionBrief(params: {
  scope: MissedQuestionScope;
  student_id?: number;
}): Promise<MissedQuestionBrief> {
  const { data } = await api.get("/question-bank/missed-brief", { params });
  const body = getApiResponseBody<MissedQuestionBrief>(data);
  if (!body) throw new Error("Resposta vazia ao montar o resumo dos erros.");
  return body;
}
