export type PerformanceSubject = {
  id: number | null;
  name: string;
  icon: string | null;
  color: string;
};

export type PerformanceBySubject = {
  subject_id: number | null;
  subject: PerformanceSubject;
  attempts_count: number;
  avg_percentage: number | null;
  latest_percentage: number | null;
  latest_finished_at: string | null;
  passing_score_avg: number | null;
  month_change: number | null;
};

export type PerformanceMonthSubject = {
  subject_id: number | null;
  subject_name: string;
  attempts_count: number;
  avg_percentage: number;
};

export type PerformanceMonthlyEvolution = {
  month: string;
  label: string;
  attempts_count: number;
  avg_percentage: number | null;
  by_subject: PerformanceMonthSubject[];
};

export type PerformanceOverview = {
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
};

export type PerformanceStudentEnrollment = {
  id: number;
  enrollment_number?: string | null;
  status: string;
  enrollment_type?: 'plan' | 'bundle';
  school_class: { id: number; name: string } | null;
  school_classes?: Array<{
    id: number;
    name: string;
    course: { id: number; name: string } | null;
  }>;
  courses?: Array<{ id: number; name: string }>;
  course: { id: number; name: string } | null;
  course_plan: { id: number; name: string } | null;
  bundle?: { id: number; name: string; cycle_label: string } | null;
};

export type PerformanceStudent = {
  id: number;
  tenant_id: number;
  enrollment_number: string | null;
  name: string;
  birth_date: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  is_minor: boolean;
  status: string;
  desired_courses: Array<{ id: number; name: string }>;
  active_enrollments: PerformanceStudentEnrollment[];
};

export type StudentPerformance = {
  student_id: number;
  student: PerformanceStudent;
  months: number;
  overview: PerformanceOverview;
  by_subject: PerformanceBySubject[];
  monthly_evolution: PerformanceMonthlyEvolution[];
};
