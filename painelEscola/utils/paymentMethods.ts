/** Métodos aceitos em baixa manual (presencial / recepção). */
export const MANUAL_PAYMENT_METHOD_SLUGS = [
  "cash",
  "pix",
  "credit_card",
  "debit_card",
  "transfer",
] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_slip: "Boleto",
  boleto: "Boleto",
  bank_transfer: "Transferência",
  transfer: "Transferência",
  hybrid: "Boleto + PIX",
};

export function paymentMethodLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return PAYMENT_METHOD_LABELS[slug] ?? slug;
}

export function requiresCardPaymentReference(method: string): boolean {
  return method === "credit_card";
}

export function manualPaymentMethodOptions(
  domains: { slug: string; label: string }[]
): { value: string; label: string }[] {
  return [
    { value: "", label: "Selecione a forma de pagamento" },
    ...domains
      .filter((d) => MANUAL_PAYMENT_METHOD_SLUGS.includes(d.slug as (typeof MANUAL_PAYMENT_METHOD_SLUGS)[number]))
      .map((d) => ({
        value: d.slug,
        label: PAYMENT_METHOD_LABELS[d.slug] ?? d.label,
      })),
  ];
}
