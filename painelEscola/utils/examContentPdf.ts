import { plainRichText } from "./richText";
import { Alert, Platform } from "react-native";
import jsPDF from "jspdf";
import type { ExamPreviewPlayerQuestion } from "../types/simulados";
import {
  drawTenantPdfHeader,
  imageUrlToDataUrl,
} from "./pdfTenantLetterhead";
import {
  PDF_COLOR,
  PDF_MARGIN,
  PDF_TYPE,
  drawDocumentTitle,
  drawFactsStrip,
  drawPageFooters,
  drawRule,
  setText,
} from "./pdfTheme";

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

/** Rótulo legível: se vier só o código ("vestibular"), capitaliza. */
function humanize(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "—";
  return text === text.toLowerCase() ? text.charAt(0).toUpperCase() + text.slice(1).replace(/[_-]+/g, " ") : text;
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

function ensureSpace(doc: jsPDF, cursorY: number, needed: number, marginBottom: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed <= pageHeight - marginBottom) return cursorY;
  doc.addPage();
  return PDF_MARGIN + 4;
}

/** Linha de preenchimento ("Nome: ______") em `border-strong`. */
function drawFillLine(doc: jsPDF, label: string, x: number, y: number, width: number) {
  setText(doc, PDF_COLOR.inkMuted, PDF_TYPE.label);
  doc.text(label, x, y);
  const labelWidth = doc.getTextWidth(label) + 2;
  doc.setDrawColor(...PDF_COLOR.borderStrong);
  doc.setLineWidth(0.2);
  doc.line(x + labelWidth, y + 0.8, x + width, y + 0.8);
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
  const marginLeft = PDF_MARGIN;
  const marginRight = PDF_MARGIN;
  const marginBottom = 18; // espaço do rodapé
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginLeft - marginRight;

  let cursorY = await drawTenantPdfHeader(doc, { marginLeft, marginRight, showGeneratedAt: false });
  cursorY = drawDocumentTitle(doc, cursorY, {
    overline: "Simulado",
    title: meta.title || "Simulado",
    description: meta.courses?.length ? `Curso${meta.courses.length > 1 ? "s" : ""}: ${meta.courses.join(", ")}` : null,
  });

  // Faixa de resumo
  cursorY = drawFactsStrip(doc, cursorY, [
    { label: "Modalidade", value: humanize(meta.exam_type_label ?? meta.exam_type) },
    { label: "Disciplina", value: meta.subject ?? "Geral" },
    { label: "Questões", value: String(sorted.length) },
    { label: "Pontuação", value: meta.total_points != null ? String(meta.total_points) : "—" },
    { label: "Duração", value: formatDuration(meta.duration_minutes) },
  ]);

  if (meta.description?.trim()) {
    setText(doc, PDF_COLOR.inkMuted, PDF_TYPE.label);
    const descLines = doc.splitTextToSize(meta.description.trim(), contentWidth);
    doc.text(descLines, marginLeft, cursorY);
    cursorY += descLines.length * 3.8 + 2;
  }

  // Identificação do aluno (prova impressa)
  cursorY += 2;
  drawFillLine(doc, "Aluno(a):", marginLeft, cursorY, contentWidth * 0.62);
  drawFillLine(doc, "Turma:", marginLeft + contentWidth * 0.66, cursorY, contentWidth * 0.34);
  cursorY += 7;
  drawFillLine(doc, "Data:", marginLeft, cursorY, contentWidth * 0.3);
  drawFillLine(doc, "Nota:", marginLeft + contentWidth * 0.66, cursorY, contentWidth * 0.34);
  cursorY += 5;
  drawRule(doc, cursorY);
  cursorY += 7;

  // Questões
  for (let index = 0; index < sorted.length; index += 1) {
    const q = sorted[index];
    const number = index + 1;
    const enunciado = plainRichText(q.question_text).trim() || (q.image_url ? "" : "[Sem enunciado]");
    const options = [...(q.options ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    setText(doc, PDF_COLOR.ink, PDF_TYPE.body);
    const enunciadoLines: string[] = enunciado ? doc.splitTextToSize(enunciado, contentWidth) : [];

    // Imagem na proporção original (largura máx. 70% da página, altura máx. 80 mm)
    let image: { dataUrl: string; w: number; h: number; format: string } | null = null;
    if (q.image_url?.trim()) {
      const dataUrl = await imageUrlToDataUrl(q.image_url.trim());
      if (dataUrl) {
        try {
          const props = doc.getImageProperties(dataUrl);
          const maxW = contentWidth * 0.7;
          const maxH = 80;
          const ratio = Math.min(maxW / props.width, maxH / props.height);
          image = { dataUrl, w: props.width * ratio, h: props.height * ratio, format: props.fileType || "PNG" };
        } catch {
          image = null;
        }
      }
    }

    // Cabeçalho + enunciado + início das alternativas juntos (evita "Questão N" sozinho no fim da página)
    cursorY = ensureSpace(doc, cursorY, 8 + Math.min(enunciadoLines.length, 4) * 4.8 + (image ? Math.min(image.h, 40) : 0), marginBottom);

    setText(doc, PDF_COLOR.brand, PDF_TYPE.subtitle, "bold");
    doc.text(`Questão ${number}`, marginLeft, cursorY);
    setText(doc, PDF_COLOR.inkSubtle, PDF_TYPE.caption);
    const pointsLabel = `${q.type === "essay" ? "Discursiva" : "Objetiva"} · ${q.points ?? 0} pt${Number(q.points) === 1 ? "" : "s"}`;
    doc.text(pointsLabel, pageWidth - marginRight, cursorY, { align: "right" });
    cursorY += 6;

    setText(doc, PDF_COLOR.ink, PDF_TYPE.body);
    for (const line of enunciadoLines) {
      cursorY = ensureSpace(doc, cursorY, 6, marginBottom);
      doc.text(line, marginLeft, cursorY);
      cursorY += 4.8;
    }
    if (enunciadoLines.length) cursorY += 2;

    if (image) {
      cursorY = ensureSpace(doc, cursorY, image.h + 4, marginBottom);
      try {
        doc.addImage(image.dataUrl, image.format, marginLeft, cursorY, image.w, image.h);
        cursorY += image.h + 4;
      } catch {
        // imagem inválida: segue sem ela
      }
    }

    if (q.type === "multiple_choice") {
      options.forEach((op, opIdx) => {
        setText(doc, PDF_COLOR.ink, PDF_TYPE.body);
        const lines: string[] = doc.splitTextToSize(plainRichText(op.option_text), contentWidth - 9);
        lines.forEach((line, lineIdx) => {
          cursorY = ensureSpace(doc, cursorY, 6, marginBottom);
          if (lineIdx === 0) {
            setText(doc, PDF_COLOR.inkMuted, PDF_TYPE.body, "bold");
            doc.text(`${optionLetter(opIdx)})`, marginLeft + 1, cursorY);
          }
          setText(doc, PDF_COLOR.ink, PDF_TYPE.body);
          doc.text(line, marginLeft + 8, cursorY);
          cursorY += 4.6;
        });
        cursorY += 1.4;
      });
    } else {
      cursorY = ensureSpace(doc, cursorY, 10, marginBottom);
      setText(doc, PDF_COLOR.inkMuted, PDF_TYPE.label);
      doc.text("Resposta", marginLeft, cursorY);
      cursorY += 5;
      for (let i = 0; i < 6; i += 1) {
        cursorY = ensureSpace(doc, cursorY, 8, marginBottom);
        drawRule(doc, cursorY, { color: PDF_COLOR.border });
        cursorY += 7;
      }
    }

    cursorY += 2;
    if (index < sorted.length - 1) {
      cursorY = ensureSpace(doc, cursorY, 4, marginBottom);
      drawRule(doc, cursorY);
      cursorY += 7;
    }
  }

  drawPageFooters(doc, meta.title || "Simulado");
  doc.save(`prova-${safeTitleSlug(meta.title)}.pdf`);
}
