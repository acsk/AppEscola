import { api } from './api';

export interface PerformanceSubject {
  id: number | null;
  name: string;
  icon: string | null;
  color: string;
}

export interface PerformanceBySubject {
  subject_id: number | null;
  subject: PerformanceSubject;
  attempts_count: number;
  avg_percentage: number | null;
  latest_percentage: number | null;
  latest_finished_at: string | null;
  passing_score_avg: number | null;
  month_change: number | null;
}

export interface PerformanceMonthSubject {
  subject_id: number | null;
  subject_name: string;
  attempts_count: number;
  avg_percentage: number;
}

export interface PerformanceMonthlyEvolution {
  month: string;
  label: string;
  attempts_count: number;
  avg_percentage: number | null;
  by_subject: PerformanceMonthSubject[];
}

export interface PerformanceOverview {
  total_attempts: number;
  subjects_count: number;
  avg_percentage: number | null;
  month_avg_percentage: number | null;
  month_change: number | null;
  best_subject: {
    subject_id: number | null;
    name: string;
    avg_percentage: number | null;
  } | null;
}

export interface PerformanceStudent {
  id: number;
  enrollment_number: string | null;
  name: string;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  status: string;
  is_minor: boolean;
  desired_courses: Array<{ id: number; name: string }>;
  active_enrollments: Array<{
    id: number;
    status: string;
    school_class: { id: number; name: string } | null;
    course: { id: number; name: string } | null;
    course_plan: { id: number; name: string } | null;
  }>;
}

export interface StudentPerformance {
  student_id: number;
  student: PerformanceStudent;
  months: number;
  overview: PerformanceOverview;
  by_subject: PerformanceBySubject[];
  monthly_evolution: PerformanceMonthlyEvolution[];
}

type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
  data?: T;
};

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  const casted = payload as ApiEnvelope<T>;
  return casted.body ?? casted.data ?? (payload as T);
}

export async function fetchStudentPerformance(months = 6): Promise<StudentPerformance> {
  const { data } = await api.get<ApiEnvelope<StudentPerformance>>('/api/aluno/performance', {
    params: { months },
  });
  return unwrap(data);
}
