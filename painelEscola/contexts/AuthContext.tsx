import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: string;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        setUser(JSON.parse(storedUser));
        api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
      } catch {}
    }
    setIsLoading(false);

    const handleExpiry = () => {
      setUser(null);
      delete api.defaults.headers.common["Authorization"];
    };
    if (typeof window !== "undefined") {
      window.addEventListener("auth:expired", handleExpiry);
      return () => window.removeEventListener("auth:expired", handleExpiry);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/login", { login: email, password });
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post("/logout");
    } catch {}
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
