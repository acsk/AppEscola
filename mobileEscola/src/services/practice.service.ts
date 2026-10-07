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
  question_count: number;
  answered_count: number;
  correct_count: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export type AttemptQuestion = PracticeQuestion & { selected_option_id: number | null } & Partial<PracticeFeedback>;

export interface PracticeAttemptPayload {
  attempt: PracticeAttemptSummary;
  question_set: { id: number; title: string; description: string | null } | null;
  questions: AttemptQuestion[];
}

export interface PracticeSummary {
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

export type RankingPeriod = 'week' | 'month' | 'all';

export interface RankingRow extends PerformanceScore {
  position: number;
  name: string;
  photo_url: string | null;
  questions: number;
  is_me: boolean;
}

export interface PracticeRanking {
  period: RankingPeriod;
  since: string | null;
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

export async function answerInPracticeAttempt(attemptId: number, questionId: number, optionId: number): Promise<PracticeAttemptSummary> {
  const { data } = await api.post<Envelope<PracticeAttemptSummary>>(`/api/aluno/practice-attempts/${attemptId}/answer`, {
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
