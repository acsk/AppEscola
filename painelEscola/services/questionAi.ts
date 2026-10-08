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
  /** Disciplina já escolhida na questão: a IA mantém e só escolhe os assuntos dela. */
  subject_id?: number;
  /** Nome da prova de origem: a API deduz o ano dele ("ENEM 2023") quando o enunciado não traz. */
  source_exam_name?: string;
}) {
  const { data } = await api.post("/question-bank/ai/autofill", payload, { timeout: 120000 });
  return data as { type: string; message: string; body: AiQuestionSuggestion };
}

export type AiClassifyField = "subject" | "topics" | "difficulty" | "board" | "year" | "tags";

/** Classificação atual e sugerida de uma questão (a sugestão traz só os campos pedidos). */
export type AiClassifyItem = {
  id: number;
  snippet: string;
  note: string | null;
  suggestion: Partial<{ subject_id: number; topic_ids: number[]; difficulty_id: number; board_id: number; year: number; tags: string[] }>;
  current: { subject_id: number | null; topic_ids: number[]; difficulty_id: number | null; board_id: number | null; year: number | null; tags: string[] };
};

/** Até 10 questões por chamada (o modal envia a seleção em blocos). Não salva nada. */
export async function aiClassifyQuestions(questionIds: number[], fields: AiClassifyField[], subjectId?: number | null) {
  const { data } = await api.post(
    "/question-bank/ai/classify",
    { question_ids: questionIds, fields, subject_id: subjectId ?? undefined },
    { timeout: 180000 }
  );
  return data.body.items as AiClassifyItem[];
}

/** Estado atual do formulário (inclui edições não salvas); substitui a questão gravada no prompt. */
export type SimilarFormContext = {
  type: "multiple_choice" | "essay";
  question_text: string;
  explanation: string;
  image_url: string | null;
  options: { option_text: string; is_correct: boolean }[];
  subject_id: number | null;
  topic_ids: number[];
  board_id: number | null;
  year: number | null;
  exam_type_id: number | null;
  tags: string[];
  source_exam_name: string | null;
};

export async function aiSimilarQuestions(
  questionId: number,
  params: {
    quantity: number;
    difficulty_id?: number | null;
    options_count?: number | null;
    instructions?: string;
    context?: SimilarFormContext;
  },
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

/**
 * Editor: nova versão da imagem do enunciado. A IA analisa a imagem atual com o enunciado e as alternativas
 * do formulário e redesenha a figura com os mesmos dados. Não altera a questão; o editor decide se usa.
 */
export async function aiRedrawQuestionImage(payload: {
  question_id?: number;
  image_url: string;
  type: "multiple_choice" | "essay";
  question_text: string;
  options: { option_text: string; is_correct: boolean }[];
  instructions?: string;
}) {
  const { data } = await api.post("/question-bank/ai/redraw-image", payload, { timeout: 900000 });
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
