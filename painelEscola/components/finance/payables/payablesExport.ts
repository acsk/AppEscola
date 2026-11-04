import { brl, exportFinancePdf, exportFinanceXlsx, isoDate, num } from "../../../utils/financeExports";
import type { Expense } from "../../../services/payables";
import { EXPENSE_PAYMENT_METHOD_LABEL, EXPENSE_SITUATION_LABEL } from "./payablesLabels";

const paidDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Lista de despesas em PDF ou Excel. `scope` descreve o recorte (filtros ou "selecionadas"). */
export async function exportExpenses(items: Expense[], format: "pdf" | "xlsx", scope: string) {
  const fileName = `contas-a-pagar-${new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })}`;
  const total = items.reduce((sum, e) => sum + Number(e.amount), 0);

  if (format === "xlsx") {
    exportFinanceXlsx(fileName, [
      {
        name: "Despesas",
        rows: [
          ["Contas a pagar", scope],
          [],
          ["Código", "Descrição", "Fornecedor", "Categoria", "Centro de custo", "Vencimento", "Situação", "Recorrência", "Comprovante", "Pago em", "Forma de pagamento", "Valor (R$)"],
          ...items.map((e) => [
            e.code,
            e.description,
            e.supplier?.name ?? "",
            e.category?.name ?? "",
            e.cost_center?.name ?? "",
            isoDate(e.due_date),
            EXPENSE_SITUATION_LABEL[e.situation],
            e.recurrence === "monthly" ? "Mensal" : "Avulsa",
            e.attachments_count > 0 ? "Sim" : "Não",
            paidDate(e.paid_at),
            e.payment_method ? EXPENSE_PAYMENT_METHOD_LABEL[e.payment_method] ?? e.payment_method : "",
            num(e.amount),
          ]),
          ["Total", "", "", "", "", "", "", "", "", "", "", num(total)],
        ],
      },
    ]);
    return;
  }

  await exportFinancePdf({
    fileName,
    overline: "Relatório financeiro",
    title: "Contas a pagar",
    description: scope,
    landscape: true,
    facts: [
      { label: "Despesas", value: String(items.length) },
      { label: "Total", value: brl(total) },
    ],
    sections: [
      {
        title: "Despesas",
        head: ["Código", "Descrição", "Fornecedor", "Categoria / centro", "Vencimento", "Situação", "Pago em", "Valor"],
        body: items.map((e) => [
          e.code,
          e.description,
          e.supplier?.name ?? "—",
          [e.category?.name, e.cost_center?.name].filter(Boolean).join(" / ") || "—",
          isoDate(e.due_date),
          EXPENSE_SITUATION_LABEL[e.situation],
          paidDate(e.paid_at) || "—",
          brl(e.amount),
        ]),
        foot: ["Total", `${items.length} despesa(s)`, "", "", "", "", "", brl(total)],
        numeric: [7],
        empty: "Nenhuma despesa no recorte.",
      },
    ],
  });
}
