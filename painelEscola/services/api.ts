import axios from "axios";

const BASE_URL =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "https://api.appcurso.com.br/api"
    : "http://localhost:4000/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Accept: "application/json" },
});

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
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

// Redireciona para login em caso de 401
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
