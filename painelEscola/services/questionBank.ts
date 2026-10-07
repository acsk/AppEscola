import api from "./api";
import type {
  BatchItem,
  BatchResult,
  CatalogDefinition,
  CatalogItem,
  CatalogKey,
  ClassificationPatch,
  ExamTypeSummary,
  QuestionBankQuestion,
  QuestionBankTabCounts,
  SubjectSummary,
  SubjectTopic,
  TaxonomyImportReport,
  TaxonomySubject,
} from "../types/questionBank";
import { BATCH_CHUNK_SIZE, chunk } from "../utils/questionBankQuery";

/** Banco de questões — integração com /question-bank (apiEscola). */

export type QuestionBankPage = {
  data: QuestionBankQuestion[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    tab_counts: QuestionBankTabCounts;
  };
};

export async function fetchQuestionBankPage(params: Record<string, string | number>): Promise<QuestionBankPage> {
  const { data } = await api.get("/question-bank/questions", { params });
  return data;
}

export async function fetchQuestionBankIds(params: Record<string, string | number>) {
  const { data } = await api.get("/question-bank/questions/ids", { params });
  return data.body as { ids: number[]; truncated: boolean };
}

export async function fetchQuestionBankYears(): Promise<number[]> {
  const { data } = await api.get("/question-bank/questions/years");
  return data.body ?? [];
}

export async function fetchQuestionBankQuestion(id: number): Promise<QuestionBankQuestion> {
  const { data } = await api.get(`/question-bank/questions/${id}`);
  return data.body;
}

/** Devolve o envelope completo (para o toast usar a mensagem da API). */
export async function patchQuestionClassification(id: number, patch: ClassificationPatch) {
  const { data } = await api.patch(`/question-bank/questions/${id}/classification`, patch);
  return data as { type: string; message: string; body: QuestionBankQuestion };
}

// ── Questões avulsas (conteúdo) ─────────────────────────────────────────────

/** Cria questão avulsa (conteúdo + classificação opcional). Devolve o envelope (toast usa a mensagem da API). */
export async function createStandaloneQuestion(payload: Record<string, unknown>) {
  const { data } = await api.post("/question-bank/questions", payload);
  return data as { type: string; message: string; body: QuestionBankQuestion };
}

/** Cria um simulado (rascunho) com questões avulsas já incluídas — ex.: prova importada de PDF. */
export async function createExamFromQuestions(payload: {
  title: string;
  exam_type: string;
  question_ids: number[];
  description?: string;
}) {
  const { data } = await api.post("/question-bank/exams-from-questions", payload);
  return data as { type: string; message: string; body: { id: number; title: string } };
}

export type ImportedExam = {
  id: number;
  title: string;
  exam_type: string | null;
  exam_type_label: string | null;
  exam_type_logo_url: string | null;
  status: string | null;
  status_label: string | null;
  questions_count?: number;
  attempts_count?: number;
  created_at: string;
};

/** Simulados criados a partir de PDF no banco de questões; `status` = slug (draft, published…) ou vazio para todos. */
export async function fetchImportedExams(params: { status?: string; search?: string; page?: number; per_page?: number }) {
  const { data } = await api.get("/question-bank/imported-exams", { params });
  return data as { data: ImportedExam[]; meta: { current_page: number; last_page: number; total: number; per_page: number } };
}

/** Exclui o simulado importado; `keepQuestions` devolve as questões ao banco como avulsas. */
export async function deleteImportedExam(id: number, keepQuestions: boolean) {
  const { data } = await api.delete(`/question-bank/imported-exams/${id}`, { params: keepQuestions ? { keep_questions: 1 } : {} });
  return data as { type: string; message: string; body: null };
}

export async function updateStandaloneQuestion(id: number, payload: Record<string, unknown>) {
  const { data } = await api.put(`/question-bank/questions/${id}`, payload);
  return data as { type: string; message: string; body: QuestionBankQuestion };
}

export async function deleteStandaloneQuestion(id: number) {
  const { data } = await api.delete(`/question-bank/questions/${id}`);
  return data;
}

/** Upload da imagem do enunciado; devolve a URL pública. */
export async function uploadQuestionBankImage(file: File, questionId?: number) {
  const formData = new FormData();
  formData.append("image", file);
  if (questionId) formData.append("question_id", String(questionId));
  const { data } = await api.post("/question-bank/questions/upload-image", formData);
  return data as { type: string; message: string; body: { image_url: string } };
}

/**
 * Classificação em lote, em blocos sequenciais. Um bloco que falha inteiro (rede, 5xx)
 * vira falha de cada item dele; os demais blocos continuam.
 */
export async function patchClassificationBatch(
  items: BatchItem[],
  onProgress?: (done: number, total: number) => void
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (const part of chunk(items, BATCH_CHUNK_SIZE)) {
    try {
      const { data } = await api.patch("/question-bank/questions/classification", { items: part });
      results.push(...(data.body?.results ?? []));
    } catch (error: any) {
      const message = error?.response?.data?.message ?? "Falha de comunicação com o servidor.";
      results.push(...part.map((item) => ({ id: item.id, ok: false, message })));
    }
    onProgress?.(results.length, items.length);
  }
  return results;
}

// ── Cadastros e taxonomia ───────────────────────────────────────────────────

export async function fetchCatalogDefinitions(): Promise<CatalogDefinition[]> {
  const { data } = await api.get("/question-bank/catalogs");
  return data.body ?? [];
}

export async function fetchCatalog(catalog: CatalogKey, search?: string): Promise<CatalogItem[]> {
  const { data } = await api.get(`/question-bank/catalogs/${catalog}`, { params: search ? { search } : {} });
  return data.body ?? [];
}

export async function saveCatalogItem(
  catalog: CatalogKey,
  payload: { name: string; description?: string | null },
  id?: number
) {
  const { data } = id
    ? await api.put(`/question-bank/catalogs/${catalog}/${id}`, payload)
    : await api.post(`/question-bank/catalogs/${catalog}`, payload);
  return data;
}

export async function deleteCatalogItem(catalog: CatalogKey, id: number) {
  const { data } = await api.delete(`/question-bank/catalogs/${catalog}/${id}`);
  return data;
}

export async function fetchTopics(subjectIds?: number[]): Promise<SubjectTopic[]> {
  const params = subjectIds?.length ? { subject_id: subjectIds.join(",") } : {};
  const { data } = await api.get("/question-bank/topics", { params });
  return data.body ?? [];
}

export async function saveTopic(
  payload: { subject_id?: number; name?: string; description?: string | null },
  id?: number
) {
  const { data } = id
    ? await api.put(`/question-bank/topics/${id}`, payload)
    : await api.post("/question-bank/topics", payload);
  return data;
}

export async function deleteTopic(id: number) {
  const { data } = await api.delete(`/question-bank/topics/${id}`);
  return data;
}

/** Disciplinas ativas com a contagem de questões (árvore da taxonomia). */
export async function fetchSubjectsWithCounts(): Promise<(SubjectSummary & { questions_count: number })[]> {
  const { data } = await api.get("/question-bank/subjects");
  return data.body ?? [];
}

/** Disciplinas ativas com os assuntos aninhados (lista completa, sem paginação). */
export async function fetchTaxonomy(): Promise<TaxonomySubject[]> {
  const { data } = await api.get("/question-bank/taxonomy");
  return data.body ?? [];
}

/** Importa a taxonomia padrão (só cria o que falta). Devolve o envelope (toast usa a mensagem da API). */
export async function importDefaultTaxonomy() {
  const { data } = await api.post("/question-bank/taxonomy/import-default");
  return data as { type: string; message: string; body: TaxonomyImportReport };
}

export async function fetchActiveSubjects(): Promise<SubjectSummary[]> {
  const subjects = await fetchSubjectsWithCounts();
  return subjects.map(({ id, name }) => ({ id, name }));
}

export async function fetchActiveExamTypes(): Promise<ExamTypeSummary[]> {
  const { data } = await api.get("/exam-types");
  return (Array.isArray(data) ? data : data.body ?? []).map((t: ExamTypeSummary) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    logo_url: t.logo_url ?? null,
  }));
}
