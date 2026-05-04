import axios from 'axios';
import { storage, STORAGE_KEYS } from './storage';

export { STORAGE_KEYS };

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.suaescola.com.br';

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
  return config;
});

// ── Response: 401 global → limpa sessão e sinaliza expiração ──────────────
// O callback de logout é registrado pelo AuthContext para evitar
// dependência circular entre api.ts e o contexto React.
type LogoutCallback = () => void;
let _onUnauthorized: LogoutCallback | null = null;

export function registerUnauthorizedHandler(cb: LogoutCallback) {
  _onUnauthorized = cb;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && _onUnauthorized) {
      _onUnauthorized();
    }
    return Promise.reject(error);
  }
);
