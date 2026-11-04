import type { Invoice } from "../../types/invoices";

export type RowSituation = "open" | "overdue" | "paid" | "cancelled";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = () => ymd(new Date());

/** Dias entre duas datas "YYYY-MM-DD" (b - a), sem efeito de fuso. */
const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
};

/** "Vencida" vem da data (a API não grava o status overdue). */
export function rowSituation(invoice: Invoice, today = todayISO()): RowSituation {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "cancelled") return "cancelled";
  return invoice.due_date && invoice.due_date.slice(0, 10) < today ? "overdue" : "open";
}

export const SITUATION_LABEL: Record<RowSituation, string> = {
  open: "Em aberto",
  overdue: "Vencida",
  paid: "Paga",
  cancelled: "Cancelada",
};

export const SITUATION_TONE = {
  open: "neutral",
  overdue: "danger",
  paid: "success",
  cancelled: "neutral",
} as const;

const fmtShortDate = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Linha de apoio do vencimento: "em 7 dias", "vence hoje", "14 dias em atraso", "pago em 03/10/2026". */
export function dueHint(invoice: Invoice, today = todayISO()): { text: string; late: boolean } | null {
  const situation = rowSituation(invoice, today);
  if (situation === "paid") return invoice.paid_at ? { text: `pago em ${fmtShortDate(invoice.paid_at)}`, late: false } : null;
  if (situation === "cancelled" || !invoice.due_date) return null;
  const diff = daysBetween(today, invoice.due_date.slice(0, 10));
  if (diff === 0) return { text: "vence hoje", late: false };
  if (diff > 0) return { text: diff === 1 ? "amanhã" : `em ${diff} dias`, late: false };
  const late = -diff;
  return { text: late === 1 ? "1 dia em atraso" : `${late} dias em atraso`, late: true };
}

/** De onde a cobrança veio: emitida na Cora, gerada pela matrícula ou lançada à mão. */
export function invoiceOrigin(invoice: Invoice): string {
  if (invoice.cora?.charge_id) return "Cora";
  if (invoice.enrollment_id) return "Matrícula";
  return "Manual";
}
