import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage, STORAGE_KEYS, clearAuthStorage } from '../services/storage';
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
import {
  fetchMobileVersion,
  compareBuildVersions,
  fetchMetaInfo,
} from '../services/version.service';
import { colors } from '../theme';
import buildInfo from '../../buildInfo.json';

const CURRENT_BUILD_VERSION = String((buildInfo as any)?.version ?? '-');
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const DEFAULT_SESSION_LOST_MESSAGE =
  'Sua conexão com o servidor foi perdida ou seu login expirou. Faça login novamente para continuar usando o app.';
const AUTH_DEBUG_PREFIX = '[AuthDebug]';

function logAuthDebug(message: string, extra?: unknown) {
  if (!__DEV__) return;
  if (typeof extra === 'undefined') {
    console.log(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.log(`${AUTH_DEBUG_PREFIX} ${message}`, extra);
}

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
  const [sessionLostMessage, setSessionLostMessage] = useState(DEFAULT_SESSION_LOST_MESSAGE);
  const [updateAvailable, setUpdateAvailable]     = useState<{
    visible: boolean;
    latest: string;
  }>({ visible: false, latest: '' });

  // ── Limpeza interna de sessão (sem chamar a API) ───────────────────────
  const clearSession = useCallback(async () => {
    logAuthDebug('clearSession iniciado');
    await clearAuthStorage();
    setUser(null);
    setRequirePasswordChange(false);
    logAuthDebug('clearSession finalizado');
  }, []);

  // ── Disparado pelo interceptor 401/419/force_relogin ──────────────────
  const handleSessionLost = useCallback(
    (reason: SessionLostReason) => {
      logAuthDebug('handleSessionLost acionado', { reason });

      if (reason === 'force_relogin') {
        setSessionLostMessage(
          'Sua sessão foi encerrada pelo servidor. Faça login novamente para continuar.',
        );
      } else {
        setSessionLostMessage(DEFAULT_SESSION_LOST_MESSAGE);
      }

      // Só exibe se havia sessão ativa (evita modal em telas públicas)
      setSessionExpired((prev) => prev || true);
      void clearSession();
    },
    [clearSession],
  );

  const enforceForceReloginFromMeta = useCallback(
    async (source: string): Promise<boolean> => {
      try {
        const meta = await fetchMetaInfo();
        logAuthDebug('Meta consultado para force relogin', {
          source,
          forceRelogin: meta.forceRelogin,
        });

        if (!meta.forceRelogin) return false;

        handleSessionLost('force_relogin');
        return true;
      } catch (err: any) {
        logAuthDebug('Falha ao consultar /api/meta para force relogin', {
          source,
          message: err?.message,
        });
        return false;
      }
    },
    [handleSessionLost],
  );

  // ── Registra handler global de 401 ────────────────────────────────────
  useEffect(() => {
    logAuthDebug('Registrando unauthorized handler no AuthContext');
    registerUnauthorizedHandler(handleSessionLost);
  }, [handleSessionLost]);

  // ── Checagem periódica de nova versão do app ─────────────────────────
  useEffect(() => {
    let active = true;

    const checkVersion = async () => {
      const forceRelogin = await enforceForceReloginFromMeta('version-check');
      if (forceRelogin || !active) return;

      const remote = await fetchMobileVersion();
      if (!active || !remote?.version) return;
      if (compareBuildVersions(remote.version, CURRENT_BUILD_VERSION) > 0) {
        setUpdateAvailable({ visible: true, latest: remote.version });
      }
    };

    checkVersion();
    const intervalId = setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [enforceForceReloginFromMeta]);

  // ── Valida token salvo ao iniciar o app ───────────────────────────────
  useEffect(() => {
    async function validateStoredToken() {
      try {
        const token = await storage.getItem(STORAGE_KEYS.TOKEN);
        logAuthDebug('validateStoredToken executado', { hasToken: Boolean(token) });
        if (!token) {
          setIsLoading(false);
          return;
        }

        const forceRelogin = await enforceForceReloginFromMeta('bootstrap');
        if (forceRelogin) {
          setIsLoading(false);
          return;
        }

        try {
          // Valida o token junto ao servidor
          const me = await getMeApi();
          logAuthDebug('Token validado com sucesso em /api/me', { userId: me.id, role: me.role });
          setUser(me);
          // Atualiza dados locais com a resposta mais recente
          await storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me));
          await storage.setItem(STORAGE_KEYS.ROLE, me.role);
        } catch (err: any) {
          logAuthDebug('Falha ao validar token em /api/me, limpando sessao', {
            status: err?.response?.status,
            message: err?.message,
          });
          // Se existe token persistido e não foi possível validá-lo,
          // força logout local para sempre retornar ao login.
          await clearSession();
        }
      } finally {
        setIsLoading(false);
      }
    }

    validateStoredToken();
  }, [clearSession, enforceForceReloginFromMeta]);

  // ── Login ──────────────────────────────────────────────────────────────
  async function signIn(login: string, password: string) {
    logAuthDebug('Tentativa de login iniciada', {
      loginType: login.includes('@') ? 'email' : 'matricula',
    });
    const response = await loginApi(login, password);

    await Promise.all([
      storage.setItem(STORAGE_KEYS.TOKEN, response.token),
      storage.setItem(STORAGE_KEYS.ROLE, response.user.role),
      storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user)),
    ]);

    const forceRelogin = await enforceForceReloginFromMeta('post-login');
    if (forceRelogin) {
      resetUnauthorizedNotice();
      return;
    }

    setRequirePasswordChange(response.password_change_required);
    setUser(response.user);
    setSessionExpired(false);
    resetUnauthorizedNotice();
    logAuthDebug('Login concluido', {
      userId: response.user.id,
      role: response.user.role,
      requirePasswordChange: response.password_change_required,
    });
  }

  // ── Logout ─────────────────────────────────────────────────────────────
  async function signOut() {
    logAuthDebug('Logout iniciado');
    try {
      await logoutApi();
    } catch {
      // Ignora erros de rede no logout; limpeza local sempre ocorre
    } finally {
      await clearSession();
      setSessionExpired(false);
      resetUnauthorizedNotice();
      logAuthDebug('Logout finalizado');
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
              {sessionLostMessage}
            </Text>
            <TouchableOpacity
              style={modalStyles.button}
              onPress={() => {
                setSessionExpired(false);
                setSessionLostMessage(DEFAULT_SESSION_LOST_MESSAGE);
                resetUnauthorizedNotice();
              }}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.buttonText}>Ir para o login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={updateAvailable.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.card}>
            <View style={[modalStyles.iconCircle, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="refresh-outline" size={32} color="#7C3AED" />
            </View>
            <Text style={modalStyles.title}>Atualização disponível</Text>
            <Text style={modalStyles.message}>
              Uma nova versão do app está disponível ({updateAvailable.latest}).
              {'\n'}Versão atual: {CURRENT_BUILD_VERSION}.
              {'\n\n'}
              {Platform.OS === 'web'
                ? 'Recarregue a página para atualizar.'
                : 'Atualize o app na loja para continuar com a versão mais recente.'}
            </Text>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={modalStyles.button}
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={modalStyles.buttonText}>Recarregar agora</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={modalStyles.button}
                onPress={() => setUpdateAvailable({ visible: false, latest: '' })}
                activeOpacity={0.85}
              >
                <Text style={modalStyles.buttonText}>Entendi</Text>
              </TouchableOpacity>
            )}
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
