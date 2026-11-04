import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";
import { PDF_COLOR, PDF_MARGIN, PDF_TYPE, drawDocumentTitle, drawFactsStrip, drawPageFooters, pdfTableStyles, setText, type PdfFact } from "./pdfTheme";

/** Célula de planilha: número fica número (soma no Excel); texto fica texto. */
export type SheetCell = string | number | null;

export type ExportSection = {
  title: string;
  head: string[];
  body: string[][];
  /** Linha de total (opcional). */
  foot?: string[];
  /** Índices das colunas alinhadas à direita (valores). */
  numeric?: number[];
  /** Texto quando a seção não tem linhas. */
  empty?: string;
};

export type FinancePdfDocument = {
  fileName: string;
  overline: string;
  title: string;
  description?: string;
  facts?: PdfFact[];
  sections: ExportSection[];
  landscape?: boolean;
};

export const brl = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valor para planilha: número com 2 casas (ou vazio). */
export const num = (value: string | number | null | undefined): SheetCell =>
  value === null || value === undefined || value === "" ? null : Math.round(Number(value) * 100) / 100;

export const isoDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** PDF no padrão dos relatórios do sistema: timbre da escola, título, faixa de resumo, seções em tabela e rodapé. */
export async function exportFinancePdf(document: FinancePdfDocument) {
  const doc = new jsPDF({ orientation: document.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  let y = await drawTenantPdfHeader(doc, { marginLeft: PDF_MARGIN, marginRight: PDF_MARGIN, showGeneratedAt: false });
  y = drawDocumentTitle(doc, y, { overline: document.overline, title: document.title, description: document.description ?? null });
  if (document.facts?.length) y = drawFactsStrip(doc, y, document.facts);

  const pageHeight = doc.internal.pageSize.getHeight();
  for (const section of document.sections) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = PDF_MARGIN + 4;
    }
    setText(doc, PDF_COLOR.ink, PDF_TYPE.body, "bold");
    doc.text(section.title, PDF_MARGIN, y + 2);
    y += 5;

    if (section.body.length === 0) {
      setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.body);
      doc.text(section.empty ?? "Nada a mostrar.", PDF_MARGIN, y + 3);
      y += 10;
      continue;
    }

    const numeric = new Set(section.numeric ?? []);
    autoTable(doc, {
      ...pdfTableStyles({ fontSize: 8 }),
      startY: y,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
      head: [section.head],
      body: section.body,
      foot: section.foot ? [section.foot] : undefined,
      footStyles: { fillColor: PDF_COLOR.sunken, textColor: PDF_COLOR.ink, fontStyle: "bold", lineColor: PDF_COLOR.border, lineWidth: { top: 0.3 } },
      showFoot: "lastPage",
      didParseCell: (data) => {
        if (numeric.has(data.column.index)) data.cell.styles.halign = "right";
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  }

  drawPageFooters(doc, document.title);
  doc.save(`${document.fileName}.pdf`);
}

/** Planilha .xlsx com uma aba por tabela (nomes de aba limitados a 31 caracteres). */
export function exportFinanceXlsx(fileName: string, sheets: { name: string; rows: SheetCell[][] }[]) {
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    let name = sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    for (let i = 2; used.has(name); i++) name = `${sheet.name.slice(0, 28)} ${i}`;
    used.add(name);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), name);
  }
  XLSX.writeFile(book, `${fileName}.xlsx`);
}
