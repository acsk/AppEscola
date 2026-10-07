import type jsPDF from "jspdf";

/**
 * Tema de PDF do design system "Cursinho Hub" (jsPDF / jspdf-autotable).
 * Cores = tokens do tema CLARO (papel é sempre claro), lidas de constants/designTokens.js.
 * Regras: tinta sobre papel; `brand` só na identidade (filete do timbrado, número da questão);
 * tabelas com cabeçalho em `surface-sunken`, só divisórias horizontais, sem zebra; dados alinhados.
 * Fonte: Helvetica (a IBM Plex não é embutida para manter o PDF leve).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { palette } = require("../constants/designTokens") as { palette: { light: Record<string, string> } };

export type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const token = (name: string): Rgb => hexToRgb(palette.light[name]);

export const PDF_COLOR = {
  ink: token("ink"),
  inkMuted: token("ink-muted"),
  inkSubtle: token("ink-subtle"),
  border: token("border"),
  borderStrong: token("border-strong"),
  sunken: token("surface-sunken"),
  surface: token("surface"),
  brand: token("brand"),
  success: token("success"),
  warning: token("warning"),
  danger: token("danger"),
} as const;

/** Escala tipográfica (pt) equivalente aos estilos do sistema. */
export const PDF_TYPE = {
  title: 15, // display reduzido para papel
  subtitle: 11,
  body: 10,
  label: 8.5,
  caption: 7.5,
} as const;

export const PDF_MARGIN = 14;

export function setText(doc: jsPDF, color: Rgb, size: number, weight: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

/** Divisor horizontal fino em `border`. */
export function drawRule(doc: jsPDF, y: number, opts?: { x1?: number; x2?: number; color?: Rgb; width?: number }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...(opts?.color ?? PDF_COLOR.border));
  doc.setLineWidth(opts?.width ?? 0.25);
  doc.line(opts?.x1 ?? PDF_MARGIN, y, opts?.x2 ?? pageWidth - PDF_MARGIN, y);
}

/**
 * Título do documento (estilo `PageHeader`): overline opcional, título e descrição.
 * Devolve o Y seguinte.
 */
export function drawDocumentTitle(
  doc: jsPDF,
  y: number,
  { overline, title, description }: { overline?: string; title: string; description?: string | null }
): number {
  const width = doc.internal.pageSize.getWidth() - PDF_MARGIN * 2;
  let cursor = y;
  if (overline) {
    setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption, "bold");
    doc.text(overline.toUpperCase(), PDF_MARGIN, cursor, { charSpace: 0.4 });
    cursor += 5;
  }
  setText(doc, PDF_COLOR.ink, PDF_TYPE.title, "bold");
  const lines = doc.splitTextToSize(title, width);
  doc.text(lines, PDF_MARGIN, cursor);
  cursor += lines.length * 6;
  if (description?.trim()) {
    setText(doc, PDF_COLOR.inkMuted, PDF_TYPE.label);
    const desc = doc.splitTextToSize(description.trim(), width);
    doc.text(desc, PDF_MARGIN, cursor);
    cursor += desc.length * 3.8;
  }
  return cursor + 3;
}

export type PdfFact = { label: string; value: string };

/**
 * Faixa de resumo (como a da tela de matrícula): uma caixa com borda `border`,
 * colunas separadas por divisor; rótulo em `ink-subtle`, valor em `ink`.
 */
export function drawFactsStrip(doc: jsPDF, y: number, facts: PdfFact[], opts?: { x?: number; width?: number }): number {
  const x = opts?.x ?? PDF_MARGIN;
  const width = opts?.width ?? doc.internal.pageSize.getWidth() - PDF_MARGIN * 2;
  const colWidth = width / Math.max(1, facts.length);
  const padX = 3;

  setText(doc, PDF_COLOR.ink, PDF_TYPE.body, "bold");
  const valueLines = facts.map((f) => doc.splitTextToSize(f.value || "—", colWidth - padX * 2) as string[]);
  const maxLines = Math.max(1, ...valueLines.map((l) => l.length));
  const height = 6 + 3.5 + maxLines * 4.2 + 2;

  doc.setDrawColor(...PDF_COLOR.border);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);
  facts.forEach((fact, i) => {
    const cx = x + i * colWidth;
    if (i > 0) doc.line(cx, y, cx, y + height);
    setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
    doc.text(fact.label, cx + padX, y + 5);
    setText(doc, PDF_COLOR.ink, PDF_TYPE.body, "bold");
    doc.text(valueLines[i], cx + padX, y + 10);
  });
  return y + height + 4;
}

/** Estilos do jspdf-autotable no padrão DataTable do sistema. */
export function pdfTableStyles(overrides?: { fontSize?: number }) {
  const fontSize = overrides?.fontSize ?? 8.5;
  return {
    theme: "plain" as const,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    styles: {
      font: "helvetica",
      fontSize,
      textColor: PDF_COLOR.ink,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: PDF_COLOR.border,
      lineWidth: { bottom: 0.2 },
      valign: "middle" as const,
    },
    headStyles: {
      fillColor: PDF_COLOR.sunken,
      textColor: PDF_COLOR.inkMuted,
      fontStyle: "bold" as const,
      fontSize: fontSize - 0.5,
      lineColor: PDF_COLOR.border,
      lineWidth: { top: 0.2, bottom: 0.3 },
    },
    bodyStyles: { fillColor: PDF_COLOR.surface },
  };
}

/**
 * Rodapé em todas as páginas: nome do documento à esquerda, "Página x de y" à direita, data de geração.
 * Chamar depois de desenhar todo o conteúdo.
 */
export function drawPageFooters(doc: jsPDF, documentName: string) {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawRule(doc, pageHeight - 10);
    setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
    doc.text(`${documentName} · gerado em ${generatedAt}`, PDF_MARGIN, pageHeight - 6);
    doc.text(`Página ${page} de ${total}`, pageWidth - PDF_MARGIN, pageHeight - 6, { align: "right" });
  }
}
