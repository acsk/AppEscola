/** "1234.5" | 1234.5 → "R$ 1.234,50"; nulo vira "—". */
export const fmtMoney = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const toNumber = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isNaN(n) ? 0 : n;
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_slip: "Boleto",
  transfer: "Transferência",
  hybrid: "Híbrido",
  unknown: "Não informado",
};
