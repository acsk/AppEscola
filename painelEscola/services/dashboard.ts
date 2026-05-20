import api from "./api";
import { getActiveTenantId } from "../utils/tenantContext";
import type { AuthUser } from "../types/auth";

export type DashboardStat = {
  key: string;
  label: string;
  value: number;
  trend_percent: number | null;
  variant: "purple" | "amber" | "sky" | "teal";
};

export type DashboardSegment = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
};

export type DashboardAttendanceDay = {
  day: string;
  present: number;
  absent: number;
  records: number;
};

export type DashboardPayload = {
  generated_at: string;
  stats: DashboardStat[];
  students_breakdown: {
    total: number;
    segments: DashboardSegment[];
  };
  finance: {
    open_count: number;
    open_amount: string;
    overdue_count: number;
    overdue_amount: string;
    paid_month_count: number;
    paid_month_amount: string;
    exam_passes_30d: number;
    enrollments_active: number;
  };
  attendance: {
    period: string;
    from: string;
    to: string;
    present_percent: number | null;
    highlight_day: string | null;
    days: DashboardAttendanceDay[];
  };
  attendance_class: { id: number; name: string } | null;
  school_classes: Array<{ id: number; name: string }>;
  calendar: { year: number; month: number; event_days: number[] };
  upcoming_events: Array<{
    id: number;
    time: string;
    title: string;
    subtitle: string;
    starts_at: string;
  }>;
};

export async function fetchDashboard(
  params?: { school_class_id?: number },
  user?: AuthUser | null
): Promise<DashboardPayload> {
  const tenantId = getActiveTenantId(user ?? null);
  const query: Record<string, number> = {};
  if (params?.school_class_id) query.school_class_id = params.school_class_id;
  if (tenantId != null) query.tenant_id = tenantId;

  const { data } = await api.get("/dashboard", {
    params: Object.keys(query).length > 0 ? query : undefined,
  });
  return data.body ?? data;
}
