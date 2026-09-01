import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ExamDeliveryDeliveredRow,
  ExamDeliveryReport,
  ExamDeliveryStudentRow,
} from "../services/examDeliveryReport";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";

export type ExamDeliveryPdfKind =
  | "pending"
  | "delivered"
  | "completed"
  | "pending_review"
  | "awaiting_release";

const KIND_META: Record<
  ExamDeliveryPdfKind,
  { title: string; section: string; filename: string; empty: string }
> = {
  pending: {
    title: "Relatório — alunos que não entregaram",
    section: "Alunos pendentes (não entregaram)",
    filename: "nao-entregaram",
    empty: "Todos os alunos elegíveis já entregaram",
  },
  delivered: {
    title: "Relatório — alunos que entregaram",
    section: "Alunos que entregaram",
    filename: "entregaram",
    empty: "Nenhum aluno entregou até o momento",
  },
  completed: {
    title: "Relatório — entrega com resultado completo",
    section: "Alunos com resultado completo (liberado)",
    filename: "resultado-completo",
    empty: "Nenhum aluno com resultado completo",
  },
  pending_review: {
    title: "Relatório — resultado parcial (aguardando correção)",
    section: "Alunos aguardando correção manual",
    filename: "parcial-aguardando-correcao",
    empty: "Nenhum aluno aguardando correção",
  },
  awaiting_release: {
    title: "Relatório — resultado parcial (aguardando liberação)",
    section: "Alunos com resultado aguardando liberação",
    filename: "parcial-aguardando-liberacao",
    empty: "Nenhum aluno aguardando liberação de resultado",
  },
};

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

function filterDelivered(
  rows: ExamDeliveryDeliveredRow[],
  kind: ExamDeliveryPdfKind,
): ExamDeliveryDeliveredRow[] {
  if (kind === "delivered") return rows;
  if (kind === "completed") {
    return rows.filter((row) => row.attempt_status === "completed");
  }
  if (kind === "pending_review") {
    return rows.filter((row) => row.attempt_status === "pending_review");
  }
  if (kind === "awaiting_release") {
    return rows.filter((row) => row.attempt_status === "awaiting_release");
  }
  return [];
}

function countByStatus(rows: ExamDeliveryDeliveredRow[]) {
  return {
    completed: rows.filter((r) => r.attempt_status === "completed").length,
    pending_review: rows.filter((r) => r.attempt_status === "pending_review").length,
    awaiting_release: rows.filter((r) => r.attempt_status === "awaiting_release").length,
    abandoned: rows.filter((r) => r.attempt_status === "abandoned").length,
  };
}

export async function exportExamDeliveryPdf(
  report: ExamDeliveryReport,
  kind: ExamDeliveryPdfKind = "delivered",
): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const meta = KIND_META[kind];
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let cursorY = await drawTenantPdfHeader(doc);

  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(meta.title, 14, cursorY);
  cursorY += 6;

  const exam = report.exam;
  const coursesLabel = exam.courses?.length ? exam.courses.join(", ") : "—";
  const statusCounts = countByStatus(report.delivered);
  const filteredDelivered = filterDelivered(report.delivered, kind);
  const listCount =
    kind === "pending" ? report.pending.length : filteredDelivered.length;

  autoTable(doc, {
    startY: cursorY,
    head: [[
      "Simulado",
      "Tipo",
      "Status",
      "Curso(s)",
      "Matéria",
      "Elegíveis",
      "Entregaram",
      "Pendentes",
      "Neste relatório",
    ]],
    body: [[
      exam.title,
      exam.exam_type_label ?? exam.exam_type ?? "—",
      exam.status_label ?? exam.status ?? "—",
      coursesLabel,
      exam.subject?.name ?? "—",
      String(report.summary.eligible_students_count),
      String(report.summary.delivered_students_count),
      String(report.summary.pending_students_count),
      String(listCount),
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold" },
    bodyStyles: { textColor: [17, 24, 39], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: cursorY,
    head: [["Completo", "Aguard. correção", "Aguard. liberação", "Abandonados"]],
    body: [[
      String(statusCounts.completed),
      String(statusCounts.pending_review),
      String(statusCounts.awaiting_release),
      String(statusCounts.abandoned),
    ]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold" },
    bodyStyles: { textColor: [17, 24, 39] },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [[meta.section, "", "", ""]],
    body: [],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 1;

  if (kind === "pending") {
    const pending: ExamDeliveryStudentRow[] = report.pending;
    autoTable(doc, {
      startY: cursorY,
      head: [["#", "Aluno", "Matrícula"]],
      body: pending.length > 0
        ? pending.map((row, index) => [
            String(index + 1),
            row.name,
            row.enrollment_number ?? "—",
          ])
        : [["—", meta.empty, ""]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      head: [["#", "Aluno", "Matrícula", "Entregue em", "Situação"]],
      body: filteredDelivered.length > 0
        ? filteredDelivered.map((row, index) => [
            String(index + 1),
            row.name,
            row.enrollment_number ?? "—",
            fmtDateTime(row.finished_at),
            row.attempt_status_label ?? row.attempt_status,
          ])
        : [["—", meta.empty, "", "", ""]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`entregas-${meta.filename}-${safeTitleSlug(exam.title)}.pdf`);
}
