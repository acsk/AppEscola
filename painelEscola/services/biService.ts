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
  unit: "pct" | "count" | "score";
  min_sample: number;
  missing: string;
  plan: "basic" | "advanced";
};

export type BiMetric = {
  key: string;
  value: number | null;
  unit: "pct" | "count" | "score";
  previous: number | null;
  delta: number | null;
  delta_unit: "pp" | "pts" | "percent" | null;
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
    answers_as_of?: string | null;
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
    /** label: nome do item da célula quando as colunas são posições (ex.: assunto 1 de cada disciplina). */
    cells: { topic_id: number; value: number | null; answers: number; below_goal: boolean; label?: string; extra?: string }[];
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
    answers_as_of?: string | null;
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
    items: BiStudentRow[];
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

export type BiStudentRow = {
  student_id: number;
  name: string;
  classes: string[];
  online: { value: number | null; n: number };
  presencial: { value: number | null; n: number };
  practice: { value: number | null; n: number };
  attendance: { value: number | null; n: number };
  evolution_pp: number | null;
  reasons: BiSupportReason[];
};

export type BiStudentListFilter = "all" | "attention" | "improving" | "declining";

type BiThresholds = { min_student_results: number; min_practice_answers: number; min_attendance_records: number };

export type BiStudentList = {
  meta: { period: { from: string; to: string }; goal_pct: number; evolution_threshold_pp: number; generated_at: string } & BiThresholds;
  summary: { total: number; attention: number; improving: number; declining: number; with_evolution: number };
  items: BiStudentRow[];
  pagination: { page: number; per_page: number; total: number; last_page: number };
};

export type BiTopicTrend = {
  topic_id: number;
  name: string;
  subject: string;
  answers: number;
  accuracy: number;
  previous: number | null;
  delta_pp: number | null;
};

export type BiStudentEvolution = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    goal_pct: number;
    evolution_threshold_pp: number;
    min_answers: number;
    generated_at: string;
  } & BiThresholds;
  student: BiStudentRow | null;
  peers: { students: number; classes: string[] };
  series: {
    modality: BiModality;
    exam_type_id: number | null;
    exam_type: string | null;
    points: { assessment_id: number; title: string; date: string; pct: number; peers_avg: number | null; peers_n: number }[];
  }[];
  subjects: { subject_id: number; name: string; answers: number; accuracy: number | null; peers_accuracy: number | null; peers_answers: number }[];
  topics: { critical: BiTopicTrend[]; improving: BiTopicTrend[] };
};

export type BiPerformance = {
  meta: { period: { from: string; to: string }; previous_period: { from: string; to: string }; goal_pct: number; min_sample: number; generated_at: string };
  metrics: BiMetric[];
  subjects: {
    subject_id: number;
    name: string;
    grades: number;
    students: number;
    avg: number | null;
    below_goal: boolean;
    at_goal_pct: number | null;
    absences: number;
    absence_rate: number;
    previous: number | null;
    delta_pp: number | null;
  }[];
  matrix: BiHeatmap;
};

export async function fetchBiStudents(
  filters: BiFilters,
  options: { filter: BiStudentListFilter; search?: string; page: number; perPage?: number }
): Promise<BiStudentList> {
  const { data } = await api.get("/bi/students", {
    params: {
      ...cleanBiFilters(filters),
      filter: options.filter,
      ...(options.search ? { search: options.search } : {}),
      page: options.page,
      per_page: options.perPage ?? 25,
    },
  });
  return getApiResponseBody(data) as BiStudentList;
}

export async function fetchBiStudentEvolution(studentId: number, filters: BiFilters): Promise<BiStudentEvolution> {
  const { data } = await api.get(`/bi/students/${studentId}/evolution`, { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiStudentEvolution;
}

export async function fetchBiPerformance(filters: BiFilters): Promise<BiPerformance> {
  const { data } = await api.get("/bi/performance", { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiPerformance;
}

export type BiCriteria = {
  goal_pct: number;
  evolution_threshold_pp: number;
  attendance_alert_below: number;
  dedication_days_per_week: number;
  profile_min_assessments: number;
  profile_min_questions: number;
};

export type BiCriteriaPayload = {
  criteria: BiCriteria;
  limits: Record<keyof BiCriteria, { min: number; max: number; integer: boolean }>;
};

export async function fetchBiCriteria(): Promise<BiCriteriaPayload> {
  const { data } = await api.get("/bi/criteria");
  return getApiResponseBody(data) as BiCriteriaPayload;
}

export async function saveBiCriteria(values: Partial<BiCriteria>): Promise<BiCriteriaPayload> {
  const { data } = await api.put("/bi/criteria", values);
  return getApiResponseBody(data) as BiCriteriaPayload;
}

export type BiPriorityTopics = {
  exam_type_id: number;
  configured: boolean;
  courses: { id: number; name: string }[];
  subjects: { subject_id: number; name: string; topics: { topic_id: number; name: string; weight: number }[] }[];
};

export async function fetchBiPriorities(examTypeId: number): Promise<BiPriorityTopics> {
  const { data } = await api.get(`/bi/priorities/${examTypeId}`);
  return getApiResponseBody(data) as BiPriorityTopics;
}

export async function saveBiPriorities(examTypeId: number, topics: { topic_id: number; weight: number }[]): Promise<BiPriorityTopics> {
  const { data } = await api.put(`/bi/priorities/${examTypeId}`, { topics });
  return getApiResponseBody(data) as BiPriorityTopics;
}

export type BiIndexComponent = {
  key: string;
  label: string;
  value: number | null;
  raw: number | null;
  n: number;
  min_sample: number;
  weight: number;
  sufficient: boolean;
};

export type BiDimension = BiMetric & { class_avg: number | null; components: BiIndexComponent[] };

export type BiDimensionKey = "learning" | "engagement" | "preparation";

export type BiDiagnosis = {
  meta: {
    period: { from: string; to: string };
    previous_period: { from: string; to: string };
    goal_pct: number;
    min_topic_answers: number;
    exam_type: { id: number; label: string } | null;
    priorities_provisional: boolean;
    generated_at: string;
  };
  student: {
    id: number;
    name: string;
    school_class: { id: number; name: string };
    course: string | null;
    reasons: BiSupportReason[];
    active_days_per_week: number;
    questions: number;
    assessments: number;
    assessments_avg: number | null;
  };
  class: { students: number };
  dimensions: Record<BiDimensionKey, BiDimension>;
  highlight: { subject: string; accuracy: number; topics: string[] } | null;
  history: ({ month: string; label: string } & Record<BiDimensionKey, number | null>)[];
  domain: {
    subject_id: number;
    name: string;
    topics: { topic_id: number; name: string; weight: number; value: number | null; answers: number; below_goal: boolean; class_value: number | null }[];
  }[];
  recommendations: { type: string; category: string; title: string; reason: string }[];
};

export async function fetchBiDiagnosis(studentId: number, filters: BiFilters): Promise<BiDiagnosis> {
  const { data } = await api.get(`/bi/students/${studentId}/diagnosis`, { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiDiagnosis;
}

export type BiQuadrant = "A1" | "A2" | "B1" | "B2";

export type BiProfiles = {
  meta: {
    period: { from: string; to: string };
    criteria: { goal_pct: number; dedication_days_per_week: number; min_assessments: number; min_questions: number };
    generated_at: string;
  };
  summary: { total: number; classified: number; unclassified: number };
  quadrants: { key: BiQuadrant; count: number; label: string; dedication: string; hint: string }[];
  points: {
    student_id: number;
    name: string;
    classes: string[];
    performance: number;
    dedication: number;
    questions: number;
    assessments: number;
    quadrant: BiQuadrant;
    distance_pp: number;
  }[];
};

export async function fetchBiProfiles(filters: BiFilters): Promise<BiProfiles> {
  const { data } = await api.get("/bi/profiles", { params: cleanBiFilters(filters) });
  return getApiResponseBody(data) as BiProfiles;
}
