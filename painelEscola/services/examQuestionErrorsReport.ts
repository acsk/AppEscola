import api from "./api";
import { getApiResponseBody } from "../utils/apiErrors";

export type ExamQuestionErrorRow = {
  question_id: number;
  order: number;
  type: string;
  question_text: string | null;
  question_text_preview: string;
  image_url?: string | null;
  subject: string | null;
  points: number | null;
  correct_count: number;
  wrong_count: number;
  total_answers: number;
  hit_rate: number | null;
  error_rate: number | null;
};

export type ExamQuestionErrorsReport = {
  exam: {
    id: number;
    title: string;
    exam_type?: string | null;
    exam_type_label?: string | null;
    status?: string | null;
    status_label?: string | null;
    courses: string[];
    subject: { id: number; name: string } | null;
  };
  summary: {
    attempt_scope: string;
    graded_students_count: number;
    total_questions: number;
    questions_with_answers: number;
    questions_with_errors: number;
    avg_error_rate: number | null;
    avg_hit_rate: number | null;
  };
  questions: ExamQuestionErrorRow[];
};

export async function fetchExamQuestionErrorsReport(
  examId: number
): Promise<ExamQuestionErrorsReport> {
  const { data } = await api.get(`/exams/${examId}/question-errors-report`);
  const body = getApiResponseBody<ExamQuestionErrorsReport>(data);
  if (!body) {
    throw new Error("Resposta inválida ao carregar relatório de erros por questão.");
  }
  return body;
}
