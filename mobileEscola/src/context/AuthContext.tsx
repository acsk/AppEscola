import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { storage, STORAGE_KEYS } from '../services/storage';
import {
  registerUnauthorizedHandler,
} from '../services/api';
import {
  loginApi,
  logoutApi,
  getMeApi,
  AuthUser,
} from '../services/auth.service';

interface AuthContextData {
  user: AuthUser | null;
  isLoading: boolean;
  requirePasswordChange: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearPasswordChangeFlag: () => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                           = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading]                 = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);

  // ── Limpeza interna de sessão (sem chamar a API) ───────────────────────
  const clearSession = useCallback(async () => {
    await Promise.all([
      storage.removeItem(STORAGE_KEYS.TOKEN),
      storage.removeItem(STORAGE_KEYS.ROLE),
      storage.removeItem(STORAGE_KEYS.USER_DATA),
    ]);
    setUser(null);
    setRequirePasswordChange(false);
  }, []);

  // ── Registra handler global de 401 ────────────────────────────────────
  useEffect(() => {
    registerUnauthorizedHandler(clearSession);
  }, [clearSession]);

  // ── Valida token salvo ao iniciar o app ───────────────────────────────
  useEffect(() => {
    async function validateStoredToken() {
      try {
        const token = await storage.getItem(STORAGE_KEYS.TOKEN);
        if (!token) {
          setIsLoading(false);
          return;
        }

        try {
          // Valida o token junto ao servidor
          const me = await getMeApi();
          setUser(me);
          // Atualiza dados locais com a resposta mais recente
          await storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me));
          await storage.setItem(STORAGE_KEYS.ROLE, me.role);
        } catch (err: any) {
          const status = err?.response?.status;

          if (status === 401) {
            // Token inválido/expirado → força novo login
            await clearSession();
          } else {
            // Erro de rede ou servidor indisponível → restaura sessão local
            const cached = await storage.getItem(STORAGE_KEYS.USER_DATA);
            if (cached) {
              setUser(JSON.parse(cached));
            } else {
              await clearSession();
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    validateStoredToken();
  }, [clearSession]);

  // ── Login ──────────────────────────────────────────────────────────────
  async function signIn(login: string, password: string) {
    const response = await loginApi(login, password);

    await Promise.all([
      storage.setItem(STORAGE_KEYS.TOKEN, response.token),
      storage.setItem(STORAGE_KEYS.ROLE, response.user.role),
      storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user)),
    ]);

    setRequirePasswordChange(response.password_change_required);
    setUser(response.user);
  }

  // ── Logout ─────────────────────────────────────────────────────────────
  async function signOut() {
    try {
      await logoutApi();
    } catch {
      // Ignora erros de rede no logout; limpeza local sempre ocorre
    } finally {
      await clearSession();
    }
  }

  function clearPasswordChangeFlag() {
    setRequirePasswordChange(false);
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, requirePasswordChange, signIn, signOut, clearPasswordChangeFlag }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
