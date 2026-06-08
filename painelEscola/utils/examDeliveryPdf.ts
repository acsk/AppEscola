import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExamDeliveryReport } from "../services/examDeliveryReport";

const fmtDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export async function exportExamDeliveryPdf(report: ExamDeliveryReport): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let cursorY = 14;

  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("Relatório de entregas do simulado", 14, cursorY);
  cursorY += 6;

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, cursorY);
  cursorY += 5;

  const exam = report.exam;
  const coursesLabel = exam.courses?.length ? exam.courses.join(", ") : "—";

  autoTable(doc, {
    startY: cursorY,
    head: [["Simulado", "Tipo", "Status", "Curso(s)", "Matéria", "Elegíveis", "Entregaram", "Pendentes"]],
    body: [[
      exam.title,
      exam.exam_type_label ?? exam.exam_type ?? "—",
      exam.status_label ?? exam.status ?? "—",
      coursesLabel,
      exam.subject?.name ?? "—",
      String(report.summary.eligible_students_count),
      String(report.summary.delivered_students_count),
      String(report.summary.pending_students_count),
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold" },
    bodyStyles: { textColor: [17, 24, 39], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [["Alunos que entregaram", "", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 1;

  autoTable(doc, {
    startY: cursorY,
    head: [["#", "Aluno", "Matrícula", "Entregue em", "Situação"]],
    body: report.delivered.length > 0
      ? report.delivered.map((row, index) => [
          String(index + 1),
          row.name,
          row.enrollment_number ?? "—",
          fmtDateTime(row.finished_at),
          row.attempt_status_label ?? row.attempt_status,
        ])
      : [["—", "Nenhum aluno entregou até o momento", "", "", ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [["Alunos pendentes (não entregaram)", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 1;

  autoTable(doc, {
    startY: cursorY,
    head: [["#", "Aluno", "Matrícula"]],
    body: report.pending.length > 0
      ? report.pending.map((row, index) => [
          String(index + 1),
          row.name,
          row.enrollment_number ?? "—",
        ])
      : [["—", "Todos os alunos elegíveis já entregaram", ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  const safeTitle = exam.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "simulado";

  doc.save(`entregas-simulado-${safeTitle}.pdf`);
}
