import { api } from './api';

export type CalendarEventType =
  | 'exam'
  | 'exam_presential'
  | 'school'
  | 'class'
  | 'billing'
  | 'task'
  | 'general';

export interface CalendarEventItem {
  id: number;
  source_type: string | null;
  source_id: number | null;
  is_synced: boolean;
  is_editable: boolean;
  type: CalendarEventType;
  type_label: string;
  type_icon: string;
  type_color: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  course_id: number | null;
  course?: { id: number; name: string } | null;
  school_class_id: number | null;
  school_class?: { id: number; name: string } | null;
  location: string | null;
  student_id: number | null;
  exam_id: number | null;
  invoice_id: number | null;
}

export interface CalendarEventsResponse {
  from: string;
  to: string;
  items: CalendarEventItem[];
}

function unwrap<T>(data: unknown): T {
  const envelope = data as { body?: T };
  return (envelope?.body ?? data) as T;
}

export type CalendarTypeMeta = {
  label: string;
  icon: string;
  color: string;
};

export async function fetchStudentCalendarTypes(): Promise<Record<string, CalendarTypeMeta>> {
  const { data } = await api.get('/api/aluno/calendar-events/types');
  const body = unwrap<{ types: Record<string, CalendarTypeMeta> }>(data);
  return body.types ?? {};
}

export async function fetchStudentCalendarEvents(params: {
  from: string;
  to: string;
}): Promise<CalendarEventsResponse> {
  const { data } = await api.get('/api/aluno/calendar-events', { params });
  return unwrap<CalendarEventsResponse>(data);
}

export function calendarIconName(icon: string): string {
  const map: Record<string, string> = {
    clipboard: 'clipboard-outline',
    school: 'school-outline',
    business: 'business-outline',
    people: 'people-outline',
    receipt: 'receipt-outline',
    checkbox: 'checkbox-outline',
    calendar: 'calendar-outline',
  };
  return map[icon] ?? 'calendar-outline';
}

export function formatEventTime(event: CalendarEventItem): string {
  if (event.all_day) return 'Dia inteiro';
  try {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : null;
    const startStr = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (!end) return startStr;
    const endStr = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${startStr} – ${endStr}`;
  } catch {
    return '';
  }
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function eventsForDay(events: CalendarEventItem[], day: Date): CalendarEventItem[] {
  return events.filter((event) => {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : start;
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    return start <= dayEnd && end >= dayStart;
  });
}
