import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import appJson from "../app.json";
import type { AuthContextValue, AuthUser, SupportAccessRequest } from "../types/auth";

export type { AuthUser } from "../types/auth";

const APP_VERSION = (appJson as any)?.expo?.version ?? "0.0.0";
const STORAGE_APP_VERSION_KEY = "app_version";
const STORAGE_SELECTED_TENANT_KEY = "selected_tenant_id";

const readStoredSelectedTenantId = (): number | null => {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_SELECTED_TENANT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const persistSelectedTenantId = (tenantId: number | null | undefined) => {
  if (typeof localStorage === "undefined") return;
  if (tenantId != null && tenantId > 0) {
    localStorage.setItem(STORAGE_SELECTED_TENANT_KEY, String(tenantId));
  } else {
    localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
  }
};

/** Sessão do super admin guardada enquanto ele acessa um tenant (token próprio emitido pela API). */
const STORAGE_SUPPORT_BACKUP_KEY = "support_backup";

type SupportBackup = { token: string; user: string };

const readSupportBackup = (): SupportBackup | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_SUPPORT_BACKUP_KEY) ?? "null");
    return parsed?.token && parsed?.user ? parsed : null;
  } catch {
    return null;
  }
};

/** Troca de sessão recarrega a página: menu e telas abertas não ficam com o usuário anterior. */
const reloadAt = (hash: string) => {
  if (typeof window === "undefined") return;
  window.location.hash = hash;
  window.location.reload();
};

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const lastKnownTokenRef = useRef<string | null>(null);
  const lastKnownUserRef = useRef<string | null>(null);

  /**
   * Troca a sessão gravada e atualiza as referências da checagem de integridade; sem isso a troca
   * (entrar/sair do acesso a um tenant) parecia adulteração e derrubava a sessão para o login.
   */
  const writeSession = (token: string, serializedUser: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", serializedUser);
    lastKnownTokenRef.current = token;
    lastKnownUserRef.current = serializedUser;
  };

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const storedAppVersion = localStorage.getItem(STORAGE_APP_VERSION_KEY);
      if (storedAppVersion && storedAppVersion !== APP_VERSION) {
        localStorage.clear();
        localStorage.setItem(STORAGE_APP_VERSION_KEY, APP_VERSION);
        if (typeof window !== "undefined") {
          window.location.reload();
          return;
        }
      }
      localStorage.setItem(STORAGE_APP_VERSION_KEY, APP_VERSION);
    }

    const storedToken =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("auth_token")
        : null;
    const storedUser =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("auth_user")
        : null;

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as AuthUser;
        const storedTenantId = readStoredSelectedTenantId();
        if (
          parsedUser.role === "super_admin" &&
          storedTenantId != null &&
          parsedUser.selected_tenant_id == null
        ) {
          parsedUser.selected_tenant_id = storedTenantId;
        }
        setUser(parsedUser);
        setMustChangePassword(!!parsedUser.password_change_required);
        api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
        lastKnownTokenRef.current = storedToken;
        lastKnownUserRef.current = storedUser;
      } catch {}
    }
    setIsLoading(false);

    const handleExpiry = () => {
      // Acesso ao tenant expirou: volta para a sessão do super admin em vez de pedir login.
      const backup = readSupportBackup();
      if (backup) {
        localStorage.removeItem(STORAGE_SUPPORT_BACKUP_KEY);
        localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
        writeSession(backup.token, backup.user);
        reloadAt("#/tenants");
        return;
      }
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
      }
      lastKnownTokenRef.current = null;
      lastKnownUserRef.current = null;
      setUser(null);
      setMustChangePassword(false);
      delete api.defaults.headers.common["Authorization"];
    };

    const forceRelogin = (message: string) => {
      handleExpiry();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:expired", { detail: { message } }));
      }
    };

    const verifyAuthIntegrity = () => {
      if (typeof localStorage === "undefined") return;
      if (!lastKnownTokenRef.current && !lastKnownUserRef.current) return;

      const currentToken = localStorage.getItem("auth_token");
      const currentUser = localStorage.getItem("auth_user");

      const tokenChanged = currentToken !== lastKnownTokenRef.current;
      const userChanged = currentUser !== lastKnownUserRef.current;

      if (tokenChanged || userChanged) {
        forceRelogin(
          "Sua sessão foi alterada. Por segurança, faça login novamente."
        );
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key === "auth_token" || event.key === "auth_user") {
        verifyAuthIntegrity();
      }
    };

    const onVisibilityOrFocus = () => {
      verifyAuthIntegrity();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("auth:expired", handleExpiry);
      window.addEventListener("storage", onStorage);
      window.addEventListener("focus", onVisibilityOrFocus);
      document.addEventListener("visibilitychange", onVisibilityOrFocus);
      return () => {
        window.removeEventListener("auth:expired", handleExpiry);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("focus", onVisibilityOrFocus);
        document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      };
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/login", { login: email, password });
    const body = data?.body ?? data;
    const authUser: AuthUser = {
      ...body?.user,
      selected_tenant_id: body?.selected_tenant_id ?? null,
    };
    const mustReset = !!(body?.password_change_required || authUser?.password_change_required);

    localStorage.setItem("auth_token", body?.token);
    persistSelectedTenantId(authUser.selected_tenant_id);
    const serializedUser = JSON.stringify(authUser);
    localStorage.setItem("auth_user", serializedUser);
    localStorage.setItem(STORAGE_APP_VERSION_KEY, APP_VERSION);
    lastKnownTokenRef.current = body?.token ?? null;
    lastKnownUserRef.current = serializedUser;
    api.defaults.headers.common["Authorization"] = `Bearer ${body?.token}`;
    setUser(authUser);
    setMustChangePassword(mustReset);
  };

  const completeFirstAccess = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => {
    await api.put("/me/password", {
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: confirmPassword,
    });

    setMustChangePassword(false);
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, password_change_required: false };
      const serializedUser = JSON.stringify(updated);
      localStorage.setItem("auth_user", serializedUser);
      lastKnownUserRef.current = serializedUser;
      return updated;
    });
  };

  const enterTenant = async (tenantId: number, request: SupportAccessRequest) => {
    const currentToken = localStorage.getItem("auth_token");
    const currentUser = localStorage.getItem("auth_user");
    if (!currentToken || !currentUser || user?.role !== "super_admin") return;

    const { data } = await api.post(`/tenants/${tenantId}/access`, request);
    const body = data?.body ?? data;
    const tenantUser: AuthUser = {
      ...(JSON.parse(currentUser) as AuthUser),
      selected_tenant_id: body.tenant.id,
      selected_tenant_name: body.tenant.name,
      support_access_expires_at: body.expires_at,
    };

    localStorage.setItem(STORAGE_SUPPORT_BACKUP_KEY, JSON.stringify({ token: currentToken, user: currentUser }));
    persistSelectedTenantId(body.tenant.id);
    writeSession(body.token, JSON.stringify(tenantUser));
    reloadAt("#/dashboard");
  };

  const leaveTenant = async () => {
    const backup = readSupportBackup();
    if (!backup) return;
    try {
      // Encerra o acesso (registra o fim e revoga o token dele); o token do super admin continua válido.
      await api.post("/support-access/end");
    } catch {}
    localStorage.removeItem(STORAGE_SUPPORT_BACKUP_KEY);
    localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
    writeSession(backup.token, backup.user);
    reloadAt("#/tenants");
  };

  const logout = async () => {
    const backup = readSupportBackup();
    try {
      // Durante um acesso a tenant, sair também encerra o acesso (fica registrado).
      await api.post(backup ? "/support-access/end" : "/logout");
    } catch {}
    // E encerra a sessão do super admin guardada.
    if (backup) {
      localStorage.removeItem(STORAGE_SUPPORT_BACKUP_KEY);
      localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
      localStorage.setItem("auth_token", backup.token);
      try {
        await api.post("/logout");
      } catch {}
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem(STORAGE_SELECTED_TENANT_KEY);
    lastKnownTokenRef.current = null;
    lastKnownUserRef.current = null;
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    setMustChangePassword(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, mustChangePassword, login, completeFirstAccess, logout, enterTenant, leaveTenant }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
