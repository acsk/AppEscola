export type ReportCardSubjectRef = {
  id: number;
  name: string;
  icon?: string | null;
  color?: string | null;
};

export type ReportCardAssessmentRef = {
  id: number;
  title: string;
  kind: string;
  assessment_date: string | null;
  max_score: number | null;
  weight: number | null;
  school_class: { id: number; name: string } | null;
};

export type ReportCardGradeRow = {
  id: number;
  official_assessment_id: number;
  student_id: number;
  subject_id: number | null;
  subject: ReportCardSubjectRef | null;
  assessment?: ReportCardAssessmentRef | null;
  grade: number | null;
  is_absent: boolean;
  notes?: string | null;
};

export type ReportCardSubjectSummary = {
  subject_id: number;
  subject: ReportCardSubjectRef | null;
  grades_count: number;
  absences_count: number;
  weighted_average: number | null;
};

export type StudentReportCard = {
  student: {
    id: number;
    name: string;
    enrollment_number: string | null;
  };
  summary: {
    assessments_count: number;
    absences_count: number;
    weighted_average: number | null;
    by_subject: ReportCardSubjectSummary[];
  };
  grades: ReportCardGradeRow[];
};
