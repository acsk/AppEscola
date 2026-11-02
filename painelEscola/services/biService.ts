import api from "./api";
import { getApiResponseBody } from "../utils/apiErrors";

/** Filtros globais da Inteligência Educacional (mesmos nomes da API). */
export type BiFilters = {
  from?: string;
  to?: string;
  school_year?: number | null;
  course_id?: number | null;
  school_class_id?: number | null;
  subject_id?: number | null;
  teacher_id?: number | null;
  exam_type_id?: number | null;
  modality?: "online" | "presencial" | null;
};

export type BiSection = { key: string; label: string; plan: "basic" | "advanced"; available: boolean };

export type BiMeta = {
  features: { enabled: boolean; plan: "basic" | "advanced"; ai_enabled: boolean };
  sections: BiSection[];
  scope: { role: string; tenant_wide: boolean };
  defaults: { from: string; to: string; goal_pct: number; evolution_threshold_pp: number };
  filter_options: {
    courses: { id: number; name: string }[];
    school_classes: { id: number; name: string; course_id: number; year: number | null; status: string }[];
    subjects: { id: number; name: string }[];
    teachers: { id: number; name: string }[];
    exam_types: { id: number; slug: string; label: string }[];
    school_years: number[];
    modalities: { value: "online" | "presencial"; label: string }[];
  };
};

export type BiMetricDefinition = {
  key: string;
  name: string;
  description: string;
  formula: string;
  sources: string[];
  unit: "pct" | "count";
  min_sample: number;
  missing: string;
  plan: "basic" | "advanced";
};

export type BiMetric = {
  key: string;
  value: number | null;
  unit: "pct" | "count";
  previous: number | null;
  delta: number | null;
  delta_unit: "pp" | "percent" | null;
  trend: "up" | "down" | "stable" | null;
  sample: Record<string, number> & { size: number };
  min_sample: number;
  sufficient: boolean;
};

export type BiMonthlyPoint = {
  month: string;
  label: string;
  online: { value: number | null; students: number };
  presencial: { value: number | null; students: number };
};

export type BiSubjectDifficulty = {
  subject_id: number;
  name: string;
  accuracy: number;
  answers: number;
  critical_topic: { topic_id: number; name: string; accuracy: number; answers: number } | null;
};

export type BiSupportReason = { code: "below_goal" | "declining" | "low_attendance"; label: string; value: number; detail: string };

export type BiOverview = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    goal_pct: number;
    evolution_threshold_pp: number;
    generated_at: string;
  };
  metrics: BiMetric[];
  monthly: BiMonthlyPoint[];
  subjects_difficulty: BiSubjectDifficulty[];
  needs_support: {
    total: number;
    items: { student_id: number; name: string; classes: string[]; reasons: BiSupportReason[] }[];
  };
};

/** Só os filtros preenchidos vão para a query string. */
export const cleanBiFilters = (filters: BiFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== ""));

export async function fetchBiMeta(): Promise<BiMeta> {
  const { data } = await api.get("/bi/meta");
  return getApiResponseBody(data) as BiMeta;
}

export async function fetchBiMetrics(): Promise<BiMetricDefinition[]> {
  const { data } = await api.get("/bi/metrics");
  return ((getApiResponseBody(data) as { metrics: BiMetricDefinition[] })?.metrics ?? []);
}

export async function fetchBiOverview(filters: BiFilters): Promise<BiOverview> {
  const { data } = await api.get("/bi/overview", { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiOverview;
}

/** Fonte das respostas na tela Disciplinas e assuntos. */
export type BiAnswerSource = "both" | "online" | "practice";

export type BiSubjectSummary = { subject_id: number; name: string; answers: number };

export type BiHeatmap = {
  topics: { topic_id: number; name: string }[];
  rows: {
    school_class_id: number;
    name: string;
    answers: number;
    cells: { topic_id: number; value: number | null; answers: number; below_goal: boolean }[];
  }[];
  truncated: boolean;
};

export type BiTopicRank = {
  topic_id: number;
  name: string;
  accuracy: number;
  below_goal: boolean;
  previous: number | null;
  delta_pp: number | null;
  answers: number;
  students: number;
};

export type BiSubjectAnalytics = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    source: BiAnswerSource;
    goal_pct: number;
    topic_min_sample: number;
    min_subject_student_answers: number;
    generated_at: string;
  };
  subject: { id: number; name: string };
  metrics: BiMetric[];
  heatmap_available: boolean;
  heatmap: BiHeatmap | null;
  ranking: { items: BiTopicRank[]; insufficient: { topic_id: number; name: string; answers: number }[] };
};

export type BiRecurringError = {
  question_id: number;
  code: string;
  source_label: string;
  text: string;
  answers: number;
  students: number;
  error_rate: number;
  options: { option_id: number; letter: string; text: string; is_correct: boolean; count: number; pct: number }[];
  other: number;
  main_distractor: { option_id: number; letter: string; pct: number } | null;
};

export type BiTopicErrors = {
  topic: { id: number; name: string };
  source: BiAnswerSource;
  min_answers: number;
  total: number;
  items: BiRecurringError[];
};

/** A disciplina vem da aba (rota), não do filtro global. */
const subjectParams = (filters: BiFilters, source: BiAnswerSource) => ({ ...cleanBiFilters({ ...filters, subject_id: null }), source });

export async function fetchBiSubjects(filters: BiFilters, source: BiAnswerSource): Promise<BiSubjectSummary[]> {
  const { data } = await api.get("/bi/subjects", { params: subjectParams(filters, source) });
  return ((getApiResponseBody(data) as { subjects: BiSubjectSummary[] })?.subjects ?? []);
}

export async function fetchBiSubject(subjectId: number, filters: BiFilters, source: BiAnswerSource): Promise<BiSubjectAnalytics> {
  const { data } = await api.get(`/bi/subjects/${subjectId}`, { params: subjectParams(filters, source) });
  return getApiResponseBody(data) as BiSubjectAnalytics;
}

export async function fetchBiTopicErrors(
  subjectId: number,
  topicId: number,
  filters: BiFilters,
  source: BiAnswerSource,
  limit = 5
): Promise<BiTopicErrors> {
  const { data } = await api.get(`/bi/subjects/${subjectId}/topics/${topicId}/errors`, {
    params: { ...subjectParams(filters, source), limit },
  });
  return getApiResponseBody(data) as BiTopicErrors;
}

export type BiModality = "online" | "presencial";

export type BiAssessmentItem = {
  modality: BiModality;
  assessment_id: number;
  title: string;
  school_class: string | null;
  exam_type: string | null;
  date: string;
  participants: number;
  absent: number | null;
  avg: number | null;
  median: number | null;
  below_goal: number;
  sufficient: boolean;
};

export type BiAssessments = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    goal_pct: number;
    min_sample: number;
    generated_at: string;
  };
  metrics: BiMetric[];
  monthly: BiMonthlyPoint[];
  items: { total: number; items: BiAssessmentItem[] };
};

export type BiAssessmentDetail = {
  meta: { period: { from: string; to: string }; goal_pct: number; min_sample: number; generated_at: string };
  assessment: {
    modality: BiModality;
    id: number;
    title: string;
    exam_type: string | null;
    date: string | null;
    date_to: string | null;
    school_class: string | null;
    max_score: number | null;
  };
  stats: {
    participants: number;
    absent: number | null;
    sufficient: boolean;
    avg: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    at_goal_pct: number | null;
  };
  histogram: { from: number; to: number; count: number }[];
  classes: { school_class_id: number; name: string; participants: number; avg: number | null; median: number | null }[];
  subjects: { subject_id: number; name: string; questions: number | null; participants: number; pct: number }[];
  topics: { topic_id: number; name: string; subject: string; answers: number; accuracy: number }[];
  students: { total: number; items: { student_id: number; name: string; classes: string[]; pct: number; below_goal: boolean }[] };
};

export async function fetchBiAssessments(filters: BiFilters): Promise<BiAssessments> {
  const { data } = await api.get("/bi/assessments", { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiAssessments;
}

export async function fetchBiAssessment(modality: BiModality, id: number, filters: BiFilters): Promise<BiAssessmentDetail> {
  const { data } = await api.get(`/bi/assessments/${modality}/${id}`, { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiAssessmentDetail;
}

export type BiClassComparison = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    goal_pct: number;
    generated_at: string;
  };
  items: {
    school_class_id: number;
    name: string;
    course: string | null;
    year: number | null;
    metrics: Record<"students" | "avg_online" | "avg_presencial" | "practice" | "attendance" | "participation" | "needs_support", BiMetric>;
  }[];
};

type BiSampledValue = { value: number | null; n: number };

export type BiClassDetail = {
  meta: {
    period: { from: string; to: string };
    goal_pct: number;
    min_student_results: number;
    min_practice_answers: number;
    min_attendance_records: number;
    generated_at: string;
  };
  school_class: { id: number; name: string; course: string | null; year: number | null; status: string; teachers: string[] };
  students: {
    total: number;
    needs_support: number;
    items: {
      student_id: number;
      name: string;
      online: BiSampledValue;
      presencial: BiSampledValue;
      practice: BiSampledValue;
      attendance: BiSampledValue;
      evolution_pp: number | null;
      reasons: BiSupportReason[];
    }[];
  };
};

export async function fetchBiClasses(filters: BiFilters): Promise<BiClassComparison> {
  const { data } = await api.get("/bi/classes", { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiClassComparison;
}

export async function fetchBiClass(schoolClassId: number, filters: BiFilters): Promise<BiClassDetail> {
  const { data } = await api.get(`/bi/classes/${schoolClassId}`, { params: cleanBiFilters({ ...filters, school_class_id: null }) });
  return getApiResponseBody(data) as BiClassDetail;
}
