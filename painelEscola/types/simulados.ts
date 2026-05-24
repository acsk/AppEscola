import type { WithNavigate } from "./navigation";

export type ExamForm = {
  title: string;
  exam_type: string;
  status: string;
  course_ids: number[];
  subject_id: string;
  description: string;
  duration_minutes: string;
  passing_score: string;
  starts_at: string;
  ends_at: string;
  release_results_after_end: string;
  allow_retake: string;
  max_attempts: string;
  min_score_to_retake: string;
};

export type ExamQuestion = {
  id: number;
  type: "multiple_choice" | "essay";
  exam_type?: string | null;
  exam_type_label?: string | null;
  question_text: string | null;
  points: number;
  order: number;
  image_url: string | null;
  video_url: string | null;
  explanation: string | null;
  subject: { id: number; name: string } | null;
  options: ExamQuestionOption[];
};

export type ExamQuestionOption = {
  id?: number;
  option_text: string;
  is_correct: boolean;
  order: number;
  triggers_text_input: boolean;
};

export type ExamQuestionForm = {
  type: "multiple_choice" | "essay";
  exam_type: string;
  question_text: string;
  subject_id: string;
  points: string;
  order: string;
  image_url: string;
  video_url: string;
  explanation: string;
  options: ExamOptionForm[];
};

export type ExamOptionForm = {
  option_text: string;
  is_correct: boolean;
  order: number;
  triggers_text_input: boolean;
};

export type ExamSupportMaterial = {
  id: number;
  exam_id: number;
  title: string;
  description: string | null;
  type: "link" | "file";
  content: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

export type ExamSupportMaterialForm = {
  title: string;
  description: string;
  type: "link" | "file";
  content: string;
};

export type ExamListItem = {
  id: number;
  title: string;
  exam_type: string;
  exam_type_label: string;
  status: string;
  status_label: string;
  duration_minutes: number | null;
  passing_score: number | null;
  release_results_after_end?: boolean;
  total_questions: number;
  total_points: number;
  course: { id: number; name: string } | null;
  courses?: { id: number; name: string }[];
  course_ids?: number[];
  subject: { id: number; name: string; icon: string | null; color: string | null } | null;
};

export type ExamPreviewQuestion = {
  id: number;
  type: "multiple_choice" | "essay";
  question_text: string;
  image_url: string | null;
  video_url: string | null;
  points: number;
  order: number;
  options: { id: number; option_text: string; order: number; triggers_text_input: boolean }[];
};

export type ExamPreviewPlayerOption = {
  id: number;
  option_text: string;
  order: number;
  triggers_text_input: boolean;
  is_correct?: boolean;
};

export type ExamPreviewPlayerQuestion = {
  id: number;
  type: "multiple_choice" | "essay";
  question_text: string;
  image_url?: string | null;
  video_url?: string | null;
  points: number;
  order: number;
  explanation?: string | null;
  options: ExamPreviewPlayerOption[];
};

export type ExamAttempt = {
  id: number;
  status: "in_progress" | "pending_review" | "awaiting_release" | "completed";
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number;
  percentage: number | null;
  passed: boolean | null;
  pending_answers_count?: number;
  exam: { id: number; title: string } | null;
  student: { id: number; name: string; enrollment_number: string | null };
};

export type ExamAttemptDetail = ExamAttempt & {
  answers: {
    id: number;
    question_id: number;
    question_text: string;
    type: "multiple_choice" | "essay";
    option_id: number | null;
    option_text: string | null;
    text_answer: string | null;
    is_correct: boolean | null;
    points_earned: number | null;
  }[];
};

export type ExamsScreenProps = WithNavigate;

export type ExamFormScreenProps = WithNavigate & {
  examId: number | null;
};

export type ExamAttemptsScreenProps = WithNavigate & {
  initialStatusFilter?: string;
};
