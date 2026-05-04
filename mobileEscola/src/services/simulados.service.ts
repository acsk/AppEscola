import { api } from './api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type AttemptStatus = 'not_started' | 'in_progress' | 'completed';

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
  points: number;
  order: number;
  allow_text_answer: boolean;
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
  status: string;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  finished_at: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function listarSimulados(): Promise<SimuladoListItem[]> {
  const { data } = await api.get<{ body: SimuladoListItem[] }>('/api/aluno/exams');
  return data.body;
}

export async function detalharSimulado(id: number): Promise<SimuladoDetail> {
  const { data } = await api.get<{ body: SimuladoDetail }>(`/api/aluno/exams/${id}`);
  return data.body;
}

export async function iniciarSimulado(
  examId: number,
  studentId?: number,
): Promise<AttemptStart> {
  const body = studentId !== undefined ? { student_id: studentId } : {};
  const { data } = await api.post<{ body: AttemptStart }>(
    `/api/exams/${examId}/start`,
    body,
  );
  return data.body;
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
  const { data } = await api.post<{ body: AttemptFinish }>(
    `/api/exam-attempts/${attemptId}/finish`,
  );
  return data.body;
}
