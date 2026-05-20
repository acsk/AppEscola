export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: number | null;
  password_change_required?: boolean;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string, tenantId?: number | null) => Promise<void>;
  completeFirstAccess: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};
