import axios from "axios";

const BASE_URL =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "https://api.appcurso.com.br/api"
    : "http://localhost:4000/api";

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const isFormDataPayload = (value: unknown): value is FormData =>
  typeof FormData !== "undefined" && value instanceof FormData;

let lastNetworkIssueEventAt = 0;
const NETWORK_ISSUE_EVENT_DEBOUNCE_MS = 4000;

const dispatchNetworkIssue = (message: string) => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastNetworkIssueEventAt < NETWORK_ISSUE_EVENT_DEBOUNCE_MS) return;
  lastNetworkIssueEventAt = now;
  window.dispatchEvent(new CustomEvent("api:network-issue", { detail: { message } }));
};

const resolveSuperAdminTenantId = (): number | null => {
  if (typeof localStorage === "undefined") return null;

  const fromStorage = localStorage.getItem("selected_tenant_id");
  if (fromStorage) {
    const parsed = Number(fromStorage);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  const rawUser = localStorage.getItem("auth_user");
  if (!rawUser) return null;

  try {
    const user = JSON.parse(rawUser) as { role?: string; selected_tenant_id?: number | null };
    if (user?.role !== "super_admin") return null;
    const id = user.selected_tenant_id;
    return typeof id === "number" && id > 0 ? id : null;
  } catch {
    return null;
  }
};

// Injeta o token e tenant (super_admin) em toda requisição autenticada
api.interceptors.request.use((config) => {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("auth_token")
      : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const tenantId = resolveSuperAdminTenantId();
  if (tenantId != null) {
    config.params = { ...(config.params ?? {}), tenant_id: tenantId };
  }
  if (["post", "put", "patch"].includes(config.method ?? "")) {
    if (isFormDataPayload(config.data)) {
      delete config.headers["Content-Type"];
    } else {
      config.headers["Content-Type"] = "application/json";
    }
  }
  return config;
});

// Redireciona para login em caso de 401
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const requestUrl = String(error?.config?.url ?? "");
    const isLoginRequest = /\/login\/?$/i.test(requestUrl);
    const hasStoredToken =
      typeof localStorage !== "undefined" && !!localStorage.getItem("auth_token");

    if (error.response?.status === 401 && !isLoginRequest && hasStoredToken) {
      const message =
        error?.response?.data?.message ||
        "Sua sessão expirou. Faça login novamente.";
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        localStorage.removeItem("selected_tenant_id");
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:expired", { detail: { message } }));
      }
    } else if (!error.response) {
      const message =
        error?.message ||
        "Sem comunicação com o servidor no momento. Verifique sua conexão e tente novamente.";
      dispatchNetworkIssue(message);
    }
    return Promise.reject(error);
  }
);

export default api;
