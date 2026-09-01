import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawTenantPdfHeader } from "../../utils/pdfTenantLetterhead";

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
  className?: string;
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
  className = "flex-row items-center bg-violet-600 px-4 py-2.5 rounded-xl",
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
      let cursorY = await drawTenantPdfHeader(doc);

      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text(title, 14, cursorY);
      cursorY += 6;

      if (subtitle) {
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        doc.text(subtitle, 14, cursorY);
        cursorY += 5;
      }
      cursorY += 1;

      const flatRows = rows ?? [];

      if (groupedSections.length > 0) {
        groupedSections.forEach((group, index) => {
          if (index > 0) {
            cursorY += 2;
          }

          autoTable(doc, {
            startY: cursorY,
            head: [group.headerColumns.map((col) => col.label)],
            body: [group.headerColumns.map((col) => getCellValue(group.header, String(col.key)))],
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold" },
            bodyStyles: { textColor: [17, 24, 39], fontStyle: "bold" },
            margin: { left: 14, right: 14 },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 2;

          autoTable(doc, {
            startY: cursorY,
            head: [group.studentColumns.map((col) => col.label)],
            body: group.students.map((student) =>
              group.studentColumns.map((col) => getCellValue(student, String(col.key)))
            ),
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
            margin: { left: 14, right: 14 },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 4;
        });
      } else if (flatRows.length > 0 && columns.length > 0) {
        autoTable(doc, {
          startY: cursorY + 2,
          head: [columns.map((col) => col.label)],
          body: flatRows.map((row) => columns.map((col) => getCellValue(row, String(col.key)))),
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold" },
          margin: { left: 14, right: 14 },
        });
      } else {
        Alert.alert("Nenhum dado disponível para exportação.");
        return;
      }

      doc.save(`${filename}.pdf`);
    } catch {
      Alert.alert("Não foi possível gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleExport}
      className={className}
      activeOpacity={0.85}
      disabled={exporting}
      style={{ opacity: exporting ? 0.7 : 1 }}
    >
      {exporting ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name="document-attach-outline" size={16} color="#fff" />
      )}
      <Text className="text-white font-semibold text-sm ml-2">
        {exporting ? "Gerando PDF..." : "Exportar PDF"}
      </Text>
    </TouchableOpacity>
  );
}
