import type { WithNavigate } from "./navigation";

export type OfficialAssessmentSubjectRef = {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
};

export type OfficialAssessmentListItem = {
  id: number;
  title: string;
  kind: string;
  assessment_date: string;
  max_score: number;
  weight: number;
  counts_towards_report_card: boolean;
  status: "draft" | "published";
  school_class_id: number;
  school_class?: { id: number; name: string } | null;
  subject?: OfficialAssessmentSubjectRef | null;
  subjects?: OfficialAssessmentSubjectRef[];
  subject_ids?: number[];
  grades_count?: number;
};

export type OfficialAssessmentForm = {
  title: string;
  kind: string;
  assessment_date: string;
  school_class_id: string;
  exam_type_id: string;
  max_score: string;
  weight: string;
  counts_towards_report_card: boolean;
  notes: string;
};

/** Uma nota por aluno na turma da avaliação. */
export type GradeDraftRow = {
  student_id: number;
  student_name: string;
  enrollment_number: string | null;
  enrollment_id: number | null;
  is_absent: boolean;
  grade: string;
  notes: string;
};

export type OfficialAssessmentsScreenProps = WithNavigate;

export type OfficialAssessmentFormScreenProps = WithNavigate & {
  assessmentId: number | null;
};
