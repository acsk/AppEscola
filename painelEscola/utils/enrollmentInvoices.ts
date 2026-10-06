import type { InvoiceListItem } from "../types/matriculas";
import type { Tone } from "../constants/theme";

/** Situação exibida da cobrança: "pending" com vencimento passado conta como vencida. */
export type InvoiceDisplayStatus = "pending" | "paid" | "overdue" | "cancelled" | "other";

export type InvoiceFilter = "todas" | "pendentes" | "pagas" | "vencidas";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function invoiceDisplayStatus(invoice: Pick<InvoiceListItem, "status" | "due_date">, today = todayIso()): InvoiceDisplayStatus {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "cancelled") return "cancelled";
  if (invoice.status === "overdue") return "overdue";
  if (invoice.status === "pending") return invoice.due_date && invoice.due_date < today ? "overdue" : "pending";
  return "other";
}

export const INVOICE_DISPLAY: Record<InvoiceDisplayStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warning" },
  paid: { label: "Paga", tone: "success" },
  overdue: { label: "Vencida", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  other: { label: "—", tone: "neutral" },
};

const FILTER_STATUS: Record<Exclude<InvoiceFilter, "todas">, InvoiceDisplayStatus> = {
  pendentes: "pending",
  pagas: "paid",
  vencidas: "overdue",
};

export function filterInvoices<T extends Pick<InvoiceListItem, "status" | "due_date">>(invoices: T[], filter: InvoiceFilter, today = todayIso()): T[] {
  if (filter === "todas") return invoices;
  return invoices.filter((i) => invoiceDisplayStatus(i, today) === FILTER_STATUS[filter]);
}

export function countByFilter(invoices: Pick<InvoiceListItem, "status" | "due_date">[], today = todayIso()): Record<InvoiceFilter, number> {
  return {
    todas: invoices.length,
    pendentes: filterInvoices(invoices, "pendentes", today).length,
    pagas: filterInvoices(invoices, "pagas", today).length,
    vencidas: filterInvoices(invoices, "vencidas", today).length,
  };
}

/** Totais da faixa de resumo (canceladas ficam fora do total do contrato). */
export function summarizeInvoices(invoices: Pick<InvoiceListItem, "status" | "due_date" | "amount">[], today = todayIso()) {
  const sum = (status: InvoiceDisplayStatus) =>
    invoices.filter((i) => invoiceDisplayStatus(i, today) === status).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
  const open = sum("pending");
  const paid = sum("paid");
  const overdue = sum("overdue");
  const total = invoices
    .filter((i) => invoiceDisplayStatus(i, today) !== "cancelled")
    .reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
  return { open, paid, overdue, total };
}

/** Próximo vencimento em aberto (hoje ou depois). */
export function nextDueDate(invoices: Pick<InvoiceListItem, "status" | "due_date">[], today = todayIso()): string | null {
  const upcoming = invoices
    .filter((i) => invoiceDisplayStatus(i, today) === "pending" && i.due_date >= today)
    .map((i) => i.due_date)
    .sort();
  return upcoming[0] ?? null;
}

/** Meses cobertos pela vigência (inclusivo, por mês do calendário). */
export function monthsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return null;
  const months = (ey - sy) * 12 + (em - sm) + 1;
  return months > 0 ? months : null;
}
