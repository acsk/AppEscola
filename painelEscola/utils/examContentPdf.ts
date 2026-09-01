import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import type { ExamPreviewPlayerQuestion } from "../types/simulados";
import {
  drawTenantPdfHeader,
  imageUrlToDataUrl,
} from "./pdfTenantLetterhead";

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
  description?: string | null;
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
  if (minutes == null || Number.isNaN(Number(minutes)) || Number(minutes) <= 0) {
    return "Sem limite";
  }
  return `${minutes} min`;
}

function ensureSpace(
  doc: jsPDF,
  cursorY: number,
  needed: number,
  marginBottom: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed <= pageHeight - marginBottom) return cursorY;
  doc.addPage();
  return 16;
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

  // Título da prova
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(meta.title || "Simulado", contentWidth);
  doc.text(titleLines, marginLeft, cursorY);
  cursorY += titleLines.length * 6 + 2;

  // Metadados compactos (como cabeçalho de prova)
  const metaParts = [
    meta.courses?.length ? `Curso: ${meta.courses.join(", ")}` : null,
    meta.subject ? `Disciplina: ${meta.subject}` : null,
    meta.exam_type_label || meta.exam_type
      ? `Tipo: ${meta.exam_type_label ?? meta.exam_type}`
      : null,
    `Duração: ${formatDuration(meta.duration_minutes)}`,
    `Questões: ${sorted.length}`,
    meta.total_points != null ? `Pontuação: ${meta.total_points}` : null,
  ].filter(Boolean) as string[];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const metaText = metaParts.join("  ·  ");
  const metaLines = doc.splitTextToSize(metaText, contentWidth);
  doc.text(metaLines, marginLeft, cursorY);
  cursorY += metaLines.length * 4.2 + 2;

  if (meta.description?.trim()) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const descLines = doc.splitTextToSize(meta.description.trim(), contentWidth);
    doc.text(descLines, marginLeft, cursorY);
    cursorY += descLines.length * 4 + 2;
  }

  // Campos do aluno
  cursorY = ensureSpace(doc, cursorY, 22, marginBottom);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginLeft, cursorY, contentWidth, 18, 2, 2, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(31, 41, 55);
  doc.text("Aluno(a):", marginLeft + 3, cursorY + 7);
  doc.setDrawColor(71, 85, 105);
  doc.line(marginLeft + 22, cursorY + 7.5, marginLeft + contentWidth * 0.62, cursorY + 7.5);

  doc.text("Data:", marginLeft + contentWidth * 0.66, cursorY + 7);
  doc.line(marginLeft + contentWidth * 0.66 + 12, cursorY + 7.5, marginLeft + contentWidth - 3, cursorY + 7.5);

  doc.text("Turma:", marginLeft + 3, cursorY + 14);
  doc.line(marginLeft + 18, cursorY + 14.5, marginLeft + contentWidth * 0.62, cursorY + 14.5);

  doc.text("Nota:", marginLeft + contentWidth * 0.66, cursorY + 14);
  doc.line(marginLeft + contentWidth * 0.66 + 12, cursorY + 14.5, marginLeft + contentWidth - 3, cursorY + 14.5);

  cursorY += 24;

  // Questões
  for (let index = 0; index < sorted.length; index += 1) {
    const q = sorted[index];
    const number = index + 1;
    const enunciado = (q.question_text || "").trim() || "[Sem enunciado]";
    const options = [...(q.options ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const headerLabel = `${number}.`;
    const pointsLabel = `${q.points ?? 0} pt${Number(q.points) === 1 ? "" : "s"}`;
    const typeLabel = q.type === "essay" ? "Discursiva" : "Objetiva";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const enunciadoLines = doc.splitTextToSize(enunciado, contentWidth - 8);

    let optionsBlockHeight = 0;
    const optionBlocks: string[][] = [];
    if (q.type === "multiple_choice") {
      options.forEach((op, opIdx) => {
        const line = `${optionLetter(opIdx)})  ${op.option_text}`;
        const lines = doc.splitTextToSize(line, contentWidth - 10);
        optionBlocks.push(lines);
        optionsBlockHeight += lines.length * 4.4 + 1.5;
      });
    } else {
      optionsBlockHeight = 4 + 5 * 7; // label + 5 linhas
    }

    let imageHeight = 0;
    let imageDataUrl: string | null = null;
    if (q.image_url?.trim()) {
      imageDataUrl = await imageUrlToDataUrl(q.image_url.trim());
      if (imageDataUrl) imageHeight = 42;
    }

    const blockHeight =
      6 + // header
      enunciadoLines.length * 4.8 +
      3 +
      imageHeight +
      optionsBlockHeight +
      6;

    cursorY = ensureSpace(doc, cursorY, Math.min(blockHeight, 60), marginBottom);

    // Cabeçalho da questão
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(headerLabel, marginLeft, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(typeLabel, marginLeft + 10, cursorY);
    doc.text(pointsLabel, pageWidth - marginRight, cursorY, { align: "right" });
    cursorY += 5;

    // Enunciado
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(17, 24, 39);
    for (const line of enunciadoLines) {
      cursorY = ensureSpace(doc, cursorY, 6, marginBottom);
      doc.text(line, marginLeft + 2, cursorY);
      cursorY += 4.8;
    }
    cursorY += 2;

    if (imageDataUrl) {
      cursorY = ensureSpace(doc, cursorY, imageHeight + 4, marginBottom);
      try {
        const imgW = Math.min(contentWidth * 0.7, 120);
        const imgH = 38;
        doc.addImage(imageDataUrl, "JPEG", marginLeft + 2, cursorY, imgW, imgH);
        cursorY += imgH + 3;
      } catch {
        try {
          const imgW = Math.min(contentWidth * 0.7, 120);
          const imgH = 38;
          doc.addImage(imageDataUrl, "PNG", marginLeft + 2, cursorY, imgW, imgH);
          cursorY += imgH + 3;
        } catch {
          // ignora imagem inválida
        }
      }
    }

    if (q.type === "multiple_choice") {
      doc.setFontSize(10);
      optionBlocks.forEach((lines) => {
        lines.forEach((line, lineIdx) => {
          cursorY = ensureSpace(doc, cursorY, 6, marginBottom);
          doc.setFont("helvetica", lineIdx === 0 ? "bold" : "normal");
          if (lineIdx === 0) {
            // Marca A) em negrito e resto normal — simplificado: linha inteira normal
            doc.setFont("helvetica", "normal");
          }
          doc.setTextColor(17, 24, 39);
          doc.text(line, marginLeft + 4, cursorY);
          cursorY += 4.4;
        });
        cursorY += 1.2;
      });
    } else {
      cursorY = ensureSpace(doc, cursorY, 8, marginBottom);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("Resposta:", marginLeft + 2, cursorY);
      cursorY += 4;
      doc.setDrawColor(148, 163, 184);
      for (let i = 0; i < 5; i += 1) {
        cursorY = ensureSpace(doc, cursorY, 8, marginBottom);
        doc.line(marginLeft + 2, cursorY, pageWidth - marginRight, cursorY);
        cursorY += 7;
      }
    }

    // Separador
    cursorY += 2;
    cursorY = ensureSpace(doc, cursorY, 4, marginBottom);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
    cursorY += 6;
  }

  // Folha de respostas (objetivas)
  const objectiveCount = sorted.filter((q) => q.type === "multiple_choice").length;
  if (objectiveCount > 0) {
    doc.addPage();
    cursorY = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Folha de Respostas", marginLeft, cursorY);
    cursorY += 4;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
    cursorY += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Marque com X a alternativa escolhida em cada questão.", marginLeft, cursorY);
    cursorY += 8;

    const colWidth = contentWidth / 2;
    let col = 0;
    let rowY = cursorY;

    sorted.forEach((q, idx) => {
      if (q.type !== "multiple_choice") return;
      const x = marginLeft + col * colWidth;
      const y = rowY;

      if (y > doc.internal.pageSize.getHeight() - marginBottom - 10) {
        doc.addPage();
        rowY = 18;
        col = 0;
      }

      const drawY = col === 0 ? rowY : rowY;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(String(idx + 1), x + 8, drawY, { align: "right" });

      ["A", "B", "C", "D", "E"].forEach((letter, letterIdx) => {
        const boxX = x + 12 + letterIdx * 12;
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(0.4);
        doc.roundedRect(boxX, drawY - 3.5, 7, 6, 1, 1, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(letter, boxX + 3.5, drawY + 0.5, { align: "center" });
      });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(x, drawY + 4, x + colWidth - 6, drawY + 4);

      if (col === 0) {
        col = 1;
      } else {
        col = 0;
        rowY += 10;
      }
    });

    if (col === 1) rowY += 10;
    cursorY = rowY + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Documento gerado para impressão • ${meta.title || "Simulado"}`,
      pageWidth / 2,
      Math.min(cursorY, doc.internal.pageSize.getHeight() - 10),
      { align: "center" },
    );
  }

  doc.save(`prova-${safeTitleSlug(meta.title)}.pdf`);
}
