import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StudentAcademicHistory } from "../types/academicHistory";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";
import { isoToDisplay, maskCPF, maskPhone } from "./masks";

function safeSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "aluno"
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return isoToDisplay(iso.slice(0, 10));
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtPct(value?: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function enrollmentCoursesLabel(
  enrollment: StudentAcademicHistory["enrollments"][number]
): string {
  if (enrollment.courses?.length) {
    return enrollment.courses.map((c) => c.name).join(", ");
  }
  return enrollment.course?.name ?? "—";
}

function enrollmentClassesLabel(
  enrollment: StudentAcademicHistory["enrollments"][number]
): string {
  if (enrollment.school_classes?.length) {
    return enrollment.school_classes.map((c) => c.name).join(", ");
  }
  return enrollment.school_class?.name ?? "—";
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  inactive: "Inativa",
  cancelled: "Cancelada",
  completed: "Concluída",
  suspended: "Suspensa",
  in_progress: "Em andamento",
  pending_review: "Aguardando correção",
  awaiting_release: "Aguardando liberação",
  abandoned: "Abandonada",
};

export async function exportStudentAcademicHistoryPdf(
  history: StudentAcademicHistory
): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const marginLeft = 14;
  const marginRight = 14;
  const pageWidth = doc.internal.pageSize.getWidth();

  let cursorY = await drawTenantPdfHeader(doc, {
    marginLeft,
    marginRight,
    showGeneratedAt: true,
  });

  const student = history.student;
  const summary = history.summary;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Resumo acadêmico do aluno", marginLeft, cursorY);
  cursorY += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(student.name || "Aluno", marginLeft, cursorY);
  cursorY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const metaLines = [
    student.enrollment_number ? `Matrícula: ${student.enrollment_number}` : null,
    student.document ? `Documento: ${maskCPF(student.document)}` : null,
    student.birth_date ? `Nascimento: ${fmtDate(student.birth_date)}` : null,
    student.email ? `E-mail: ${student.email}` : null,
    student.phone ? `Telefone: ${maskPhone(student.phone)}` : null,
    student.status ? `Status: ${STATUS_LABELS[student.status] ?? student.status}` : null,
  ].filter(Boolean) as string[];

  metaLines.forEach((line) => {
    doc.text(line, marginLeft, cursorY);
    cursorY += 4;
  });
  cursorY += 2;

  autoTable(doc, {
    startY: cursorY,
    head: [["Indicador", "Valor"]],
    body: [
      ["Matrículas", String(summary.enrollments_count)],
      ["Matrículas ativas", String(summary.active_enrollments_count)],
      ["Simulados realizados", String(summary.attempts_count)],
      ["Simulados concluídos", String(summary.completed_attempts_count)],
      ["Média geral", fmtPct(summary.average_percentage)],
      ["Aprovados / Reprovados", `${summary.passed_count} / ${summary.failed_count}`],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    margin: { left: marginLeft, right: marginRight },
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY ?? cursorY) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Cursos e turmas (matrículas)", marginLeft, cursorY);
  cursorY += 3;

  const enrollmentRows =
    history.enrollments.length > 0
      ? history.enrollments.map((enrollment) => [
          enrollment.enrollment_number ?? "—",
          enrollmentCoursesLabel(enrollment),
          enrollmentClassesLabel(enrollment),
          enrollment.bundle?.name ?? enrollment.course_plan?.name ?? "—",
          STATUS_LABELS[enrollment.status] ?? enrollment.status,
          `${fmtDate(enrollment.start_date)} – ${fmtDate(enrollment.end_date)}`,
        ])
      : [["—", "Nenhuma matrícula encontrada", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: cursorY,
    head: [["Nº", "Curso(s)", "Turma(s)", "Plano/Pacote", "Status", "Período"]],
    body: enrollmentRows,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 36 },
    },
    margin: { left: marginLeft, right: marginRight },
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY ?? cursorY) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Simulados online — resultados", marginLeft, cursorY);
  cursorY += 3;

  const attemptRows =
    history.exam_attempts.length > 0
      ? history.exam_attempts.map((attempt) => [
          attempt.exam?.title ?? `Simulado #${attempt.exam_id}`,
          attempt.exam?.subject?.name ?? "—",
          attempt.exam?.exam_type_label ?? attempt.exam?.exam_type ?? "—",
          STATUS_LABELS[attempt.status ?? ""] ?? attempt.status ?? "—",
          attempt.score_display ?? "—",
          fmtPct(attempt.percentage),
          attempt.passed == null ? "—" : attempt.passed ? "Sim" : "Não",
          fmtDateTime(attempt.finished_at ?? attempt.started_at),
        ])
      : [["—", "Nenhum simulado encontrado", "—", "—", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: cursorY,
    head: [
      [
        "Simulado",
        "Disciplina",
        "Tipo",
        "Status",
        "Nota",
        "%",
        "Aprov.",
        "Data",
      ],
    ],
    body: attemptRows,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: marginLeft, right: marginRight },
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY ?? cursorY) + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Documento gerado pelo painel AppEscola — resumo acadêmico.",
    pageWidth / 2,
    Math.min(cursorY, doc.internal.pageSize.getHeight() - 10),
    { align: "center" }
  );

  doc.save(`resumo-academico-${safeSlug(student.name)}.pdf`);
}
