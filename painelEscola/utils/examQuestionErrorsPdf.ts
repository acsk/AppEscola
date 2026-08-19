import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExamQuestionErrorsReport } from "../services/examQuestionErrorsReport";

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

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const TABLE_HEAD = {
  fillColor: [243, 244, 246] as [number, number, number],
  textColor: [55, 65, 81] as [number, number, number],
  fontStyle: "bold" as const,
};

const SUMMARY_HEAD = {
  fillColor: [249, 250, 251] as [number, number, number],
  textColor: [55, 65, 81] as [number, number, number],
  fontStyle: "bold" as const,
};

export async function exportExamQuestionErrorsPdf(
  report: ExamQuestionErrorsReport,
): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let cursorY = 14;

  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("Relatório — questões com mais erros", 14, cursorY);
  cursorY += 6;

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, cursorY);
  cursorY += 5;

  const exam = report.exam;
  const coursesLabel = exam.courses?.length ? exam.courses.join(", ") : "—";
  const summary = report.summary;

  autoTable(doc, {
    startY: cursorY,
    head: [[
      "Simulado",
      "Tipo",
      "Status",
      "Curso(s)",
      "Matéria",
      "Alunos c/ resultado",
      "Questões",
      "Com erro",
    ]],
    body: [[
      exam.title,
      exam.exam_type_label ?? exam.exam_type ?? "—",
      exam.status_label ?? exam.status ?? "—",
      coursesLabel,
      exam.subject?.name ?? "—",
      String(summary.graded_students_count),
      String(summary.total_questions),
      String(summary.questions_with_errors),
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: SUMMARY_HEAD,
    bodyStyles: { textColor: [17, 24, 39], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: cursorY,
    head: [["Taxa média de erro", "Taxa média de acerto", "Questões respondidas", "Critério"]],
    body: [[
      fmtPct(summary.avg_error_rate),
      fmtPct(summary.avg_hit_rate),
      String(summary.questions_with_answers),
      "Melhor tentativa concluída por aluno",
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: SUMMARY_HEAD,
    bodyStyles: { textColor: [17, 24, 39] },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [["Questões ordenadas por maior taxa de erro", "", "", "", "", "", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: TABLE_HEAD,
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 1;

  const questions = report.questions;
  autoTable(doc, {
    startY: cursorY,
    head: [["#", "Ord.", "Enunciado", "Disciplina", "Erros", "Acertos", "Resp.", "% Erro", "% Acerto"]],
    body: questions.length > 0
      ? questions.map((q, index) => [
          String(index + 1),
          String(q.order),
          q.question_text_preview || "—",
          q.subject || "—",
          String(q.wrong_count),
          String(q.correct_count),
          String(q.total_answers),
          fmtPct(q.error_rate),
          fmtPct(q.hit_rate),
        ])
      : [["—", "—", "Nenhuma questão neste simulado", "—", "", "", "", "", ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: TABLE_HEAD,
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 12 },
      2: { cellWidth: 90 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`questoes-mais-erros-${safeTitleSlug(exam.title)}.pdf`);
}
