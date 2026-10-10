/** Banco de questões (avulsas e de simulados) — contratos de /question-bank. */

export type IdName = { id: number; name: string };

export type QuestionBankTab =
  | "todas"
  | "regulares"
  | "anuladas"
  | "desatualizadas"
  | "sem_classificacao";

export type QuestionBankSort = "id" | "board" | "difficulty" | "errors";

export type SortDirection = "asc" | "desc";

export type QuestionBankTabCounts = Record<QuestionBankTab, number>;

export type QuestionBankOption = {
  id: number;
  option_text: string;
  is_correct: boolean;
  order: number;
};

export type QuestionBankQuestion = {
  id: number;
  origin: "avulsa" | "simulado";
  source_exam_name?: string | null;
  exam: { id: number; title: string } | null;
  type: "multiple_choice" | "essay";
  question_text: string | null;
  image_url: string | null;
  has_explanation: boolean;
  explanation?: string | null;
  options?: QuestionBankOption[];
  subject_id: number | null;
  subject: IdName | null;
  topic_ids: number[];
  topics: IdName[];
  board_id: number | null;
  board: IdName | null;
  year: number | null;
  difficulty_id: number | null;
  difficulty: (IdName & { sort_order: number }) | null;
  exam_type_id: number | null;
  exam_type: { id: number; label: string } | null;
  issue_reports_count?: number;
  /** Respostas erradas na prática e em simulados oficiais. */
  wrong_count?: number;
  answer_count?: number;
  /** Percentual de erros; null quando ninguém respondeu. */
  error_rate?: number | null;
  is_annulled: boolean;
  is_outdated: boolean;
  tags: string[];
  updated_at: string | null;
};

/** Campos aceitos no PATCH de classificação (ausente = não altera; null = remove). */
export type ClassificationPatch = Partial<{
  difficulty_id: number | null;
  subject_id: number | null;
  topic_ids: number[];
  board_id: number | null;
  year: number | null;
  exam_type_id: number;
  is_annulled: boolean;
  is_outdated: boolean;
  tags: string[];
  add_tags: string[];
  remove_tags: string[];
}>;

export type BatchItem = ClassificationPatch & { id: number };

export type BatchResult = {
  id: number;
  ok: boolean;
  message?: string;
  previous?: ClassificationPatch;
};

export type CatalogItem = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number | null;
  questions_count: number;
};

export type CatalogKey = "difficulties" | "boards" | "tags";

export type CatalogDefinition = { key: CatalogKey; label: string; editable: boolean };

export type SubjectTopic = {
  id: number;
  subject_id: number;
  name: string;
  description: string | null;
  questions_count: number;
};

export type SubjectSummary = { id: number; name: string };

/** Disciplina ativa com seus assuntos (GET /question-bank/taxonomy). */
export type TaxonomySubject = SubjectSummary & { topics: { id: number; name: string }[] };

/** Assunto como opção de seleção (com a disciplina dona, para associar automaticamente). */
export type TopicOption = { id: number; name: string; subject_id: number; subject_name?: string };

export type TaxonomyImportReport = {
  subjects_created: number;
  subjects_existing: number;
  topics_created: number;
  topics_existing: number;
  boards_created: number;
  boards_existing: number;
};

export type ExamTypeSummary = { id: number; slug?: string; label: string; logo_url?: string | null };
