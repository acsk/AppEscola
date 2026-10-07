import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ExamDeliveryDeliveredRow,
  ExamDeliveryReport,
  ExamDeliveryStudentRow,
} from "../services/examDeliveryReport";
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
} from "./pdfTheme";

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
    title: "Alunos que não entregaram",
    section: "Alunos pendentes (não entregaram)",
    filename: "nao-entregaram",
    empty: "Todos os alunos elegíveis já entregaram",
  },
  delivered: {
    title: "Alunos que entregaram",
    section: "Alunos que entregaram",
    filename: "entregaram",
    empty: "Nenhum aluno entregou até o momento",
  },
  completed: {
    title: "Entregas com resultado completo",
    section: "Alunos com resultado completo (liberado)",
    filename: "resultado-completo",
    empty: "Nenhum aluno com resultado completo",
  },
  pending_review: {
    title: "Resultado parcial: aguardando correção",
    section: "Alunos aguardando correção manual",
    filename: "parcial-aguardando-correcao",
    empty: "Nenhum aluno aguardando correção",
  },
  awaiting_release: {
    title: "Resultado parcial: aguardando liberação",
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
  let cursorY = await drawTenantPdfHeader(doc, { marginLeft: PDF_MARGIN, marginRight: PDF_MARGIN, showGeneratedAt: false });

  const exam = report.exam;
  const coursesLabel = exam.courses?.length ? exam.courses.join(", ") : "—";
  const statusCounts = countByStatus(report.delivered);
  const filteredDelivered = filterDelivered(report.delivered, kind);
  const listCount = kind === "pending" ? report.pending.length : filteredDelivered.length;

  cursorY = drawDocumentTitle(doc, cursorY, {
    overline: `Relatório de entregas · ${exam.title}`,
    title: meta.title,
    description: [
      exam.exam_type_label ?? exam.exam_type,
      exam.subject?.name,
      exam.courses?.length ? `Curso(s): ${coursesLabel}` : null,
      exam.status_label ?? exam.status,
    ].filter(Boolean).join(" · "),
  });

  // Resumo do simulado (faixa única, como no painel)
  cursorY = drawFactsStrip(doc, cursorY, [
    { label: "Elegíveis", value: String(report.summary.eligible_students_count) },
    { label: "Entregaram", value: String(report.summary.delivered_students_count) },
    { label: "Pendentes", value: String(report.summary.pending_students_count) },
    { label: "Resultado completo", value: String(statusCounts.completed) },
    { label: "Aguard. correção", value: String(statusCounts.pending_review) },
    { label: "Aguard. liberação", value: String(statusCounts.awaiting_release) },
    { label: "Abandonados", value: String(statusCounts.abandoned) },
  ]);

  cursorY += 2;
  setText(doc, PDF_COLOR.ink, PDF_TYPE.subtitle, "bold");
  doc.text("Lista de alunos", PDF_MARGIN, cursorY);
  setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
  doc.text(`${listCount} aluno${listCount === 1 ? "" : "s"} neste relatório`, doc.internal.pageSize.getWidth() - PDF_MARGIN, cursorY, { align: "right" });
  cursorY += 3;

  const emptyRow = (cols: number) => [{ content: meta.empty, colSpan: cols, styles: { textColor: PDF_COLOR.inkSubtle, halign: "center" as const } }];

  if (kind === "pending") {
    const pending: ExamDeliveryStudentRow[] = report.pending;
    autoTable(doc, {
      ...pdfTableStyles(),
      startY: cursorY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
      head: [["#", "Aluno", "Matrícula"]],
      body: pending.length > 0
        ? pending.map((row, index) => [String(index + 1), row.name, row.enrollment_number ?? "—"])
        : [emptyRow(3)],
      columnStyles: { 0: { cellWidth: 10, textColor: PDF_COLOR.inkSubtle } },
    });
  } else {
    autoTable(doc, {
      ...pdfTableStyles(),
      startY: cursorY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 16 },
      head: [["#", "Aluno", "Matrícula", "Entregue em", "Situação"]],
      body: filteredDelivered.length > 0
        ? filteredDelivered.map((row, index) => [
            String(index + 1),
            row.name,
            row.enrollment_number ?? "—",
            fmtDateTime(row.finished_at),
            row.attempt_status_label ?? row.attempt_status,
          ])
        : [emptyRow(5)],
      columnStyles: { 0: { cellWidth: 10, textColor: PDF_COLOR.inkSubtle } },
    });
  }

  drawPageFooters(doc, `${meta.title} · ${exam.title}`);
  doc.save(`entregas-${meta.filename}-${safeTitleSlug(exam.title)}.pdf`);
}
