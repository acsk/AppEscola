import type { jsPDF } from "jspdf";
import api from "../services/api";
import { getApiResponseBody } from "./apiErrors";

export type TenantLetterhead = {
  /** Razão social (preferencial) ou nome fantasia */
  corporateName: string;
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
  address?: string | {
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
  const corporateName = String(
    tenant.corporate_name || tenant.name || tenant.trade_name || "Escola"
  ).trim();

  return {
    corporateName: corporateName || "Escola",
    tradeName: tenant.trade_name ? String(tenant.trade_name) : null,
    cnpj: tenant.cnpj ? String(tenant.cnpj) : null,
    email: tenant.email ? String(tenant.email) : null,
    phone: tenant.phone
      ? String(tenant.phone)
      : tenant.whatsapp
        ? String(tenant.whatsapp)
        : null,
    address: formatTenantAddress(tenant.address),
    logoUrl: tenant.photo_url ? String(tenant.photo_url) : null,
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
  const cacheKey = `pdf_tenant_letterhead_${tenantId}`;
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
    const body =
      getApiResponseBody<AuthTenantPayload>(data) ??
      (data as { data?: AuthTenantPayload })?.data ??
      (data as AuthTenantPayload);
    if (!body || typeof body !== "object" || (!("name" in body) && !("corporate_name" in body))) {
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

/** Resolve timbrado: tenant do usuário ou tenant selecionado (super_admin). */
export async function resolveTenantLetterhead(): Promise<TenantLetterhead | null> {
  const fromAuth = readTenantLetterheadFromStorage();
  if (fromAuth) return fromAuth;

  const tenantId = resolveSelectedTenantId();
  if (tenantId == null) return null;

  return fetchTenantLetterhead(tenantId);
}

export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const token =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("auth_token")
        : null;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-cache",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Falha ao converter imagem."));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildTenantLine(letterhead: TenantLetterhead): string {
  const parts = [
    letterhead.cnpj ? `CNPJ ${letterhead.cnpj}` : null,
    letterhead.phone,
    letterhead.email,
    letterhead.address,
  ].filter(Boolean);
  return parts.join(" • ");
}

/**
 * Desenha o timbrado do tenant (logo + razão social) e retorna o Y seguinte.
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

  let logoDataUrl: string | null = null;
  if (letterhead?.logoUrl?.trim()) {
    logoDataUrl = await imageUrlToDataUrl(letterhead.logoUrl.trim());
  }

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", marginLeft, cursorY - 2, 16, 16);
    } catch {
      try {
        doc.addImage(logoDataUrl, "JPEG", marginLeft, cursorY - 2, 16, 16);
      } catch {
        logoDataUrl = null;
      }
    }
  }

  const textStartX = logoDataUrl ? marginLeft + 20 : marginLeft;
  const displayName = letterhead?.corporateName ?? "Escola";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(displayName, textStartX, cursorY + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);

  let lineY = cursorY + 8;
  if (letterhead?.tradeName && letterhead.tradeName !== displayName) {
    doc.text(letterhead.tradeName, textStartX, lineY);
    lineY += 4;
  }

  const tenantLine = letterhead ? buildTenantLine(letterhead) : "";
  if (tenantLine) {
    const maxWidth = pageWidth - textStartX - marginRight;
    const wrapped = doc.splitTextToSize(tenantLine, maxWidth);
    doc.text(wrapped, textStartX, lineY);
    lineY += wrapped.length * 3.6;
  }

  if (showGeneratedAt) {
    doc.text(`Gerado em: ${generatedAt}`, textStartX, lineY);
    lineY += 4;
  }

  const dividerY = Math.max(lineY + 1, logoDataUrl ? cursorY + 16 : lineY + 1);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, dividerY, pageWidth - marginRight, dividerY);

  return dividerY + 6;
}
