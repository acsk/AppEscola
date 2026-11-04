import type { Tone } from "../../../constants/theme";
import type { BankEntry, ReconciliationOrigin, ReconciliationStatus, ReconciliationType } from "../../../services/bankReconciliation";

export const RECONCILIATION_STATUS_LABEL: Record<ReconciliationStatus, string> = {
  pending: "Pendente",
  reconciled: "Conciliada",
  divergent: "Divergente",
  ignored: "Ignorada",
};

export const RECONCILIATION_STATUS_TONE: Record<ReconciliationStatus, Tone> = {
  pending: "warning",
  reconciled: "success",
  divergent: "danger",
  ignored: "neutral",
};

export const RECONCILIATION_ORIGIN_OPTIONS: { value: ReconciliationOrigin | ""; label: string }[] = [
  { value: "app", label: "Cobranças da aplicação" },
  { value: "expense", label: "Despesas" },
  { value: "other", label: "Sem vínculo" },
  { value: "", label: "Todas" },
];

export const RECONCILIATION_TYPE_OPTIONS: { value: ReconciliationType | ""; label: string }[] = [
  { value: "", label: "Todos os tipos" },
  { value: "pix", label: "Pix" },
  { value: "payment", label: "Boleto / pagamento" },
  { value: "transfer", label: "Transferência" },
  { value: "fee", label: "Tarifa" },
  { value: "card", label: "Cartão" },
];

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  PIX: "Pix",
  TRANSFER: "Transferência",
  PAYMENT: "Pagamento",
  BANK_DOMICILE: "Domicílio bancário",
  FEE: "Tarifa",
  CARD: "Cartão",
  JUD_BLOCKER: "Bloqueio judicial",
  LIMIT_RESERVATION: "Reserva de limite",
};

/** A Cora pode criar tipos novos sem aviso: mostra o código cru em vez de esconder. */
export const transactionTypeLabel = (type: string | null) => (type ? TRANSACTION_TYPE_LABEL[type] ?? type : "—");

const HISTORY_ACTION_LABEL: Record<string, string> = {
  auto_reconciled: "Conciliada automaticamente",
  auto_divergent: "Divergência apontada pelo sistema",
  reconciled: "Conciliada manualmente",
  ignored: "Ignorada",
  divergent: "Marcada como divergente",
  undone: "Voltou para pendente",
};

export const historyActionLabel = (action: string) => HISTORY_ACTION_LABEL[action] ?? action;

/** Linha de explicação abaixo da situação, como no protótipo. */
export function entryDetail(entry: BankEntry): string {
  switch (entry.status) {
    case "reconciled": {
      const target = entry.expense
        ? `Despesa ${entry.expense.code}`
        : entry.invoice
          ? `Cobrança #${entry.invoice.id}`
          : "Cobrança";
      const who = entry.match_type === "auto" ? "automaticamente" : entry.reviewed_by ? `por ${entry.reviewed_by.name}` : "manualmente";
      return `${target} · ${who}${entry.divergence ? ` · ${entry.divergence}` : ""}`;
    }
    case "divergent":
      return entry.divergence ?? "Verifique a movimentação.";
    case "ignored":
      return entry.justification ?? "Ignorada.";
    default:
      if (entry.direction === "debit") return "Saída sem despesa vinculada: concilie com uma despesa aprovada.";
      return entry.cited_charge_ids.length > 0
        ? "Cita uma cobrança que não foi gerada pelo sistema."
        : "Não é pagamento de cobrança gerada pela aplicação.";
  }
}
