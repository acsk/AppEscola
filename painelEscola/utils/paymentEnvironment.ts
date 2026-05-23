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
  cora_payload?: {
    integration?: {
      environment?: string;
    };
  } | null;
};

/** Usa o ambiente em que a cobrança foi emitida; senão o padrão do painel. */
export function resolveInvoiceGatewayEnvironment(
  invoice?: InvoicePayloadRef | null
): "stage" | "prod" {
  const stored = invoice?.cora_payload?.integration?.environment;
  if (stored === "prod" || stored === "production") {
    return "prod";
  }
  if (stored === "stage") {
    return "stage";
  }

  return defaultPaymentEnvironment();
}
