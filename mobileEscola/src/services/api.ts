import axios from 'axios';
import { storage, STORAGE_KEYS } from './storage';

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
export type SessionLostReason = 'unauthorized' | 'forbidden';
type LogoutCallback = (reason: SessionLostReason) => void;
let _onUnauthorized: LogoutCallback | null = null;
let _notified = false;

export function registerUnauthorizedHandler(cb: LogoutCallback) {
  _onUnauthorized = cb;
}

export function resetUnauthorizedNotice() {
  _notified = false;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';

    // Ignora a própria rota de login: 401 ali significa credenciais erradas, não sessão expirada
    const isLoginCall = /\/login(\b|\/)/.test(url);

    if (!isLoginCall && (status === 401 || status === 419) && _onUnauthorized && !_notified) {
      _notified = true;
      _onUnauthorized(status === 401 ? 'unauthorized' : 'forbidden');
    }
    return Promise.reject(error);
  }
);
