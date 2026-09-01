import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExamPreviewPlayerQuestion } from "../types/simulados";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";

export type ExamContentPdfMeta = {
  title: string;
  exam_type_label?: string | null;
  exam_type?: string | null;
  status_label?: string | null;
  status?: string | null;
  duration_minutes?: number | null;
  passing_score?: number | null;
  total_points?: number | null;
  courses?: string[];
  subject?: string | null;
};

function safeTitleSlug(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "simulado"
  );
}

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  return `${minutes} min`;
}

export async function exportExamContentPdf(
  meta: ExamContentPdfMeta,
  questions: ExamPreviewPlayerQuestion[],
): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const sorted = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let cursorY = await drawTenantPdfHeader(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("Relatório — simulado (questões)", 14, cursorY);
  cursorY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(meta.title || "Simulado", 14, cursorY);
  cursorY += 5;

  const coursesLabel = meta.courses?.length ? meta.courses.join(", ") : "—";

  autoTable(doc, {
    startY: cursorY,
    head: [[
      "Simulado",
      "Tipo",
      "Status",
      "Curso(s)",
      "Matéria",
      "Duração",
      "Mínimo",
      "Questões",
      "Pontos",
    ]],
    body: [[
      meta.title || "—",
      meta.exam_type_label ?? meta.exam_type ?? "—",
      meta.status_label ?? meta.status ?? "—",
      coursesLabel,
      meta.subject ?? "—",
      formatDuration(meta.duration_minutes),
      meta.passing_score != null ? `${meta.passing_score}%` : "—",
      String(sorted.length),
      meta.total_points != null ? String(meta.total_points) : "—",
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [55, 65, 81],
      fontStyle: "bold",
    },
    bodyStyles: { textColor: [17, 24, 39], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [["Questões do simulado", "", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [55, 65, 81],
      fontStyle: "bold",
    },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 1;

  const rows =
    sorted.length > 0
      ? sorted.map((q, index) => {
          const options = [...(q.options ?? [])]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((op, opIdx) => `${optionLetter(opIdx)}) ${op.option_text}`)
            .join("\n");

          const enunciado = (q.question_text || "").trim() || "[Sem enunciado]";
          const tipo = q.type === "essay" ? "Discursiva" : "Objetiva";
          const body =
            q.type === "essay"
              ? `${enunciado}\n\n(Resposta discursiva)`
              : options
                ? `${enunciado}\n\n${options}`
                : enunciado;

          return [
            String(index + 1),
            String(q.order ?? index + 1),
            tipo,
            body,
            String(q.points ?? "—"),
          ];
        })
      : [["—", "—", "—", "Nenhuma questão neste simulado", ""]];

  autoTable(doc, {
    startY: cursorY,
    head: [["#", "Ord.", "Tipo", "Enunciado / alternativas", "Pts"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, valign: "top" },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [55, 65, 81],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 12 },
      2: { cellWidth: 24 },
      3: { cellWidth: 210 },
      4: { cellWidth: 14, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`simulado-${safeTitleSlug(meta.title)}.pdf`);
}
