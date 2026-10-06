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

/** Nome do papel para exibição (o painel mostra o papel, não o e-mail). */
export function roleLabel(role?: string | null): string {
  switch (role) {
    case "super_admin":
      return "Super administrador";
    case "admin":
      return "Administrador";
    case "secretaria":
      return "Secretaria";
    case "professor":
      return "Professor";
    case "financeiro":
      return "Financeiro";
    case "aluno":
      return "Aluno";
    default:
      return role ?? "";
  }
}
