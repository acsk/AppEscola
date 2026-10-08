import { api } from './api';

/** Banco de questões do aluno: prática avulsa, simulados do banco, desempenho por assunto e ranking. */

type Envelope<T> = { type?: string; message?: string; body: T };

export interface PracticeOption {
  id: number;
  option_text: string;
}

export interface PracticeQuestion {
  id: number;
  question_text: string | null;
  image_url: string | null;
  source_exam_name: string | null;
  /** Simulado da escola de onde a questão veio (já encerrado). */
  exam_title?: string | null;
  subject: { id: number; name: string } | null;
  topics: string[];
  difficulty: string | null;
  exam_type: string | null;
  options: PracticeOption[];
}

/** Correção: só vem depois da resposta (avulsa) ou ao finalizar o simulado. */
export interface PracticeFeedback {
  is_correct: boolean | null;
  correct_option_id: number | null;
  explanation: string | null;
}

export interface PracticeFilters {
  total: number;
  subjects: Array<{
    id: number;
    name: string;
    total: number;
    topics: Array<{ id: number; name: string; total: number }>;
  }>;
}

export interface PracticeQuestionFilters {
  subject_id?: number | null;
  topic_id?: number | null;
  exclude_id?: number | null;
}

export interface QuestionSetSummary {
  id: number;
  title: string;
  description: string | null;
  origin: 'admin' | 'pdf_import';
  exam_type: { label: string; logo_url: string | null } | null;
  questions_count: number;
  attempts_count: number;
  open_attempt_id: number | null;
  last_result: { correct: number; total: number; finished_at: string | null } | null;
}

export interface PracticeAttemptSummary {
  id: number;
  question_set_id: number | null;
  /** 'set' = simulado do banco; 'session' = sessão montada pelo aluno. */
  kind?: 'set' | 'session';
  title?: string | null;
  /** 'each' = correção a cada questão; 'end' = no final. */
  correction_mode?: 'each' | 'end';
  /** Cronômetro opcional (segundos por questão). */
  seconds_per_question?: number | null;
  question_count: number;
  answered_count: number;
  correct_count: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export type AttemptQuestion = PracticeQuestion & {
  selected_option_id: number | null;
  saved?: boolean;
  is_new?: boolean;
  year?: number | null;
  /** % da escola que acerta (null com poucas respostas). */
  class_rate?: number | null;
  /** Seu acerto no primeiro assunto da questão. */
  topic_score?: { right: number; total: number } | null;
} & Partial<PracticeFeedback>;

export interface PracticeAttemptPayload {
  attempt: PracticeAttemptSummary;
  question_set: { id: number; title: string; description: string | null } | null;
  questions: AttemptQuestion[];
}

export interface PracticeSummary {
  /** Sessão em andamento (atalho "Continuar sessão"). */
  open_session?: PracticeAttemptSummary | null;
  answered: number;
  correct: number;
  accuracy: number | null;
  recent_sets: Array<{ attempt_id: number; title: string; correct: number; total: number; finished_at: string | null }>;
}

export type PerformanceLevel = 'not_started' | 'few_data' | 'weak' | 'attention' | 'good';

export interface PerformanceScore {
  answered: number;
  correct: number;
  accuracy: number | null;
  level: PerformanceLevel;
}

export type PerformanceTopic = PerformanceScore & { id: number | null; name: string; available: number };
export type PerformanceSubject = PerformanceScore & { id: number | null; name: string; available: number; topics: PerformanceTopic[] };

export interface StudyFocusItem extends PerformanceScore {
  subject: { id: number | null; name: string };
  topic: { id: number; name: string };
  reason: 'low_accuracy' | 'not_started';
  available: number;
}

export interface PracticePerformance {
  min_sample: number;
  overall: PerformanceScore;
  study_focus: StudyFocusItem[];
  subjects: PerformanceSubject[];
}

/** week = semana corrente (desde segunda 00:00); last_week = semana anterior, já fechada. */
export type RankingPeriod = 'week' | 'last_week' | 'month' | 'all';

export interface RankingRow extends PerformanceScore {
  position: number;
  name: string;
  photo_url: string | null;
  questions: number;
  is_me: boolean;
  /** Positivo = subiu em relação a cerca de 24h atrás; negativo = caiu; null = sem comparação. */
  movement?: number | null;
}

export interface PracticeRanking {
  period: RankingPeriod;
  since: string | null;
  until?: string | null;
  participants: number;
  ranking: RankingRow[];
  me: RankingRow | null;
}

export async function fetchPracticeFilters(): Promise<PracticeFilters> {
  const { data } = await api.get<Envelope<PracticeFilters>>('/api/aluno/practice/filters');
  return data.body;
}

/** `null` quando não há questão com esses filtros. */
export async function fetchNextPracticeQuestion(filters: PracticeQuestionFilters): Promise<PracticeQuestion | null> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null));
  const { data } = await api.get<Envelope<PracticeQuestion | null>>('/api/aluno/practice/next-question', { params });
  return data.body ?? null;
}

export async function answerPracticeQuestion(questionId: number, optionId: number): Promise<PracticeFeedback> {
  const { data } = await api.post<Envelope<PracticeFeedback>>(`/api/aluno/practice/questions/${questionId}/answer`, {
    option_id: optionId,
  });
  return data.body;
}

export async function fetchPracticeSummary(): Promise<PracticeSummary> {
  const { data } = await api.get<Envelope<PracticeSummary>>('/api/aluno/practice/summary');
  return data.body;
}

export async function fetchPracticePerformance(): Promise<PracticePerformance> {
  const { data } = await api.get<Envelope<PracticePerformance>>('/api/aluno/practice/performance');
  return data.body;
}

export async function fetchPracticeRanking(period: RankingPeriod): Promise<PracticeRanking> {
  const { data } = await api.get<Envelope<PracticeRanking>>('/api/aluno/practice/ranking', { params: { period } });
  return data.body;
}

export async function fetchQuestionSets(): Promise<QuestionSetSummary[]> {
  const { data } = await api.get<Envelope<QuestionSetSummary[]>>('/api/aluno/question-sets');
  return data.body ?? [];
}

/** Inicia o simulado do banco ou retoma a tentativa aberta. */
export async function startQuestionSet(setId: number): Promise<PracticeAttemptPayload> {
  const { data } = await api.post<Envelope<PracticeAttemptPayload>>(`/api/aluno/question-sets/${setId}/start`);
  return data.body;
}

export async function fetchPracticeAttempt(attemptId: number): Promise<PracticeAttemptPayload> {
  const { data } = await api.get<Envelope<PracticeAttemptPayload>>(`/api/aluno/practice-attempts/${attemptId}`);
  return data.body;
}

export async function answerInPracticeAttempt(attemptId: number, questionId: number, optionId: number): Promise<PracticeAttemptSummary & { feedback?: PracticeFeedback }> {
  const { data } = await api.post<Envelope<PracticeAttemptSummary & { feedback?: PracticeFeedback }>>(`/api/aluno/practice-attempts/${attemptId}/answer`, {
    question_id: questionId,
    option_id: optionId,
  });
  return data.body;
}

export async function finishPracticeAttempt(attemptId: number): Promise<PracticeAttemptPayload> {
  const { data } = await api.post<Envelope<PracticeAttemptPayload>>(`/api/aluno/practice-attempts/${attemptId}/finish`);
  return data.body;
}

export const LEVEL_LABEL: Record<PerformanceLevel, string> = {
  not_started: 'Não praticado',
  few_data: 'Poucos dados',
  weak: 'Reforçar',
  attention: 'Atenção',
  good: 'Bom',
};

export const LEVEL_COLOR: Record<PerformanceLevel, string> = {
  not_started: '#94A3B8',
  few_data: '#64748B',
  weak: '#EF4444',
  attention: '#F59E0B',
  good: '#22C55E',
};


// ── Catálogo do banco (lista, filtros com contagem, salvas, sessões) ─────────

/** 'new' = ainda não respondida e entrou no banco nos últimos 14 dias. */
export type PracticeSituation = 'all' | 'unanswered' | 'wrong' | 'saved' | 'new';

export interface CatalogFilters {
  search?: string;
  subject_ids?: number[];
  topic_ids?: number[];
  situation?: PracticeSituation;
  difficulty_id?: number | null;
  years?: number[];
  year_before?: number | null;
}

export interface CatalogQuestion {
  id: number;
  text: string;
  has_image: boolean;
  subject: { id: number; name: string } | null;
  topic: string | null;
  difficulty: string | null;
  source: string | null;
  year: number | null;
  exam_title?: string | null;
  /** % da turma que acerta (null com poucas respostas). */
  rate: number | null;
  status: 'new' | 'right' | 'wrong';
  saved: boolean;
}

export interface CatalogFacets {
  total: number;
  subjects: Array<{ id: number; name: string; color: string | null; total: number; new: number }>;
  topics: Array<{ id: number; name: string; subject_id: number; total: number; new: number }>;
  situations: Record<PracticeSituation, number>;
  difficulties: Array<{ id: number; name: string; total: number }>;
  years: Array<{ year: number; total: number }>;
}

export interface CatalogPage {
  total: number;
  page: number;
  last_page: number;
  items: CatalogQuestion[];
  facets?: CatalogFacets;
}

/** Parâmetros sem vazios (axios serializa arrays como subject_ids[]=…). */
export function catalogParams(filters: CatalogFilters): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && v !== 'all'));
}

export async function fetchPracticeQuestions(filters: CatalogFilters, page = 1, sort: 'recent' | 'oldest' = 'recent', withFacets = false): Promise<CatalogPage> {
  const { data } = await api.get<Envelope<CatalogPage>>('/api/aluno/practice/questions', {
    params: { ...catalogParams(filters), page, sort, ...(withFacets ? { facets: 1 } : {}) },
  });
  return data.body;
}

export async function fetchPracticeFacets(filters: CatalogFilters): Promise<CatalogFacets> {
  const { data } = await api.get<Envelope<CatalogFacets>>('/api/aluno/practice/facets', { params: catalogParams(filters) });
  return data.body;
}

export async function setQuestionSaved(questionId: number, saved: boolean): Promise<void> {
  if (saved) await api.post(`/api/aluno/practice/questions/${questionId}/save`);
  else await api.delete(`/api/aluno/practice/questions/${questionId}/save`);
}

export interface SessionOptions {
  quantity: 5 | 10 | 20 | 30 | null;
  correction_mode: 'each' | 'end';
  timed: boolean;
  title?: string;
}

export async function startPracticeSession(filters: CatalogFilters, options: SessionOptions): Promise<PracticeAttemptPayload> {
  const { data } = await api.post<Envelope<PracticeAttemptPayload>>('/api/aluno/practice/sessions', { ...catalogParams(filters), ...options });
  return data.body;
}
