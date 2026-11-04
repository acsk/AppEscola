export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: number | null;
  /** Tenant que o super admin está acessando (token emitido por POST /tenants/{id}/access). */
  selected_tenant_id?: number | null;
  selected_tenant_name?: string | null;
  support_access_expires_at?: string | null;
  password_change_required?: boolean;
};

/** Motivo, o que será feito e duração do acesso de suporte (POST /tenants/{id}/access). */
export type SupportAccessRequest = {
  reason_id: number;
  details?: string;
  duration_minutes: number;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeFirstAccess: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** Super admin: entra no tenant com um token próprio, guardando a sessão atual. */
  enterTenant: (tenantId: number, request: SupportAccessRequest) => Promise<void>;
  /** Encerra o acesso ao tenant e volta para a sessão do super admin. */
  leaveTenant: () => Promise<void>;
};
