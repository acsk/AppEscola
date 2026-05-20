import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import appJson from "../app.json";
import type { AuthContextValue, AuthUser } from "../types/auth";

export type { AuthUser } from "../types/auth";

const APP_VERSION = (appJson as any)?.expo?.version ?? "0.0.0";
const STORAGE_APP_VERSION_KEY = "app_version";

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const lastKnownTokenRef = useRef<string | null>(null);
  const lastKnownUserRef = useRef<string | null>(null);

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
        setUser(parsedUser);
        setMustChangePassword(!!parsedUser.password_change_required);
        api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
        lastKnownTokenRef.current = storedToken;
        lastKnownUserRef.current = storedUser;
      } catch {}
    }
    setIsLoading(false);

    const handleExpiry = () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
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

  const login = async (email: string, password: string, tenantId?: number | null) => {
    const payload: Record<string, any> = { login: email, password };
    if (tenantId != null) payload.tenant_id = tenantId;

    const { data } = await api.post("/login", payload);
    const body = data?.body ?? data;
    const authUser: AuthUser = body?.user;
    const mustReset = !!(body?.password_change_required || authUser?.password_change_required);

    localStorage.setItem("auth_token", body?.token);
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

  const logout = async () => {
    try {
      await api.post("/logout");
    } catch {}
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    lastKnownTokenRef.current = null;
    lastKnownUserRef.current = null;
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    setMustChangePassword(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, mustChangePassword, login, completeFirstAccess, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
