export type AcademicHistoryCourse = {
  id: number;
  name: string;
};

export type AcademicHistorySchoolClass = {
  id: number;
  name: string;
  course?: AcademicHistoryCourse | null;
};

export type AcademicHistoryEnrollment = {
  id: number;
  enrollment_number?: string | null;
  status: string;
  enrollment_type?: "bundle" | "plan" | string;
  start_date?: string | null;
  end_date?: string | null;
  monthly_amount?: number | null;
  discount_amount?: number | null;
  school_class?: { id: number; name: string } | null;
  school_classes?: AcademicHistorySchoolClass[];
  courses?: AcademicHistoryCourse[];
  course?: AcademicHistoryCourse | null;
  course_plan?: { id: number; name: string } | null;
  bundle?: { id: number; name: string; cycle_label?: string | null } | null;
};

export type AcademicHistoryAnswer = {
  id: number;
  question_id: number;
  question_text?: string | null;
  question_order?: number | null;
  type?: string | null;
  points?: number | null;
  option_id?: number | null;
  option_text?: string | null;
  text_answer?: string | null;
  is_correct?: boolean | null;
  points_earned?: number | null;
};

export type AcademicHistoryReviewOption = {
  id: number;
  option_text: string;
  order?: number;
  selected?: boolean;
  is_correct?: boolean | null;
};

export type AcademicHistoryReviewQuestion = {
  id: number;
  type?: string | null;
  question_text?: string | null;
  image_url?: string | null;
  points?: number | null;
  order?: number;
  allow_text_answer?: boolean;
  options: AcademicHistoryReviewOption[];
  student_answer?: {
    option_id?: number | null;
    text_answer?: string | null;
  } | null;
  correction?: {
    is_correct?: boolean | null;
    points_earned?: number | null;
    max_points?: number | null;
    correct_option_id?: number | null;
  } | null;
};

export type AcademicHistoryAttempt = {
  id: number;
  exam_id: number;
  exam?: {
    id: number;
    title: string;
    duration_minutes?: number | null;
    passing_score?: number | null;
    exam_type?: string | null;
    exam_type_label?: string | null;
    status?: string | null;
    subject?: {
      id: number;
      name: string;
      icon?: string | null;
      color?: string | null;
    } | null;
  } | null;
  started_at?: string | null;
  finished_at?: string | null;
  status?: string | null;
  score?: number | null;
  max_score?: number | null;
  score_display?: string | null;
  percentage?: number | null;
  passed?: boolean | null;
  correct_answers?: number | null;
  total_questions?: number | null;
  questions?: AcademicHistoryReviewQuestion[];
  answers?: AcademicHistoryAnswer[];
};

export type AcademicHistoryStudent = {
  id: number;
  tenant_id?: number | null;
  enrollment_number?: string | null;
  name: string;
  birth_date?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  is_minor?: boolean;
  status?: string;
  desired_courses?: AcademicHistoryCourse[];
  guardians?: Array<{
    id: number;
    name: string;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
  }>;
};

export type AcademicHistorySummary = {
  enrollments_count: number;
  active_enrollments_count: number;
  attempts_count: number;
  completed_attempts_count: number;
  average_percentage: number | null;
  passed_count: number;
  failed_count: number;
};

export type StudentAcademicHistory = {
  student: AcademicHistoryStudent;
  summary: AcademicHistorySummary;
  enrollments: AcademicHistoryEnrollment[];
  exam_attempts: AcademicHistoryAttempt[];
};
