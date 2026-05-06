import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: string;
  password_change_required?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeFirstAccess: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
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
      } catch {}
    }
    setIsLoading(false);

    const handleExpiry = () => {
      setUser(null);
      setMustChangePassword(false);
      delete api.defaults.headers.common["Authorization"];
    };
    if (typeof window !== "undefined") {
      window.addEventListener("auth:expired", handleExpiry);
      return () => window.removeEventListener("auth:expired", handleExpiry);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/login", { login: email, password });
    const authUser: AuthUser = data.user;
    const mustReset = !!(data.password_change_required || authUser?.password_change_required);

    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(authUser));
    api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
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
      localStorage.setItem("auth_user", JSON.stringify(updated));
      return updated;
    });
  };

  const logout = async () => {
    try {
      await api.post("/logout");
    } catch {}
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
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
