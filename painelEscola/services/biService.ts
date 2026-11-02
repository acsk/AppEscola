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
