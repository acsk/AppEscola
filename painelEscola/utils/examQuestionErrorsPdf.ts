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

export async function exportExamQuestionErrorsPdf(
  report: ExamQuestionErrorsReport
): Promise<void> {
  if (Platform.OS !== "web") {
    Alert.alert(
      "Indisponível",
      "A exportação em PDF deste relatório está disponível na versão web do painel."
    );
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 16;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório — questões com mais erros", margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(report.exam.title || "Simulado", margin, y);
  y += 5;

  const courses = report.exam.courses?.length ? report.exam.courses.join(", ") : "—";
  const subject = report.exam.subject?.name ?? "—";
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Cursos: ${courses}  ·  Disciplina: ${subject}`, margin, y);
  y += 5;
  doc.text(
    `Alunos com resultado: ${report.summary.graded_students_count}  ·  Questões com erro: ${report.summary.questions_with_errors}/${report.summary.total_questions}  ·  Taxa média de erro: ${fmtPct(report.summary.avg_error_rate)}`,
    margin,
    y
  );
  y += 4;
  doc.setTextColor(100);
  doc.text(
    "Base: melhor tentativa concluída por aluno. Apenas respostas já corrigidas entram no cálculo.",
    margin,
    y
  );
  y += 6;
  doc.setTextColor(0);

  const rows = report.questions.map((q, idx) => [
    String(idx + 1),
    String(q.order),
    q.question_text_preview || "—",
    q.subject || "—",
    String(q.wrong_count),
    String(q.correct_count),
    String(q.total_answers),
    fmtPct(q.error_rate),
    fmtPct(q.hit_rate),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Ord.", "Enunciado", "Disciplina", "Erros", "Acertos", "Resp.", "% Erro", "% Acerto"]],
    body: rows.length
      ? rows
      : [["—", "—", "Nenhuma questão neste simulado", "—", "—", "—", "—", "—", "—"]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 12 },
      2: { cellWidth: 90 },
      3: { cellWidth: 32 },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 18, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 18, halign: "right" },
      8: { cellWidth: 20, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  const filename = `questoes-mais-erros-${safeTitleSlug(report.exam.title)}-${report.exam.id}.pdf`;
  doc.save(filename);
}
