/**
 * Papéis do painel que gerenciam simulados (criar/editar/publicar).
 * Espelha ExamAccessService::STAFF_ROLES da API.
 */
export const EXAM_MANAGER_ROLES = [
  "super_admin",
  "admin",
  "secretaria",
  "professor",
] as const;

export type ExamManagerRole = (typeof EXAM_MANAGER_ROLES)[number];

export function canManageExams(role?: string | null): boolean {
  if (!role) return false;
  return (EXAM_MANAGER_ROLES as readonly string[]).includes(role);
}
