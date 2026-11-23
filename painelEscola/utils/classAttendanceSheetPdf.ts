import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";
import {
  PDF_COLOR,
  PDF_MARGIN,
  PDF_TYPE,
  drawDocumentTitle,
  drawFactsStrip,
  drawRule,
  setText,
} from "./pdfTheme";

/** Colunas em branco para o professor escrever a data e marcar a chamada à mão. */
const DAY_COLUMNS = 8;

export type AttendanceSheetStudent = {
  name: string;
};

export type AttendanceSheetInput = {
  className: string;
  courseName?: string | null;
  students: AttendanceSheetStudent[];
};

function safeSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "turma"
  );
}

function drawSheetFooters(doc: jsPDF, documentName: string) {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawRule(doc, pageHeight - 10);
    setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
    doc.text(documentName, PDF_MARGIN, pageHeight - 6);
    doc.text(`Página ${page} de ${total}`, pageWidth - PDF_MARGIN, pageHeight - 6, { align: "right" });
  }
}

export async function exportClassAttendanceSheetPdf(input: AttendanceSheetInput): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const students = [...input.students].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const className = input.className.trim() || "Turma";
  const courseName = input.courseName?.trim() || "Sem curso";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let cursorY = await drawTenantPdfHeader(doc, {
    marginLeft: PDF_MARGIN,
    marginRight: PDF_MARGIN,
    showGeneratedAt: false,
  });

  cursorY = drawDocumentTitle(doc, cursorY, {
    overline: "Frequência",
    title: "Ficha de presença",
    description: `${className} · ${courseName}. Escreva a data no topo de cada coluna e marque a presença à mão.`,
  });

  cursorY = drawFactsStrip(doc, cursorY, [
    { label: "Turma", value: className },
    { label: "Curso", value: courseName },
    { label: "Alunos", value: String(students.length) },
  ]);

  const blankDays = Array.from({ length: DAY_COLUMNS }, () => "");
  const columnStyles: Record<number, { cellWidth: number; halign: "center" | "left" }> = {
    0: { cellWidth: 12, halign: "center" },
  };
  for (let index = 0; index < DAY_COLUMNS; index += 1) {
    columnStyles[index + 2] = { cellWidth: 18, halign: "center" };
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
    showHead: "everyPage",
    theme: "plain",
    head: [["Nº", "Nome do aluno", ...blankDays]],
    body: students.map((student, index) => [String(index + 1), student.name, ...blankDays]),
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: PDF_COLOR.ink,
      cellPadding: { top: 2.6, bottom: 2.6, left: 2.2, right: 2.2 },
      lineColor: PDF_COLOR.border,
      lineWidth: 0.25,
      valign: "middle",
      minCellHeight: 11,
    },
    headStyles: {
      fillColor: PDF_COLOR.sunken,
      textColor: PDF_COLOR.inkMuted,
      fontStyle: "bold",
      fontSize: 8,
      minCellHeight: 14,
      valign: "bottom",
    },
    bodyStyles: { fillColor: PDF_COLOR.surface },
    columnStyles,
  });

  drawSheetFooters(doc, `Ficha de presença · ${className}`);
  doc.save(`ficha-presenca-${safeSlug(className)}.pdf`);
}
