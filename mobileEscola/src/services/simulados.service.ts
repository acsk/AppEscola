import { api } from './api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type AttemptStatus = 'not_started' | 'in_progress' | 'pending_review' | 'awaiting_release' | 'completed';

export interface SimuladoSubject {
  id: number;
  name: string;
  icon: string;
  color: string;
}

// Mapeamento de ícones da API → Ionicons (usado em todas as telas)
const SUBJECT_ICON_MAP: Record<string, string> = {
  'book-open':   'book-outline',
  'book':        'book-outline',
  'calculator':  'calculator-outline',
  'flask':       'flask-outline',
  'beaker':      'flask-outline',
  'globe':       'globe-outline',
  'atom':        'nuclear-outline',
  'pencil':      'pencil-outline',
  'chart-bar':   'bar-chart-outline',
  'music':       'musical-notes-outline',
  'paint-brush': 'color-palette-outline',
  'dumbbell':    'barbell-outline',
  'computer':    'desktop-outline',
  'code':        'code-slash-outline',
};

export function subjectIconName(icon: string): string {
  return SUBJECT_ICON_MAP[icon] ?? 'school-outline';
}

export interface SimuladoListItem {
  id: number;
  title: string;
  description: string | null;
  exam_type: string;
  exam_type_label: string;
  status: string;
  duration_minutes: number;
  passing_score: number;
  starts_at: string | null;
  ends_at: string | null;
  total_questions: number;
  total_points: number;
  attempt_status: AttemptStatus;
  can_start: boolean;
  release_results_after_end?: boolean;
  allow_retake?: boolean;
  max_attempts?: number | null;
  min_score_to_retake?: number | null;
  subject: SimuladoSubject | null;
}

export interface QuestionOption {
  id: number;
  option_text: string;
  order: number;
  triggers_text_input: boolean;
}

export interface Question {
  id: number;
  type: 'multiple_choice' | 'essay';
  question_text: string;
  image_url: string | null;
  video_url?: string | null;
  points: number;
  order: number;
  allow_text_answer: boolean;
  student_answer?: {
    option_id: number | null;
    text_answer: string | null;
    is_correct?: boolean | null;
  } | null;
  options: QuestionOption[];
  subject: { id: number; name: string } | null;
}

export interface SimuladoDetail {
  id: number;
  title: string;
  description: string | null;
  exam_type: string;
  exam_type_label: string;
  status: string;
  status_label: string;
  duration_minutes: number;
  passing_score: number;
  starts_at: string | null;
  ends_at: string | null;
  total_questions: number;
  total_points: number;
  attempt_status: AttemptStatus;
  attempt_id: number | null;
  can_start: boolean;
  release_results_after_end?: boolean;
  allow_retake?: boolean;
  max_attempts?: number | null;
  min_score_to_retake?: number | null;
  questions: Question[];
  subject: SimuladoSubject | null;
  course: { id: number; name: string } | null;
}

export interface AttemptStart {
  id: number;
  exam_id: number;
  student_id: number;
  status: string;
  started_at: string;
  exam: { id: number; title: string };
}

export interface AttemptFinish {
  id: number;
  status: 'completed' | 'pending_review' | 'awaiting_release';
  score: number | null;
  max_score: number;
  percentage: number | null;
  passed: boolean | null;
  pending_answers_count?: number;
  result_release_pending?: boolean;
  finished_at: string;
  answers?: { question_id: number; option_id: number | null; text_answer: string | null; is_correct: boolean | null; points_earned: number | null }[];
}

interface ApiEnvelope<T> {
  type?: 'success' | 'error';
  message?: string;
  body?: T;
}

function unwrapBody<T>(payload: T | ApiEnvelope<T>): T {
  const maybeEnvelope = payload as ApiEnvelope<T>;
  console.log('🔍 unwrapBody - payload keys:', Object.keys(payload as any));
  if (maybeEnvelope && typeof maybeEnvelope === 'object' && 'body' in maybeEnvelope) {
    console.log('✅ Found envelope body');
    return (maybeEnvelope.body ?? ({} as T)) as T;
  }
  console.log('⚠️ No envelope, returning payload as-is');
  return payload as T;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function listarSimulados(): Promise<SimuladoListItem[]> {
  const { data } = await api.get<SimuladoListItem[] | ApiEnvelope<SimuladoListItem[]>>('/api/aluno/exams');
  const parsed = unwrapBody<SimuladoListItem[]>(data);
  return Array.isArray(parsed) ? parsed : [];
}

export async function detalharSimulado(id: number): Promise<SimuladoDetail> {
  const { data } = await api.get<SimuladoDetail | ApiEnvelope<SimuladoDetail>>(`/api/aluno/exams/${id}`);
  return unwrapBody<SimuladoDetail>(data);
}

export async function iniciarSimulado(
  examId: number,
  studentId?: number,
): Promise<AttemptStart> {
  const body = studentId !== undefined ? { student_id: studentId } : {};
  const { data } = await api.post<AttemptStart | ApiEnvelope<AttemptStart>>(
    `/api/exams/${examId}/start`,
    body,
  );
  return unwrapBody<AttemptStart>(data);
}

export async function enviarResposta(
  attemptId: number,
  questionId: number,
  optionId?: number,
  textAnswer?: string,
): Promise<void> {
  const body: Record<string, unknown> = { question_id: questionId };
  if (optionId !== undefined) body.option_id = optionId;
  if (textAnswer !== undefined && textAnswer.trim() !== '') body.text_answer = textAnswer;
  await api.post(`/api/exam-attempts/${attemptId}/answer`, body);
}

export async function finalizarSimulado(attemptId: number): Promise<AttemptFinish> {
  const { data } = await api.post<AttemptFinish | ApiEnvelope<AttemptFinish>>(
    `/api/exam-attempts/${attemptId}/finish`,
  );
  return unwrapBody<AttemptFinish>(data);
}

export async function buscarTentativa(attemptId: number): Promise<AttemptFinish> {
  const { data } = await api.get<AttemptFinish | ApiEnvelope<AttemptFinish>>(
    `/api/exam-attempts/${attemptId}`,
  );
  return unwrapBody<AttemptFinish>(data);
}

export interface AttemptHistoryItem {
  id: number;
  exam_id: number;
  exam: {
    id: number;
    title: string;
    duration_minutes?: number;
    passing_score?: number;
    exam_type?: string;
    exam_type_label?: string;
    subject?: SimuladoSubject | null;
  };
  started_at: string;
  finished_at: string | null;
  status: 'in_progress' | 'pending_review' | 'awaiting_release' | 'completed' | 'abandoned';
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  result_release_pending?: boolean;
}

export interface ReviewOption {
  id: number;
  option_text: string;
  order?: number;
  selected: boolean;
  is_correct: boolean | null;
  triggers_text_input?: boolean;
}

export interface ReviewQuestion {
  id: number;
  type: 'multiple_choice' | 'essay';
  question_text: string;
  image_url?: string | null;
  points?: number;
  order?: number;
  allow_text_answer?: boolean;
  subject?: { id: number; name: string };
  student_answer: { option_id: number | null; text_answer: string | null } | null;
  correction: {
    is_correct: boolean | null;
    points_earned: number;
    max_points: number;
    correct_option_id: number | null;
  } | null;
  options: ReviewOption[];
}

export interface AttemptReview {
  id: number;
  status: AttemptStatus | 'abandoned';
  score: number | null;
  max_score: number;
  score_display?: string;
  percentage: number | null;
  passed: boolean | null;
  started_at?: string;
  finished_at?: string;
  pending_answers_count?: number | null;
  result_release_pending?: boolean;
  exam: {
    id: number;
    title: string;
    duration_minutes?: number;
    passing_score?: number;
    exam_type?: string;
    exam_type_label?: string;
    status?: string;
    subject?: SimuladoSubject | null;
  };
  questions: ReviewQuestion[] | null;
}

export async function buscarRevisao(attemptId: number): Promise<AttemptReview> {
  const { data } = await api.get<AttemptReview | ApiEnvelope<AttemptReview>>(
    `/api/aluno/attempts/${attemptId}/review`,
  );
  return unwrapBody<AttemptReview>(data);
}

export async function buscarTentativaDetalhada(attemptId: number): Promise<AttemptReview> {
  const { data } = await api.get<AttemptReview | ApiEnvelope<AttemptReview>>(
    `/api/aluno/attempts/${attemptId}`,
  );
  return unwrapBody<AttemptReview>(data);
}

export async function listarTentativas(status?: string): Promise<AttemptHistoryItem[]> {
  const params = status ? { status } : {};
  const { data } = await api.get<any>('/api/aluno/attempts', { params });
  // Suporta tanto { body: { data: [...] } } quanto { body: [...] } quanto [...] direto
  const body = data?.body ?? data;
  return Array.isArray(body) ? body : (body?.data ?? []);
}

// ── Materiais de Apoio ────────────────────────────────────────────────────────

export type SupportMaterialType = 'link' | 'file';
export type SupportMaterialFileType = 'pdf' | 'image' | 'video' | 'document' | null;

export interface SupportMaterial {
  id: number;
  exam_id: number;
  title: string;
  description: string | null;
  type: SupportMaterialType;
  content: string;
  file_type: SupportMaterialFileType;
  file_size: number | null;
  created_at: string;
}

export async function listarMateriaisApoio(examId: number): Promise<SupportMaterial[]> {
  const { data } = await api.get<any>(`/api/exams/${examId}/support-materials`);
  // Suporta { body: [...] }, { body: { data: [...] } } ou [...] direto
  const body = data?.body ?? data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

