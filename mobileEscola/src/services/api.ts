import axios from 'axios';
import { storage, STORAGE_KEYS, clearAuthStorage } from './storage';

export { STORAGE_KEYS };

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const productionBaseUrl = process.env.EXPO_PUBLIC_API_URL_PROD?.trim();
const isWebProductionHost =
  typeof window !== 'undefined' &&
  Boolean(window.location?.hostname) &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1';

// Se o app web estiver em domínio real, não permite loopback como base da API.
const BASE_URL =
  isWebProductionHost && configuredBaseUrl && /localhost|127\.0\.0\.1/.test(configuredBaseUrl)
    ? productionBaseUrl ?? configuredBaseUrl
    : configuredBaseUrl ?? productionBaseUrl ?? 'https://api.appcurso.com.br';

export { BASE_URL };

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

// ── Request: injeta Bearer token em todas as chamadas ──────────────────────
api.interceptors.request.use(async (config) => {
  const token = await storage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Para FormData, o cliente HTTP deve definir automaticamente o boundary.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});

// ── Response: 401 global → limpa sessão e sinaliza expiração ──────────────
// O callback de logout é registrado pelo AuthContext para evitar
// dependência circular entre api.ts e o contexto React.
export type SessionLostReason = 'unauthorized' | 'forbidden' | 'force_relogin';
type LogoutCallback = (reason: SessionLostReason, message?: string) => void;
let _onUnauthorized: LogoutCallback | null = null;
let _notified = false;
let _pendingSessionLostReason: SessionLostReason | null = null;
let _pendingSessionLostMessage: string | null = null;

const AUTH_DEBUG_PREFIX = '[AuthDebug]';

function logAuthDebug(message: string, extra?: unknown) {
  if (!__DEV__) return;
  if (typeof extra === 'undefined') {
    console.log(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.log(`${AUTH_DEBUG_PREFIX} ${message}`, extra);
}

function isForceReloginEnabled(headers: any): boolean {
  const raw =
    headers?.['x-force-relogin'] ??
    headers?.['X-Force-Relogin'] ??
    headers?.get?.('x-force-relogin') ??
    headers?.get?.('X-Force-Relogin');

  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();

  const enabled = normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';

  if (__DEV__ && enabled) {
    logAuthDebug('Header x-force-relogin ativo', { raw, normalized });
  }

  return enabled;
}

function extractSessionMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : undefined;
}

async function notifySessionLost(reason: SessionLostReason, message?: string) {
  if (_notified) {
    logAuthDebug('notifySessionLost ignorado (ja notificado)', { reason });
    return;
  }

  _notified = true;
  logAuthDebug('Limpando storage de auth por perda de sessao', { reason, message });
  await clearAuthStorage();

  if (_onUnauthorized) {
    logAuthDebug('Disparando callback de sessao perdida', { reason });
    _onUnauthorized(reason, message);
    return;
  }

  // Se o handler ainda nao foi registrado, preserva o motivo e executa no registro.
  _pendingSessionLostReason = reason;
  _pendingSessionLostMessage = message ?? null;
  logAuthDebug('Handler de auth indisponivel, sessao pendente registrada', { reason });
}

export function registerUnauthorizedHandler(cb: LogoutCallback) {
  _onUnauthorized = cb;
  logAuthDebug('Handler de auth registrado');

  if (_pendingSessionLostReason) {
    const reason = _pendingSessionLostReason;
    const message = _pendingSessionLostMessage ?? undefined;
    _pendingSessionLostReason = null;
    _pendingSessionLostMessage = null;
    logAuthDebug('Executando sessao pendente apos registro do handler', { reason });
    _onUnauthorized(reason, message);
  }
}

export function resetUnauthorizedNotice() {
  _notified = false;
  _pendingSessionLostReason = null;
  _pendingSessionLostMessage = null;
  logAuthDebug('Reset de notificacao de sessao');
}

api.interceptors.response.use(
  (response) => {
    if (isForceReloginEnabled(response.headers)) {
      logAuthDebug('Force relogin detectado em resposta de sucesso');
      void notifySessionLost(
        'force_relogin',
        'Por segurança, sua sessão foi encerrada. Entre novamente para continuar usando o app.',
      );
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';

    logAuthDebug('Erro de resposta recebido', {
      url,
      status,
      hasResponse: Boolean(error.response),
    });

    // Ignora a própria rota de login: 401 ali significa credenciais erradas, não sessão expirada
    const isLoginCall = /\/login(\b|\/)/.test(url);

    if (isForceReloginEnabled(error.response?.headers)) {
      logAuthDebug('Force relogin detectado em resposta de erro', { url, status });
      await notifySessionLost(
        'force_relogin',
        extractSessionMessage(error.response?.data) ??
          'Por segurança, sua sessão foi encerrada. Entre novamente para continuar usando o app.',
      );
      return Promise.reject(error);
    }

    if (!isLoginCall && (status === 401 || status === 419)) {
      const apiMessage = extractSessionMessage(error.response?.data);
      const code =
        error.response?.data && typeof error.response.data === 'object'
          ? (error.response.data as { code?: unknown }).code
          : undefined;

      logAuthDebug('Sessao expirada por status HTTP', { status, url, code });

      const fallbackMessage =
        code === 'session_expired'
          ? 'Sua sessão expirou por segurança. Entre novamente com seu login e senha para continuar.'
          : code === 'session_invalid'
            ? 'Não foi possível validar seu acesso. Faça login novamente para continuar.'
            : 'Para sua segurança, encerramos sua sessão. Entre novamente para continuar usando o app.';

      await notifySessionLost(
        status === 401 ? 'unauthorized' : 'forbidden',
        apiMessage ?? fallbackMessage,
      );
    }
    return Promise.reject(error);
  }
);
