import api from "./api";

export type CalendarEventType =
  | "exam"
  | "exam_presential"
  | "school"
  | "class"
  | "billing"
  | "task"
  | "general";

export type CalendarAudienceType = "tenant" | "course" | "school_class";

export interface CalendarEvent {
  id: number;
  source_type: string | null;
  source_id: number | null;
  source_type: string | null;
  is_synced: boolean;
  is_editable: boolean;
  type: CalendarEventType;
  type_label: string;
  type_color?: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  course_id: number | null;
  school_class_id: number | null;
  location: string | null;
  audience_type: CalendarAudienceType;
  is_published: boolean;
  exam_id: number | null;
}

export interface CalendarPayload {
  type: CalendarEventType;
  title: string;
  description?: string;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  course_id?: number | null;
  school_class_id?: number | null;
  location?: string | null;
  audience_type: CalendarAudienceType;
  is_published?: boolean;
}

function unwrap<T>(data: any): T {
  return (data?.body ?? data) as T;
}

export async function fetchCalendarTypes() {
  const { data } = await api.get("/calendar-events/types");
  return unwrap<{
    types: Record<string, { label: string; icon: string; color: string }>;
    audience_types: CalendarAudienceType[];
  }>(data);
}

export async function fetchCalendarEvents(from: string, to: string) {
  const { data } = await api.get("/calendar-events", { params: { from, to } });
  return unwrap<{ items: CalendarEvent[] }>(data);
}

export async function createCalendarEvent(payload: CalendarPayload) {
  const { data } = await api.post("/calendar-events", payload);
  return unwrap<CalendarEvent>(data);
}

export async function updateCalendarEvent(id: number, payload: Partial<CalendarPayload>) {
  const { data } = await api.put(`/calendar-events/${id}`, payload);
  return unwrap<CalendarEvent>(data);
}

export async function deleteCalendarEvent(id: number) {
  await api.delete(`/calendar-events/${id}`);
}
