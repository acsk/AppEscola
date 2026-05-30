import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mobileThemeQueryKey } from './TenantThemeContext';
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
  'Para sua segurança, encerramos sua sessão. Entre novamente com seu login e senha para continuar usando o app.';
const FORCE_RELOGIN_MESSAGE =
  'Por segurança, sua sessão foi encerrada no servidor. Entre novamente para continuar.';
const FORBIDDEN_SESSION_MESSAGE =
  'Não foi possível manter sua sessão ativa. Entre novamente para continuar.';
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
  const queryClient = useQueryClient();
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
    (reason: SessionLostReason, message?: string) => {
      logAuthDebug('handleSessionLost acionado', { reason, message });

      if (message) {
        setSessionLostMessage(message);
      } else if (reason === 'force_relogin') {
        setSessionLostMessage(FORCE_RELOGIN_MESSAGE);
      } else if (reason === 'forbidden') {
        setSessionLostMessage(FORBIDDEN_SESSION_MESSAGE);
      } else {
        setSessionLostMessage(DEFAULT_SESSION_LOST_MESSAGE);
      }

      setSessionExpired(true);
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

  const signIn = useCallback(
    async (login: string, password: string) => {
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

      if (response.user.role === 'aluno') {
        void queryClient.invalidateQueries({ queryKey: mobileThemeQueryKey });
      }
    },
    [enforceForceReloginFromMeta, queryClient],
  );

  const signOut = useCallback(async () => {
    logAuthDebug('Logout iniciado');
    try {
      await logoutApi();
    } catch {
      // Ignora erros de rede no logout; limpeza local sempre ocorre
    } finally {
      queryClient.removeQueries({ queryKey: mobileThemeQueryKey });
      await clearSession();
      setSessionExpired(false);
      resetUnauthorizedNotice();
      logAuthDebug('Logout finalizado');
    }
  }, [clearSession, queryClient]);

  const clearPasswordChangeFlag = useCallback(() => {
    setRequirePasswordChange(false);
  }, []);

  const refreshUserProfile = useCallback(async () => {
    const me = await getMeApi();
    await Promise.all([
      storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me)),
      storage.setItem(STORAGE_KEYS.ROLE, me.role),
    ]);
    setUser(me);
  }, []);

  const authContextValue = useMemo(
    () => ({
      user,
      isLoading,
      requirePasswordChange,
      signIn,
      signOut,
      clearPasswordChangeFlag,
      refreshUserProfile,
    }),
    [
      user,
      isLoading,
      requirePasswordChange,
      signIn,
      signOut,
      clearPasswordChangeFlag,
      refreshUserProfile,
    ],
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}

      <Modal
        visible={sessionExpired}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={modalStyles.backdrop} accessibilityViewIsModal>
          <View style={modalStyles.card}>
            <View style={modalStyles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={32} color="#DC2626" />
            </View>
            <Text style={modalStyles.title}>Hora de entrar de novo</Text>
            <Text style={modalStyles.message}>
              {sessionLostMessage}
            </Text>
            <Text style={modalStyles.hint}>
              Use o mesmo login de sempre. Seus dados continuam salvos com segurança.
            </Text>
            <View style={modalStyles.sessionActions}>
              <TouchableOpacity
                style={modalStyles.sessionButton}
                onPress={() => {
                  setSessionExpired(false);
                  setSessionLostMessage(DEFAULT_SESSION_LOST_MESSAGE);
                  resetUnauthorizedNotice();
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Entrar com minha conta"
              >
                <Text style={modalStyles.sessionButtonText}>Entrar com minha conta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={updateAvailable.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setUpdateAvailable({ visible: false, latest: '' })}
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
            <View style={modalStyles.actionsRow}>
              <TouchableOpacity
                style={[modalStyles.button, modalStyles.buttonSecondary]}
                onPress={() => setUpdateAvailable({ visible: false, latest: '' })}
                activeOpacity={0.85}
              >
                <Text style={modalStyles.buttonSecondaryText}>Depois</Text>
              </TouchableOpacity>

              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  style={[modalStyles.button, modalStyles.buttonPrimary]}
                  onPress={() => {
                    if (typeof window !== 'undefined') {
                      window.location.reload();
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={modalStyles.buttonText}>Recarregar agora</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
    ...(Platform.OS === 'web' ? { zIndex: 99999 } : null),
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 8,
        }
      : null),
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
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    opacity: 0.9,
  },
  sessionActions: {
    width: '100%',
    alignSelf: 'stretch',
  },
  sessionButton: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  actionsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.soft,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: colors.text,
    fontSize: 16,
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
