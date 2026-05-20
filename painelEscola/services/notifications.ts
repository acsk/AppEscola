import api from "./api";

export type NotificationAudienceType =
  | "tenant"
  | "course"
  | "school_class"
  | "student"
  | "students";

export type NotificationTypeKey =
  | "general"
  | "class_announcement"
  | "billing_due"
  | "exam_pending"
  | "exam_result";

export interface NotificationTypeMeta {
  label: string;
  icon: string;
}

export interface NotificationTypesResponse {
  types: Record<NotificationTypeKey, NotificationTypeMeta>;
  audience_types: NotificationAudienceType[];
  calendar_enabled_types?: NotificationTypeKey[];
  calendar_type_labels?: Partial<Record<NotificationTypeKey, string>>;
}

export interface NotificationSettingsResponse {
  tenant_id: number;
  types: Record<NotificationTypeKey, NotificationTypeMeta>;
  calendar_enabled_types: NotificationTypeKey[];
  calendar_defaults: NotificationTypeKey[];
  calendar_type_map: Partial<Record<NotificationTypeKey, string>>;
  calendar_type_labels: Partial<Record<NotificationTypeKey, string>>;
}

export interface SendNotificationPayload {
  type: NotificationTypeKey;
  title: string;
  body: string;
  audience_type: NotificationAudienceType;
  course_id?: number;
  school_class_id?: number;
  student_id?: number;
  student_ids?: number[];
  data?: {
    exam_id?: number;
    invoice_id?: number;
    action?: string;
  };
  show_on_calendar?: boolean;
  starts_at?: string;
  ends_at?: string;
}

export interface NotificationBroadcast {
  id: number;
  type: NotificationTypeKey;
  type_label?: string;
  title: string;
  body: string;
  audience_type: NotificationAudienceType;
  audience_params?: Record<string, unknown>;
  data?: Record<string, unknown> | null;
  recipients_count: number;
  show_on_calendar?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  sent_by?: { id: number; name: string } | null;
  created_at?: string;
}

export interface BroadcastListResponse {
  items: NotificationBroadcast[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

function unwrap<T>(data: any): T {
  return (data?.body ?? data) as T;
}

export async function fetchNotificationTypes(): Promise<NotificationTypesResponse> {
  const { data } = await api.get("/notifications/types");
  return unwrap<NotificationTypesResponse>(data);
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsResponse> {
  const { data } = await api.get("/notifications/settings");
  return unwrap<NotificationSettingsResponse>(data);
}

export async function updateNotificationCalendarSettings(
  calendarEnabledTypes: NotificationTypeKey[]
): Promise<{ calendar_enabled_types: NotificationTypeKey[] }> {
  const { data } = await api.put("/notifications/settings", {
    calendar_enabled_types: calendarEnabledTypes,
  });
  return unwrap<{ calendar_enabled_types: NotificationTypeKey[] }>(data);
}

export async function previewNotificationRecipients(
  payload: SendNotificationPayload
): Promise<{ recipients_count: number }> {
  const { data } = await api.post("/notifications/preview", payload);
  return unwrap<{ recipients_count: number }>(data);
}

export async function sendNotification(
  payload: SendNotificationPayload
): Promise<NotificationBroadcast> {
  const { data } = await api.post("/notifications/send", payload);
  return unwrap<NotificationBroadcast>(data);
}

export async function fetchNotificationBroadcasts(
  page = 1,
  perPage = 20
): Promise<BroadcastListResponse> {
  const { data } = await api.get("/notifications/broadcasts", {
    params: { page, per_page: perPage },
  });
  return unwrap<BroadcastListResponse>(data);
}
