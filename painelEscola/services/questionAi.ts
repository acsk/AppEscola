import api from "./api";
import type { AiQuestionSuggestion, AiStatus, AiImageReview } from "../types/questionAi";

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
  /** Importação de PDF: a IA só classifica dentro destas disciplinas. */
  subject_ids?: number[];
}) {
  const { data } = await api.post("/question-bank/ai/autofill", payload, { timeout: 120000 });
  return data as { type: string; message: string; body: AiQuestionSuggestion };
}

export async function aiSimilarQuestions(
  questionId: number,
  params: { quantity: number; difficulty_id?: number | null; options_count?: number | null; instructions?: string },
  withImage = false
) {
  const { data } = await api.post(`/question-bank/questions/${questionId}/ai/similar`, params, { timeout: withImage ? 900000 : 180000 });
  return data as { type: string; message: string; body: { questions: AiQuestionSuggestion[] } };
}

export async function aiRegenerateImage(
  generationId: string,
  content: Pick<AiQuestionSuggestion, "type" | "question_text" | "explanation" | "options">,
  instructions?: string
) {
  const { data } = await api.post(
    `/question-bank/ai/image-generations/${generationId}/regenerate`,
    { content, instructions },
    { timeout: 900000 }
  );
  return data as { type: string; message: string; body: AiImageReview };
}

/** Importação de PDF: estrutura até 5 blocos de texto (um por questão). Não salva nada. */
export async function aiExtractQuestions(blocks: { text: string; answer_hint?: string | null }[]) {
  const { data } = await api.post("/question-bank/ai/extract", { blocks }, { timeout: 180000 });
  return data as { type: string; message: string; body: { questions: AiQuestionSuggestion[] } };
}

export async function aiExtractPdf(file: File) {
  const payload = new FormData();
  payload.append("pdf", file);
  const { data } = await api.post("/question-bank/ai/extract-pdf", payload, { timeout: 360000 });
  return data as { type: string; message: string; body: { questions: AiQuestionSuggestion[] } };
}

/** Recebe o texto integral do PDF; a IA separa as questões, sem gerar imagens. */
/** subjectIds: disciplinas da prova — a IA só classifica dentro delas (e busca o assunto). */
/** `focusPages`: separa só as questões que começam nessas páginas (o resto do texto é contexto). */
export async function aiSeparatePdfText(
  text: string,
  sourceExamName: string,
  subjectIds: number[] = [],
  focusPages?: { from: number; to: number }
) {
  const { data } = await api.post("/question-bank/ai/separate-text", {
    text, source_exam_name: sourceExamName, ...(subjectIds.length ? { subject_ids: subjectIds } : {}),
    ...(focusPages ? { focus_pages: focusPages } : {}),
  }, { timeout: 180000 });
  return data as { type: string; message: string; body: { questions: AiQuestionSuggestion[] } };
}
