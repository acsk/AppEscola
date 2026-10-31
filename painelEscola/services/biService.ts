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
