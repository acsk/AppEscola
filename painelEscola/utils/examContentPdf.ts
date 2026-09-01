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

  // Título compacto
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(meta.title || "Simulado", contentWidth);
  doc.text(titleLines, marginLeft, cursorY);
  cursorY += titleLines.length * 4.2 + 1.5;

  // Metadados em uma linha compacta
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
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const metaText = metaParts.join("  ·  ");
  const metaLines = doc.splitTextToSize(metaText, contentWidth);
  doc.text(metaLines, marginLeft, cursorY);
  cursorY += metaLines.length * 3.4 + 1;

  if (meta.description?.trim()) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const descLines = doc.splitTextToSize(meta.description.trim(), contentWidth);
    doc.text(descLines, marginLeft, cursorY);
    cursorY += descLines.length * 3.4 + 1;
  }

  // Separação antes das questões
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
  cursorY += 5;

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

  doc.save(`prova-${safeTitleSlug(meta.title)}.pdf`);
}
