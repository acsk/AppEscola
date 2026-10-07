import React, { useState } from "react";
import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawTenantPdfHeader } from "../../utils/pdfTenantLetterhead";
import {
  PDF_COLOR,
  PDF_MARGIN,
  PDF_TYPE,
  drawDocumentTitle,
  drawFactsStrip,
  drawPageFooters,
  pdfTableStyles,
  setText,
} from "../../utils/pdfTheme";
import Button, { type ButtonVariant } from "./Button";
import { FileDown } from "lucide-react-native";

type Column<T> = {
  key: keyof T | string;
  label: string;
};

export type PdfGroup<TStudent extends Record<string, any>> = {
  header: Record<string, string>;
  headerColumns: Array<Column<any>>;
  students: TStudent[];
  studentColumns: Array<Column<TStudent>>;
};

type Props<T extends Record<string, any>> = {
  filename?: string;
  title: string;
  subtitle?: string;
  columns?: Array<Column<T>>;
  rows?: T[];
  groups?: Array<PdfGroup<any>>;
  onBeforeExport?: () => Promise<Array<PdfGroup<any>> | void>;
  /** Estilo do botão (padrão `primary`: costuma ser a ação principal do relatório). */
  variant?: ButtonVariant;
  label?: string;
};

const getCellValue = (row: Record<string, any>, key: string) => String(row[key] ?? "-");

export default function GridPdfExportButton<T extends Record<string, any>>({
  filename = "relatorio",
  title,
  subtitle,
  columns = [],
  rows = [],
  groups,
  onBeforeExport,
  variant = "primary",
  label = "Exportar PDF",
}: Props<T>) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      Alert.alert("Exportação disponível apenas na versão web.");
      return;
    }

    setExporting(true);
    try {
      let groupedSections = groups ?? [];
      if (onBeforeExport) {
        const fetchedGroups = await onBeforeExport();
        if (fetchedGroups) {
          groupedSections = fetchedGroups;
        }
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageHeight = doc.internal.pageSize.getHeight();
      let cursorY = await drawTenantPdfHeader(doc, { marginLeft: PDF_MARGIN, marginRight: PDF_MARGIN, showGeneratedAt: false });
      cursorY = drawDocumentTitle(doc, cursorY, { overline: "Relatório", title, description: subtitle });

      const flatRows = rows ?? [];
      const bottomLimit = pageHeight - 16; // espaço do rodapé

      if (groupedSections.length > 0) {
        groupedSections.forEach((group) => {
          // Cabeçalho do grupo + início da tabela não podem ficar órfãos no fim da página.
          if (cursorY + 34 > bottomLimit) {
            doc.addPage();
            cursorY = PDF_MARGIN + 4;
          }
          cursorY = drawFactsStrip(
            doc,
            cursorY,
            group.headerColumns.map((col) => ({ label: col.label, value: getCellValue(group.header, String(col.key)) }))
          );

          setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
          const count = group.students.length;
          doc.text(`${count} aluno${count === 1 ? "" : "s"}`, PDF_MARGIN, cursorY);
          cursorY += 2;

          autoTable(doc, {
            ...pdfTableStyles(),
            startY: cursorY,
            margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
            head: [["#", ...group.studentColumns.map((col) => col.label)]],
            body: group.students.map((student, i) => [
              String(i + 1),
              ...group.studentColumns.map((col) => getCellValue(student, String(col.key))),
            ]),
            columnStyles: { 0: { cellWidth: 10, textColor: PDF_COLOR.inkSubtle } },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 8;
        });
      } else if (flatRows.length > 0 && columns.length > 0) {
        autoTable(doc, {
          ...pdfTableStyles(),
          startY: cursorY,
          margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
          head: [columns.map((col) => col.label)],
          body: flatRows.map((row) => columns.map((col) => getCellValue(row, String(col.key)))),
        });
      } else {
        Alert.alert("Nenhum dado disponível para exportação.");
        return;
      }

      drawPageFooters(doc, title);
      doc.save(`${filename}.pdf`);
    } catch {
      Alert.alert("Não foi possível gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  return <Button variant={variant} icon={FileDown} label={exporting ? "Gerando PDF..." : label} onPress={() => void handleExport()} loading={exporting} />;
}
