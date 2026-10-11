import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";
import {
  PDF_COLOR,
  PDF_MARGIN,
  PDF_TYPE,
  drawDocumentTitle,
  drawFactsStrip,
  drawPageFooters,
  pdfTableStyles,
  setText,
  type Rgb,
} from "./pdfTheme";
import { isoToDisplay } from "./masks";
import type { FinanceReport, FinanceReportItem } from "../services/financeReport";

/** Modelos de PDF do relatório financeiro (menu "Exportar PDF" e painel "Relatórios em PDF"). */
export type FinancePdfModel = "completo" | "resumo" | "lista" | "inadimplencia";

export const FINANCE_PDF_MODELS: { key: FinancePdfModel; title: string; description: string; pages: string }[] = [
  { key: "completo", title: "Relatório completo", description: "Resumo, recebimento, distribuição e todas as cobranças.", pages: "Várias págs." },
  { key: "resumo", title: "Resumo executivo", description: "Totais, recebimento e distribuição. Ideal para reunião.", pages: "1 pág." },
  { key: "lista", title: "Lista de cobranças", description: "Tabela das cobranças do recorte, com total no rodapé.", pages: "Conforme o recorte" },
  { key: "inadimplencia", title: "Inadimplência por aluno", description: "Pendentes e vencidas agrupadas por aluno.", pages: "Conforme o recorte" },
];

export type FinancePdfOptions = {
  model: FinancePdfModel;
  landscape: boolean;
  /** Descrição do recorte (período, curso, turma, filtros) abaixo do título. */
  showFilters: boolean;
  /** Completo/lista: cobranças agrupadas por turma, com subtotal. */
  groupByClass: boolean;
};

export type FinanceExportLabels = {
  /** "Cobranças com vencimento entre … · todos os cursos e turmas" */
  scope: string;
  status: (slug: string) => string;
  paymentMethod: (slug: string | null) => string;
  type: (slug: string | null) => string;
};

export const formatBrl = (value: string | number) =>
  (typeof value === "string" ? parseFloat(value) || 0 : value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatIsoDate = (iso: string | null) => (iso ? isoToDisplay(iso.slice(0, 10)) || iso.slice(0, 10) : "—");

const amountOf = (value: string | number | undefined) => (typeof value === "number" ? value : parseFloat(value ?? "0") || 0);

const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";

const statusColor = (status: string): Rgb =>
  status === "paid" ? PDF_COLOR.success : status === "overdue" ? PDF_COLOR.danger : status === "pending" ? PDF_COLOR.warning : PDF_COLOR.inkMuted;

type StatusTotals = Record<"paid" | "pending" | "overdue", { count: number; amount: number }>;

export function statusTotals(report: Pick<FinanceReport, "by_status">): StatusTotals {
  const get = (key: string) => report.by_status.find((row) => row.key === key);
  const pick = (key: string) => ({ count: get(key)?.count ?? 0, amount: amountOf(get(key)?.amount) });
  return { paid: pick("paid"), pending: pick("pending"), overdue: pick("overdue") };
}

/** Barra empilhada recebido / a receber / vencido (mesma leitura da tela). Devolve o Y seguinte. */
function drawReceiptBar(doc: jsPDF, y: number, totals: StatusTotals, total: number): number {
  const width = doc.internal.pageSize.getWidth() - PDF_MARGIN * 2;
  setText(doc, PDF_COLOR.ink, PDF_TYPE.label, "bold");
  doc.text("Recebimento do período", PDF_MARGIN, y);
  setText(doc, PDF_COLOR.ink, PDF_TYPE.label, "bold");
  doc.text(`${pct(totals.paid.amount, total)} recebido`, PDF_MARGIN + width, y, { align: "right" });
  let x = PDF_MARGIN;
  const barY = y + 2.5;
  ([
    [totals.paid.amount, PDF_COLOR.success],
    [totals.pending.amount, PDF_COLOR.warning],
    [totals.overdue.amount, PDF_COLOR.danger],
  ] as [number, Rgb][]).forEach(([amount, rgb]) => {
    const w = total > 0 ? (amount / total) * width : 0;
    if (w <= 0) return;
    doc.setFillColor(...rgb);
    doc.rect(x, barY, w, 3, "F");
    x += w;
  });
  if (total <= 0) {
    doc.setFillColor(...PDF_COLOR.sunken);
    doc.rect(PDF_MARGIN, barY, width, 3, "F");
  }
  setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
  doc.text(
    `Recebido ${formatBrl(totals.paid.amount)} · A receber ${formatBrl(totals.pending.amount)} · Vencido ${formatBrl(totals.overdue.amount)}`,
    PDF_MARGIN,
    barY + 7.5
  );
  return barY + 17;
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursor = y;
  if (cursor + 24 > pageHeight - 16) {
    doc.addPage();
    cursor = PDF_MARGIN + 4;
  }
  setText(doc, PDF_COLOR.ink, PDF_TYPE.subtitle, "bold");
  doc.text(title, PDF_MARGIN, cursor);
  return cursor + 2.5;
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function drawDistribution(doc: jsPDF, y: number, title: string, column: string, rows: { name: string; count: number; amount: number }[], total: number): number {
  let cursor = sectionTitle(doc, y, title);
  autoTable(doc, {
    ...pdfTableStyles(),
    startY: cursor,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
    head: [[column, "Cobranças", "Valor", "% do total"]],
    body: rows.length ? rows.map((row) => [row.name, String(row.count), formatBrl(row.amount), pct(row.amount, total)]) : [["Nenhum valor neste recorte.", "", "", ""]],
    columnStyles: { 1: { halign: "right", cellWidth: 24 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 24 } },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right";
    },
  });
  cursor = lastY(doc) + 7;
  return cursor;
}

function itemsTable(doc: jsPDF, y: number, items: FinanceReportItem[], labels: FinanceExportLabels, opts: { showClass: boolean; totalLabel: string }): number {
  const total = items.reduce((sum, item) => sum + amountOf(item.amount), 0);
  const head = ["Aluno", "Descrição", ...(opts.showClass ? ["Turma"] : []), "Vencimento", "Pagamento", "Situação", "Valor"];
  const valueIndex = head.length - 1;
  const statusIndex = head.length - 2;
  autoTable(doc, {
    ...pdfTableStyles({ fontSize: 8 }),
    startY: y,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
    head: [head],
    body: items.map((item) => [
      item.student_name ?? "—",
      item.description,
      ...(opts.showClass ? [item.school_class_name ?? "—"] : []),
      formatIsoDate(item.due_date),
      formatIsoDate(item.paid_at),
      labels.status(item.status),
      formatBrl(item.amount),
    ]),
    foot: [[{ content: `${opts.totalLabel} · ${items.length} ${items.length === 1 ? "cobrança" : "cobranças"}`, colSpan: valueIndex }, formatBrl(total)]],
    footStyles: { fillColor: PDF_COLOR.sunken, textColor: PDF_COLOR.ink, fontStyle: "bold", lineColor: PDF_COLOR.border, lineWidth: { top: 0.3 } },
    showFoot: "lastPage",
    columnStyles: { [valueIndex]: { halign: "right", cellWidth: 26 } },
    didParseCell: (data) => {
      if (data.column.index === valueIndex) data.cell.styles.halign = "right";
      if (data.section === "body" && data.column.index === statusIndex) {
        const item = items[data.row.index];
        if (item) data.cell.styles.textColor = statusColor(item.status);
      }
    },
  });
  return lastY(doc) + 7;
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  });
  return Array.from(map.entries());
}

/** Gera e baixa o PDF do recorte atual. `items` = todas as cobranças do recorte (não só a página). */
export async function exportFinancePdf(report: FinanceReport, items: FinanceReportItem[], labels: FinanceExportLabels, options: FinancePdfOptions) {
  const model = FINANCE_PDF_MODELS.find((m) => m.key === options.model) ?? FINANCE_PDF_MODELS[0];
  const doc = new jsPDF({ orientation: options.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const total = amountOf(report.totals.amount);
  const totals = statusTotals(report);

  let y = await drawTenantPdfHeader(doc, { marginLeft: PDF_MARGIN, marginRight: PDF_MARGIN, showGeneratedAt: false });
  y = drawDocumentTitle(doc, y, { overline: "Relatório financeiro", title: model.title, description: options.showFilters ? labels.scope : null });

  if (options.model !== "inadimplencia") {
    y = drawFactsStrip(doc, y, [
      { label: "Total no recorte", value: `${formatBrl(total)} (${report.totals.count})` },
      { label: "Recebido", value: `${formatBrl(totals.paid.amount)} (${totals.paid.count})` },
      { label: "A receber", value: `${formatBrl(totals.pending.amount)} (${totals.pending.count})` },
      { label: "Vencido", value: `${formatBrl(totals.overdue.amount)} (${totals.overdue.count})` },
    ]);
  }

  if (options.model === "completo" || options.model === "resumo") {
    y = drawReceiptBar(doc, y + 2, totals, total);
    y = drawDistribution(
      doc,
      y,
      "Por turma",
      "Turma",
      report.by_class.map((row) => ({ name: row.name, count: row.count, amount: amountOf(row.amount) })),
      total
    );
    y = drawDistribution(
      doc,
      y,
      "Por forma de pagamento",
      "Forma",
      report.by_payment_method.map((row) => ({ name: row.key ? labels.paymentMethod(row.key) : "Não informada", count: row.count, amount: amountOf(row.amount) })),
      total
    );
    y = drawDistribution(
      doc,
      y,
      "Por tipo",
      "Tipo",
      report.by_type.map((row) => ({ name: row.key ? labels.type(row.key) : "Não informado", count: row.count, amount: amountOf(row.amount) })),
      total
    );
  }

  if (options.model === "completo" || options.model === "lista") {
    if (options.model === "completo") {
      doc.addPage();
      y = PDF_MARGIN + 4;
    }
    y = sectionTitle(doc, y, "Cobranças");
    if (items.length === 0) {
      setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.body);
      doc.text("Nenhuma cobrança no recorte.", PDF_MARGIN, y + 4);
    } else if (options.groupByClass) {
      groupBy(items, (item) => item.school_class_name ?? "Sem turma").forEach(([name, groupItems]) => {
        y = sectionTitle(doc, y + 2, name);
        y = itemsTable(doc, y, groupItems, labels, { showClass: false, totalLabel: "Subtotal" });
      });
      setText(doc, PDF_COLOR.ink, PDF_TYPE.body, "bold");
      doc.text(`Total do recorte · ${items.length} cobranças · ${formatBrl(items.reduce((s, i) => s + amountOf(i.amount), 0))}`, PDF_MARGIN, y);
    } else {
      y = itemsTable(doc, y, items, labels, { showClass: true, totalLabel: "Total do recorte" });
    }
  }

  if (options.model === "inadimplencia") {
    const open = items.filter((item) => item.status === "pending" || item.status === "overdue");
    const byStudent = groupBy(open, (item) => item.student_name ?? "Sem aluno")
      .map(([name, list]) => {
        const overdue = list.filter((i) => i.status === "overdue").reduce((s, i) => s + amountOf(i.amount), 0);
        const pending = list.filter((i) => i.status === "pending").reduce((s, i) => s + amountOf(i.amount), 0);
        const oldest = list.map((i) => i.due_date ?? "").filter(Boolean).sort()[0] ?? null;
        return { name, count: list.length, overdue, pending, oldest };
      })
      .sort((a, b) => b.overdue - a.overdue || b.pending + b.overdue - (a.pending + a.overdue));
    const sumOverdue = byStudent.reduce((s, r) => s + r.overdue, 0);
    const sumPending = byStudent.reduce((s, r) => s + r.pending, 0);
    y = drawFactsStrip(doc, y, [
      { label: "Alunos com pendência", value: String(byStudent.length) },
      { label: "Cobranças em aberto", value: String(open.length) },
      { label: "Vencido", value: formatBrl(sumOverdue) },
      { label: "A receber", value: formatBrl(sumPending) },
    ]);
    if (byStudent.length === 0) {
      setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.body);
      doc.text("Nenhuma cobrança pendente ou vencida no recorte.", PDF_MARGIN, y + 4);
    } else {
      autoTable(doc, {
        ...pdfTableStyles(),
        startY: y,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
        head: [["Aluno", "Cobranças", "Vencimento mais antigo", "Vencido", "A receber", "Total"]],
        body: byStudent.map((row) => [
          row.name,
          String(row.count),
          formatIsoDate(row.oldest),
          formatBrl(row.overdue),
          formatBrl(row.pending),
          formatBrl(row.overdue + row.pending),
        ]),
        foot: [["Total", String(open.length), "", formatBrl(sumOverdue), formatBrl(sumPending), formatBrl(sumOverdue + sumPending)]],
        footStyles: { fillColor: PDF_COLOR.sunken, textColor: PDF_COLOR.ink, fontStyle: "bold", lineColor: PDF_COLOR.border, lineWidth: { top: 0.3 } },
        showFoot: "lastPage",
        didParseCell: (data) => {
          if (data.column.index >= 1) data.cell.styles.halign = data.column.index === 2 ? "left" : "right";
          if (data.section === "body" && data.column.index === 3 && byStudent[data.row.index]?.overdue > 0) {
            data.cell.styles.textColor = PDF_COLOR.danger;
          }
        },
      });
    }
  }

  drawPageFooters(doc, `Relatório financeiro · ${model.title}`);
  doc.save(`relatorio-financeiro-${model.key}.pdf`);
}

/** Planilha CSV (abre no Excel: separador ";" e BOM UTF-8). */
export function exportFinanceCsv(items: FinanceReportItem[], labels: FinanceExportLabels) {
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ["Aluno", "Descrição", "Turma", "Tipo", "Forma de pagamento", "Vencimento", "Pagamento", "Situação", "Valor"];
  const lines = items.map((item) =>
    [
      item.student_name ?? "",
      item.description,
      item.school_class_name ?? "",
      item.type ? labels.type(item.type) : "",
      item.payment_method ? labels.paymentMethod(item.payment_method) : "",
      item.due_date ? formatIsoDate(item.due_date) : "",
      item.paid_at ? formatIsoDate(item.paid_at) : "",
      labels.status(item.status),
      amountOf(item.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ]
      .map((cell) => escape(String(cell)))
      .join(";")
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-financeiro.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
