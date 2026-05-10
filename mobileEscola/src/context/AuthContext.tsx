import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage, STORAGE_KEYS } from '../services/storage';
import {
  registerUnauthorizedHandler,
  resetUnauthorizedNotice,
  SessionLostReason,
} from '../services/api';
import {
  loginApi,
  logoutApi,
  getMeApi,
  AuthUser,
} from '../services/auth.service';
import { colors } from '../theme';

interface AuthContextData {
  user: AuthUser | null;
  isLoading: boolean;
  requirePasswordChange: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearPasswordChangeFlag: () => void;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                           = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading]                 = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [sessionExpired, setSessionExpired]       = useState(false);

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

  // ── Disparado pelo interceptor 401/419: mostra modal e limpa sessão ───
  const handleSessionLost = useCallback(
    (_reason: SessionLostReason) => {
      // Só exibe se havia sessão ativa (evita modal em telas públicas)
      setSessionExpired((prev) => prev || true);
      void clearSession();
    },
    [clearSession],
  );

  // ── Registra handler global de 401 ────────────────────────────────────
  useEffect(() => {
    registerUnauthorizedHandler(handleSessionLost);
  }, [handleSessionLost]);

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
    setSessionExpired(false);
    resetUnauthorizedNotice();
  }

  // ── Logout ─────────────────────────────────────────────────────────────
  async function signOut() {
    try {
      await logoutApi();
    } catch {
      // Ignora erros de rede no logout; limpeza local sempre ocorre
    } finally {
      await clearSession();
      setSessionExpired(false);
      resetUnauthorizedNotice();
    }
  }

  function clearPasswordChangeFlag() {
    setRequirePasswordChange(false);
  }

  async function refreshUserProfile() {
    const me = await getMeApi();
    await Promise.all([
      storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me)),
      storage.setItem(STORAGE_KEYS.ROLE, me.role),
    ]);
    setUser(me);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        requirePasswordChange,
        signIn,
        signOut,
        clearPasswordChangeFlag,
        refreshUserProfile,
      }}
    >
      {children}

      <Modal
        visible={sessionExpired}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.card}>
            <View style={modalStyles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={32} color="#DC2626" />
            </View>
            <Text style={modalStyles.title}>Sessão expirada</Text>
            <Text style={modalStyles.message}>
              Sua conexão com o servidor foi perdida ou seu login expirou.
              Faça login novamente para continuar usando o app.
            </Text>
            <TouchableOpacity
              style={modalStyles.button}
              onPress={() => {
                setSessionExpired(false);
                resetUnauthorizedNotice();
              }}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.buttonText}>Ir para o login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AuthContext.Provider>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
