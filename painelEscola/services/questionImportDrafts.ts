import api from "./api";
import type { ContentForm } from "../utils/questionContent";
import type { ClassificationForm } from "../utils/questionClassification";

export type ImportDraftQuestion = {
  key: string;
  include: boolean;
  sourceNumber: string;
  content: ContentForm;
  classification: ClassificationForm;
  needsImage: boolean;
  answerFromPdf: boolean;
  /** Conferida pela pessoa na revisão ("Confirmar questão"). */
  reviewed?: boolean;
  /** Página do PDF onde a questão começa. */
  sourcePage?: number | null;
};

/** Configurações da importação guardadas com o rascunho. */
export type ImportDraftSettings = {
  create_exam?: boolean;
  exam_type_slug?: string | null;
  exam_title?: string | null;
  /** Rascunhos antigos: simulado oficial criado numa conclusão parcial (as próximas inclusões entram nele). */
  exam_id?: number | null;
  /** Simulado do banco criado numa conclusão parcial: as próximas inclusões entram nele. */
  question_set_id?: number | null;
  subject_ids?: number[];
  /** Assuntos escolhidos no formulário (aplicados às questões da disciplina de cada um). */
  topic_ids?: number[];
  pdf_file_name?: string | null;
};

export type ImportDraftPayload = {
  source_exam_name: string;
  questions: ImportDraftQuestion[];
  no_text_pages: number[];
  active_question_key: string | null;
  settings?: ImportDraftSettings | null;
};

export type ImportDraft = ImportDraftPayload & { id: string; revision: number; updated_at: string };
export type ImportDraftSummary = Pick<ImportDraft, "id" | "source_exam_name" | "updated_at"> & { question_count: number };
type Envelope<T> = { type: string; message: string; body: T };

export async function listImportDrafts(page = 1) {
  const { data } = await api.get<Envelope<{ items: ImportDraftSummary[]; current_page: number; last_page: number }>>(
    "/question-bank/import-drafts", { params: { page } }
  );
  return data;
}

export async function fetchImportDraft(id: string) {
  const { data } = await api.get<Envelope<ImportDraft>>(`/question-bank/import-drafts/${id}`);
  return data;
}

export async function saveImportDraft(payload: ImportDraftPayload, existing?: { id: string; revision: number } | null) {
  const { data } = existing
    ? await api.put<Envelope<ImportDraft>>(`/question-bank/import-drafts/${existing.id}`, { ...payload, revision: existing.revision })
    : await api.post<Envelope<ImportDraft>>("/question-bank/import-drafts", payload);
  return data;
}

export async function includeImportDraftQuestion(id: string, key: string, revision: number, payload: Record<string, unknown>) {
  const { data } = await api.post<Envelope<{ draft: ImportDraft; question: { id: number } }>>(
    `/question-bank/import-drafts/${id}/questions/${encodeURIComponent(key)}/include`, { ...payload, revision }
  );
  return data;
}

/** Exclui o rascunho (só o autor). Questões já incluídas no banco permanecem. */
export async function deleteImportDraft(id: string) {
  const { data } = await api.delete<Envelope<null>>(`/question-bank/import-drafts/${id}`);
  return data;
}
