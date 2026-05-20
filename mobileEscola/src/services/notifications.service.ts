import { api } from './api';

export type StudentNotificationType =
  | 'general'
  | 'class_announcement'
  | 'billing_due'
  | 'exam_pending'
  | 'exam_result';

export interface StudentNotificationItem {
  id: number;
  type: StudentNotificationType;
  type_label: string;
  type_icon: string;
  title: string;
  body: string;
  data: {
    exam_id?: number;
    invoice_id?: number;
    action?: string;
  } | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsListResult {
  items: StudentNotificationItem[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
  unread_count: number;
}

function unwrap<T>(data: unknown): T {
  const envelope = data as { body?: T };
  return (envelope?.body ?? data) as T;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/api/aluno/notifications/unread-count');
  const body = unwrap<{ unread_count: number }>(data);
  return body.unread_count ?? 0;
}

export async function fetchNotifications(params?: {
  page?: number;
  per_page?: number;
  unread_only?: boolean | number;
}): Promise<NotificationsListResult> {
  const { data } = await api.get('/api/aluno/notifications', { params });
  return unwrap<NotificationsListResult>(data);
}

export async function fetchNotificationDetail(
  id: number
): Promise<StudentNotificationItem> {
  const { data } = await api.get(`/api/aluno/notifications/${id}`);
  return unwrap<StudentNotificationItem>(data);
}

export async function markNotificationRead(
  id: number
): Promise<StudentNotificationItem> {
  const { data } = await api.patch(`/api/aluno/notifications/${id}/read`);
  return unwrap<StudentNotificationItem>(data);
}

export async function markAllNotificationsRead(): Promise<{
  marked_count: number;
  unread_count: number;
}> {
  const { data } = await api.post('/api/aluno/notifications/read-all');
  return unwrap<{ marked_count: number; unread_count: number }>(data);
}

export function notificationIconName(typeIcon: string): string {
  const map: Record<string, string> = {
    megaphone: 'megaphone-outline',
    groups: 'people-outline',
    receipt: 'receipt-outline',
    assignment: 'clipboard-outline',
    grade: 'school-outline',
  };
  return map[typeIcon] ?? 'notifications-outline';
}
