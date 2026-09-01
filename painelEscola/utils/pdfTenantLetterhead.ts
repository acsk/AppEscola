import type { jsPDF } from "jspdf";
import api from "../services/api";
import { getApiResponseBody } from "./apiErrors";

function resolveAbsoluteAssetUrl(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  if (/^(data:|blob:|https?:\/\/)/i.test(trimmed)) return trimmed;

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

export type TenantLetterhead = {
  /** Nome de exibição (prioridade: nome fantasia) */
  displayName: string;
  /** Razão social (quando diferente do display) */
  corporateName: string | null;
  tradeName: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
};

type AuthTenantPayload = {
  name?: string;
  trade_name?: string;
  corporate_name?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?:
    | string
    | {
        zip_code?: string | null;
        street?: string | null;
        number?: string | null;
        complement?: string | null;
        neighborhood?: string | null;
        city?: string | null;
        state?: string | null;
      };
  photo_url?: string;
};

function formatTenantAddress(address: AuthTenantPayload["address"]): string | null {
  if (!address) return null;
  if (typeof address === "string") {
    const trimmed = address.trim();
    return trimmed || null;
  }

  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const cityState =
    address.city && address.state
      ? `${address.city}/${address.state}`
      : address.city || address.state || "";
  const parts = [
    line1 || null,
    address.neighborhood || null,
    cityState || null,
    address.zip_code ? `CEP ${address.zip_code}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : null;
}

function mapTenantToLetterhead(tenant: AuthTenantPayload): TenantLetterhead {
  const tradeName = tenant.trade_name ? String(tenant.trade_name).trim() : "";
  const corporateName = tenant.corporate_name
    ? String(tenant.corporate_name).trim()
    : "";
  const fallbackName = tenant.name ? String(tenant.name).trim() : "";

  // Prioridade: Nome Fantasia → name → Razão Social
  const displayName = tradeName || fallbackName || corporateName || "Escola";

  return {
    displayName,
    corporateName:
      corporateName && corporateName !== displayName ? corporateName : null,
    tradeName: tradeName || null,
    cnpj: tenant.cnpj ? String(tenant.cnpj) : null,
    email: tenant.email ? String(tenant.email) : null,
    phone: tenant.phone
      ? String(tenant.phone)
      : tenant.whatsapp
        ? String(tenant.whatsapp)
        : null,
    address: formatTenantAddress(tenant.address),
    logoUrl: resolveAbsoluteAssetUrl(tenant.photo_url),
  };
}

function resolveSelectedTenantId(): number | null {
  if (typeof localStorage === "undefined") return null;

  const fromStorage = localStorage.getItem("selected_tenant_id");
  if (fromStorage) {
    const parsed = Number(fromStorage);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return null;
    const user = JSON.parse(raw) as {
      role?: string;
      tenant_id?: number | null;
      selected_tenant_id?: number | null;
    };
    if (user.role === "super_admin") {
      const id = user.selected_tenant_id;
      return typeof id === "number" && id > 0 ? id : null;
    }
    return typeof user.tenant_id === "number" && user.tenant_id > 0
      ? user.tenant_id
      : null;
  } catch {
    return null;
  }
}

export function readTenantLetterheadFromStorage(): TenantLetterhead | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("auth_user");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { tenant?: AuthTenantPayload | null };
    if (!parsed?.tenant) return null;
    return mapTenantToLetterhead(parsed.tenant);
  } catch {
    return null;
  }
}

async function fetchTenantLetterhead(tenantId: number): Promise<TenantLetterhead | null> {
  const cacheKey = `pdf_tenant_letterhead_v3_${tenantId}`;
  if (typeof sessionStorage !== "undefined") {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TenantLetterhead;
      } catch {
        // segue para buscar na API
      }
    }
  }

  try {
    const { data } = await api.get(`/tenants/${tenantId}`);
    // Compatível com envelope {body}, Laravel {data} e payload cru
    const body =
      getApiResponseBody<AuthTenantPayload>(data) ??
      (data as { data?: AuthTenantPayload })?.data ??
      (data as { body?: AuthTenantPayload })?.body ??
      (data as AuthTenantPayload);
    if (
      !body ||
      typeof body !== "object" ||
      (!("name" in body) && !("corporate_name" in body) && !("trade_name" in body))
    ) {
      return null;
    }
    const letterhead = mapTenantToLetterhead(body);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(cacheKey, JSON.stringify(letterhead));
    }
    return letterhead;
  } catch {
    return null;
  }
}

/** Resolve timbrado: prioriza tenant selecionado (completo, com logo). */
export async function resolveTenantLetterhead(): Promise<TenantLetterhead | null> {
  const tenantId = resolveSelectedTenantId();
  if (tenantId != null) {
    const fetched = await fetchTenantLetterhead(tenantId);
    if (fetched) return fetched;
  }

  return readTenantLetterheadFromStorage();
}

async function blobToPngDataUrl(blob: Blob): Promise<string | null> {
  if (typeof document === "undefined") {
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao carregar imagem."));
      el.src = objectUrl;
    });

    const maxSide = 256;
    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  const absolute = resolveAbsoluteAssetUrl(url) ?? url.trim();
  if (!absolute) return null;

  // Preferência: proxy autenticado /api/media/storage/{path} (evita CORS do /storage).
  const storagePath = extractPublicStoragePath(absolute);
  if (storagePath) {
    try {
      const { data } = await api.get(`/media/storage/${storagePath}`, {
        responseType: "blob",
        headers: { Accept: "*/*" },
      });
      if (data instanceof Blob && data.size > 0) {
        const png = await blobToPngDataUrl(data);
        if (png) return png;
      }
    } catch {
      // tenta fetch direto abaixo
    }
  }

  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("auth_token")
      : null;

  const tryFetch = async (withAuth: boolean): Promise<Blob | null> => {
    try {
      const res = await fetch(absolute, {
        method: "GET",
        cache: "no-cache",
        mode: "cors",
        headers:
          withAuth && token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };

  try {
    const blob =
      (await tryFetch(false)) ?? (token ? await tryFetch(true) : null);
    if (!blob || blob.size <= 0) return null;
    return await blobToPngDataUrl(blob);
  } catch {
    return null;
  }
}

/** Extrai path relativo após `/storage/` para o proxy autenticado. */
function extractPublicStoragePath(url: string): string | null {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return null;

  try {
    const base = String(api.defaults.baseURL ?? "http://localhost");
    const parsed = new URL(trimmed, base);
    const marker = "/storage/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx >= 0) {
      const path = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
      return path.replace(/^\/+/, "") || null;
    }
  } catch {
    // segue regex
  }

  const match = trimmed.match(/\/storage\/(.+?)(?:\?|#|$)/i);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]).replace(/^\/+/, "") || null;
}

/**
 * Desenha o timbrado do tenant (logo + nome fantasia) e retorna o Y seguinte.
 */
export async function drawTenantPdfHeader(
  doc: jsPDF,
  options?: {
    marginLeft?: number;
    marginRight?: number;
    startY?: number;
    showGeneratedAt?: boolean;
  }
): Promise<number> {
  const marginLeft = options?.marginLeft ?? 14;
  const marginRight = options?.marginRight ?? 14;
  const showGeneratedAt = options?.showGeneratedAt ?? true;
  let cursorY = options?.startY ?? 12;

  const pageWidth = doc.internal.pageSize.getWidth();
  const letterhead = await resolveTenantLetterhead();
  const generatedAt = new Date().toLocaleString("pt-BR");

  const logoSize = 22;
  let logoDrawn = false;
  if (letterhead?.logoUrl?.trim()) {
    const logoDataUrl = await imageUrlToDataUrl(letterhead.logoUrl.trim());
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", marginLeft, cursorY, logoSize, logoSize);
        logoDrawn = true;
      } catch {
        logoDrawn = false;
      }
    }
  }

  const textStartX = logoDrawn ? marginLeft + logoSize + 5 : marginLeft;
  const textMaxWidth = pageWidth - textStartX - marginRight;
  const displayName = letterhead?.displayName ?? "Escola";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(displayName, textStartX, cursorY + 5);

  let lineY = cursorY + 10;

  if (letterhead?.corporateName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const corpLines = doc.splitTextToSize(letterhead.corporateName, textMaxWidth);
    doc.text(corpLines, textStartX, lineY);
    lineY += corpLines.length * 3.4 + 0.5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);

  const contactParts = [
    letterhead?.cnpj ? `CNPJ ${letterhead.cnpj}` : null,
    letterhead?.phone,
    letterhead?.email,
  ].filter(Boolean) as string[];

  if (contactParts.length) {
    const contactLine = contactParts.join("  ·  ");
    const wrapped = doc.splitTextToSize(contactLine, textMaxWidth);
    doc.text(wrapped, textStartX, lineY);
    lineY += wrapped.length * 3.2;
  }

  if (letterhead?.address) {
    const addrLines = doc.splitTextToSize(letterhead.address, textMaxWidth);
    doc.text(addrLines, textStartX, lineY);
    lineY += addrLines.length * 3.2;
  }

  if (showGeneratedAt) {
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Gerado em: ${generatedAt}`, textStartX, lineY);
    lineY += 3.2;
  }

  const contentBottom = Math.max(lineY, logoDrawn ? cursorY + logoSize : lineY);
  const dividerY = contentBottom + 3;

  // Separação reforçada do cabeçalho
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.7);
  doc.line(marginLeft, dividerY, pageWidth - marginRight, dividerY);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, dividerY + 1.2, pageWidth - marginRight, dividerY + 1.2);

  return dividerY + 5;
}
