/** Ambiente Cora padrão conforme host do painel (produção → prod). */
export function defaultPaymentEnvironment(): "stage" | "prod" {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return "prod";
    }
  }

  return "stage";
}

type InvoicePayloadRef = {
  cora?: {
    environment?: string | null;
  } | null;
  cora_payload?: {
    integration?: {
      environment?: string;
    };
  } | null;
};

function normalizeGatewayEnvironment(value?: string | null): "stage" | "prod" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") return "prod";
  if (normalized === "stage") return "stage";
  return null;
}

/** Usa o ambiente em que a cobrança foi emitida; senão o padrão do painel. */
export function resolveInvoiceGatewayEnvironment(
  invoice?: InvoicePayloadRef | null
): "stage" | "prod" {
  const fromCora = normalizeGatewayEnvironment(invoice?.cora?.environment ?? null);
  if (fromCora) return fromCora;

  const fromPayload = normalizeGatewayEnvironment(
    invoice?.cora_payload?.integration?.environment ?? null
  );
  if (fromPayload) return fromPayload;

  return defaultPaymentEnvironment();
}
