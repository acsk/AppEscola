/**
 * Helpers compartilhados para assets de cobrança Cora (boleto vs QR PIX).
 */

/** Imagem de QR PIX (cobranca-qrcode-*.png) — não é PDF de boleto. */
export function isPixQrImageUrl(url?: string | null): boolean {
  const value = String(url ?? "").trim().toLowerCase();
  if (!value) return false;

  if (value.includes("cobranca-qrcode")) return true;

  const path = value.split("?")[0] ?? value;
  const isImage =
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".webp");

  if (!isImage) return false;

  return value.includes("qrcode") || value.includes("qr-code") || value.includes("qr_code");
}

/** PDF híbrido Cora (boleto com QR embutido): boleto-qrcode-*.pdf */
export function isHybridBoletoUrl(url?: string | null): boolean {
  const value = String(url ?? "").trim().toLowerCase();
  if (!value || isPixQrImageUrl(value)) return false;
  return value.includes("boleto-qrcode");
}

export function isBoletoDocumentUrl(url?: string | null): boolean {
  const value = String(url ?? "").trim();
  if (!value || isPixQrImageUrl(value)) return false;

  const lower = value.toLowerCase();
  const path = (lower.split("?")[0] ?? lower);

  return (
    path.endsWith(".pdf") ||
    lower.includes(".pdf") ||
    path.includes("boleto-") ||
    lower.includes("boleto-qrcode") ||
    lower.includes("/boleto") ||
    lower.includes("/bank_slip")
  );
}

export function resolveBoletoPaymentUrl(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (!value || isPixQrImageUrl(value)) continue;
    if (isBoletoDocumentUrl(value)) return value;
  }
  return null;
}

