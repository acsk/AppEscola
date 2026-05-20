import api from "../services/api";

/**
 * Resolve URL absoluta do logo do provedor (URL completa, path relativo ou //).
 */
export function resolvePaymentProviderLogoUrl(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  if (/^(data:|blob:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}${trimmed}`;
    }
    return `https:${trimmed}`;
  }

  const apiBase = String(api.defaults.baseURL ?? "").replace(/\/api\/?$/, "");
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
}
