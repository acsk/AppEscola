import type { Tone } from "../../../constants/theme";
import type { Expense, ExpenseSituation } from "../../../services/payables";

export const EXPENSE_SITUATION_LABEL: Record<ExpenseSituation, string> = {
  draft: "Rascunho",
  pending_approval: "Em aprovação",
  approved: "Aprovada",
  overdue: "Vencida",
  awaiting_link: "Aguardando vínculo",
  paid: "Paga",
  cancelled: "Cancelada",
};

export const EXPENSE_SITUATION_TONE: Record<ExpenseSituation, Tone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "brand",
  overdue: "danger",
  awaiting_link: "warning",
  paid: "success",
  cancelled: "neutral",
};

export const EXPENSE_PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  transfer: "Transferência",
  bank_slip: "Boleto",
  auto_debit: "Débito automático",
  card: "Cartão",
  cash: "Dinheiro",
};

const HISTORY_LABEL: Record<string, string> = {
  created: "Cadastrada",
  updated: "Alterada",
  submitted: "Enviada para aprovação",
  approved: "Aprovada",
  paid: "Pagamento registrado",
  cancelled: "Cancelada",
  attachment_added: "Comprovante anexado",
  attachment_removed: "Comprovante removido",
};

export const expenseHistoryLabel = (action: string) => HISTORY_LABEL[action] ?? action;

export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Linha abaixo do vencimento, como no protótipo: "em 2 dias", "4 dias em atraso", "paga em 31/10 · conciliada". */
export function dueHint(expense: Expense): { text: string; late: boolean } | null {
  if (expense.status === "paid") {
    const paid = expense.paid_at
      ? new Date(expense.paid_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
      : null;
    return { text: `paga${paid ? ` em ${paid}` : ""}${expense.reconciled ? " · conciliada" : ""}`, late: false };
  }
  if (expense.status === "cancelled" || expense.days_to_due === null) return null;

  const days = expense.days_to_due;
  if (days === 0) return { text: "vence hoje", late: false };
  if (days > 0) return { text: `em ${days} dia${days === 1 ? "" : "s"}`, late: false };
  return { text: `${-days} dia${days === -1 ? "" : "s"} em atraso`, late: true };
}

/** Linha de identificação: código, recorrência e comprovante. */
export function expenseMeta(expense: Expense): string {
  const parts = [
    expense.code,
    expense.recurrence === "monthly" ? "mensal" : "avulsa",
    expense.system_managed ? "pelo extrato" : expense.attachments_count > 0 ? "com comprovante" : "sem comprovante",
  ];
  return parts.join(" · ");
}
