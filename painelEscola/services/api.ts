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

// Injeta o token em toda requisição autenticada
api.interceptors.request.use((config) => {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("auth_token")
      : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
    if (error.response?.status === 401) {
      const message =
        error?.response?.data?.message ||
        "Sua sessão expirou. Faça login novamente.";
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
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
