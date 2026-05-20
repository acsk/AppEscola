import type { AuthUser } from "../types/auth";

/** Tenant ativo na sessão: do usuário ou escolhido no login (super_admin). */
export function getActiveTenantId(user: AuthUser | null | undefined): number | null {
  if (!user) return null;
  if (user.role === "super_admin") {
    const selected = user.selected_tenant_id;
    return typeof selected === "number" && selected > 0 ? selected : null;
  }
  return user.tenant_id ?? null;
}
