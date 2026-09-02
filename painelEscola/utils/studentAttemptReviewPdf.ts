import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import type {
  AcademicHistoryAttempt,
  AcademicHistoryReviewQuestion,
  AcademicHistoryStudent,
} from "../types/academicHistory";
import { drawTenantPdfHeader, imageUrlToDataUrl } from "./pdfTenantLetterhead";

function safeSlug(value: string): string {
  return (
    value
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

function ensureSpace(
  doc: jsPDF,
  cursorY: number,
  needed: number,
  marginBottom: number
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed <= pageHeight - marginBottom) return cursorY;
  doc.addPage();
  return 16;
}

function sortedQuestions(attempt: AcademicHistoryAttempt): AcademicHistoryReviewQuestion[] {
  return [...(attempt.questions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function exportStudentAttemptReviewPdf(params: {
  student: AcademicHistoryStudent;
  attempt: AcademicHistoryAttempt;
}): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    Alert.alert("Exportação disponível apenas na versão web.");
    return;
  }

  const { student, attempt } = params;
  const questions = sortedQuestions(attempt);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const marginLeft = 16;
  const marginRight = 16;
  const marginBottom = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginLeft - marginRight;

  let cursorY = await drawTenantPdfHeader(doc, {
    marginLeft,
    marginRight,
    showGeneratedAt: false,
  });

  const title = attempt.exam?.title || `Simulado #${attempt.exam_id}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, marginLeft, cursorY);
  cursorY += titleLines.length * 5 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const meta = [
    attempt.exam?.subject?.name ? `Disciplina: ${attempt.exam.subject.name}` : null,
    attempt.exam?.exam_type_label || attempt.exam?.exam_type
      ? `Tipo: ${attempt.exam.exam_type_label ?? attempt.exam.exam_type}`
      : null,
    attempt.score_display ? `Nota: ${attempt.score_display}` : null,
    attempt.percentage != null ? `Aproveitamento: ${fmtPct(attempt.percentage)}` : null,
    attempt.passed == null ? null : attempt.passed ? "Resultado: Aprovado" : "Resultado: Reprovado",
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) {
    const metaLines = doc.splitTextToSize(meta, contentWidth);
    doc.text(metaLines, marginLeft, cursorY);
    cursorY += metaLines.length * 3.6 + 2;
  }

  // Dados do aluno preenchidos
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginLeft, cursorY, contentWidth, 16, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("Aluno(a):", marginLeft + 3, cursorY + 6);
  doc.setFont("helvetica", "normal");
  doc.text(student.name || "—", marginLeft + 22, cursorY + 6);

  if (student.enrollment_number) {
    doc.setFont("helvetica", "bold");
    doc.text("Matrícula:", marginLeft + contentWidth * 0.58, cursorY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(student.enrollment_number, marginLeft + contentWidth * 0.58 + 20, cursorY + 6);
  }

  doc.setFont("helvetica", "bold");
  doc.text("Entrega:", marginLeft + 3, cursorY + 12);
  doc.setFont("helvetica", "normal");
  doc.text(
    fmtDateTime(attempt.finished_at ?? attempt.started_at),
    marginLeft + 20,
    cursorY + 12
  );

  if (attempt.started_at) {
    doc.setFont("helvetica", "bold");
    doc.text("Início:", marginLeft + contentWidth * 0.58, cursorY + 12);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDateTime(attempt.started_at), marginLeft + contentWidth * 0.58 + 14, cursorY + 12);
  }

  cursorY += 20;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
  cursorY += 6;

  if (questions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Sem questões detalhadas para esta tentativa.", marginLeft, cursorY);
    doc.save(
      `simulado-${safeSlug(title)}-${safeSlug(student.name)}.pdf`
    );
    return;
  }

  for (let index = 0; index < questions.length; index += 1) {
    const q = questions[index];
    const options = [...(q.options ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const enunciado = (q.question_text || "").trim() || "[Sem enunciado]";
    const correction = q.correction;
    const isCorrect = correction?.is_correct === true;
    const isWrong = correction?.is_correct === false;
    const pending = correction?.is_correct == null;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const enunciadoLines = doc.splitTextToSize(enunciado, contentWidth - 6);

    let optionsHeight = 0;
    const optionBlocks: Array<{ lines: string[]; selected: boolean; correct: boolean; wrong: boolean }> =
      [];
    options.forEach((op, opIdx) => {
      const selected = !!op.selected;
      const correct = op.is_correct === true;
      const wrong = selected && op.is_correct === false;
      const mark =
        correct && selected
          ? " [marcada · correta]"
          : correct
            ? " [correta]"
            : selected && wrong
              ? " [marcada · incorreta]"
              : selected
                ? " [marcada]"
                : "";
      const line = `${optionLetter(opIdx)})  ${op.option_text}${mark}`;
      const lines = doc.splitTextToSize(line, contentWidth - 10);
      optionBlocks.push({ lines, selected, correct, wrong });
      optionsHeight += lines.length * 4.2 + 1.2;
    });

    if (q.student_answer?.text_answer) {
      optionsHeight += 10;
    }

    let imageHeight = 0;
    let imageDataUrl: string | null = null;
    if (q.image_url?.trim()) {
      imageDataUrl = await imageUrlToDataUrl(q.image_url.trim());
      if (imageDataUrl) imageHeight = 38;
    }

    const blockHeight = 8 + enunciadoLines.length * 4.6 + imageHeight + optionsHeight + 8;
    cursorY = ensureSpace(doc, cursorY, Math.min(blockHeight, 70), marginBottom);

    // Cabeçalho da questão
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${index + 1}.`, marginLeft, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (isCorrect) {
      doc.setTextColor(22, 163, 74);
      doc.text("Correta", marginLeft + 10, cursorY);
    } else if (isWrong) {
      doc.setTextColor(220, 38, 38);
      doc.text("Incorreta", marginLeft + 10, cursorY);
    } else if (pending) {
      doc.setTextColor(180, 83, 9);
      doc.text("Em correção", marginLeft + 10, cursorY);
    }

    const pts =
      correction?.points_earned != null && correction?.max_points != null
        ? `${correction.points_earned}/${correction.max_points} pts`
        : q.points != null
          ? `${q.points} pts`
          : null;
    if (pts) {
      doc.setTextColor(100, 116, 139);
      doc.text(pts, pageWidth - marginRight, cursorY, { align: "right" });
    }
    cursorY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    for (const line of enunciadoLines) {
      cursorY = ensureSpace(doc, cursorY, 6, marginBottom);
      doc.text(line, marginLeft + 2, cursorY);
      cursorY += 4.6;
    }
    cursorY += 1.5;

    if (imageDataUrl) {
      cursorY = ensureSpace(doc, cursorY, imageHeight + 3, marginBottom);
      try {
        const imgW = Math.min(contentWidth * 0.65, 110);
        doc.addImage(imageDataUrl, "PNG", marginLeft + 2, cursorY, imgW, 34);
        cursorY += 37;
      } catch {
        try {
          const imgW = Math.min(contentWidth * 0.65, 110);
          doc.addImage(imageDataUrl, "JPEG", marginLeft + 2, cursorY, imgW, 34);
          cursorY += 37;
        } catch {
          // ignora
        }
      }
    }

    optionBlocks.forEach((block) => {
      block.lines.forEach((line, lineIdx) => {
        cursorY = ensureSpace(doc, cursorY, 5.5, marginBottom);
        if (block.correct) doc.setTextColor(21, 128, 61);
        else if (block.wrong) doc.setTextColor(185, 28, 28);
        else if (block.selected) doc.setTextColor(37, 99, 235);
        else doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", lineIdx === 0 && (block.correct || block.selected) ? "bold" : "normal");
        doc.setFontSize(9.5);
        doc.text(line, marginLeft + 4, cursorY);
        cursorY += 4.2;
      });
      cursorY += 1;
    });

    if (q.student_answer?.text_answer) {
      cursorY = ensureSpace(doc, cursorY, 10, marginBottom);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Texto enviado:", marginLeft + 4, cursorY);
      cursorY += 3.5;
      doc.setFont("helvetica", "normal");
      const textLines = doc.splitTextToSize(q.student_answer.text_answer, contentWidth - 10);
      doc.setTextColor(17, 24, 39);
      for (const line of textLines) {
        cursorY = ensureSpace(doc, cursorY, 5, marginBottom);
        doc.text(line, marginLeft + 4, cursorY);
        cursorY += 4;
      }
      cursorY += 1;
    }

    cursorY += 2;
    cursorY = ensureSpace(doc, cursorY, 4, marginBottom);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
    cursorY += 5;
  }

  doc.save(`simulado-${safeSlug(title)}-${safeSlug(student.name)}.pdf`);
}
