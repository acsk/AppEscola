import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BASE_URL } from './api';
import { storage, STORAGE_KEYS } from './storage';
import { formatExamDuration, type SimuladoDetail, type Question } from './simulados.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function textBlocksHtml(value: string | number | null | undefined): string {
  const text = escapeHtml(value);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '';

  return paragraphs
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function letraOpcao(index: number): string {
  return String.fromCharCode(65 + index); // A, B, C, ...
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function plainText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function textParagraphs(value: string | number | null | undefined): string[] {
  return plainText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function nomeArquivoPdf(title: string | null | undefined): string {
  const base = plainText(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${base || 'simulado'}.pdf`;
}

function resolveImageUrl(uri: string): string {
  const value = uri.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  const base = BASE_URL.replace(/\/+$/, '');
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${base}${path}`;
}

function imageUrlCandidates(uri: string): string[] {
  const resolved = resolveImageUrl(uri);
  const candidates = [resolved];
  const storagePathMatch = resolved.match(/\/storage\/(.+)$/);

  if (storagePathMatch?.[1]) {
    candidates.unshift(`${BASE_URL.replace(/\/+$/, '')}/api/media/storage/${storagePathMatch[1]}`);
  }

  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    resolved.startsWith('http://')
  ) {
    candidates.unshift(`https://${resolved.slice('http://'.length)}`);
  }

  return Array.from(new Set(candidates));
}

// ── Geração de HTML ───────────────────────────────────────────────────────────

function questaoHtml(q: Question, numero: number): string {
  const opcoes = (q.options ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const imagem = q.image_url
    ? `<div class="question-image"><img src="${escapeHtml(q.image_url)}" alt="Imagem da questão ${numero}"/></div>`
    : '';

  const corpo =
    q.type === 'multiple_choice'
      ? `<ol class="options">
          ${opcoes
            .map(
              (op, idx) => `
            <li>
              <span class="opt-marker">${letraOpcao(idx)})</span>
              <div class="opt-text">${textBlocksHtml(op.option_text)}</div>
            </li>`,
            )
            .join('')}
        </ol>
        ${
          q.allow_text_answer
            ? `<div class="answer-area">
                <div class="answer-label">Justificativa / Resposta:</div>
                <div class="answer-lines">
                  ${'<div class="line"></div>'.repeat(4)}
                </div>
              </div>`
            : ''
        }`
      : `<div class="answer-area">
          <div class="answer-label">Resposta:</div>
          <div class="answer-lines">
            ${'<div class="line"></div>'.repeat(8)}
          </div>
        </div>`;

  return `
    <article class="question">
      <header class="question-header">
        <span class="q-number">${numero}.</span>
        ${q.subject ? `<span class="q-subject">${escapeHtml(q.subject.name)}</span>` : ''}
        <span class="q-type">${q.type === 'essay' ? 'Discursiva' : 'Objetiva'}</span>
        <span class="q-points">${q.points} pt${q.points !== 1 ? 's' : ''}</span>
      </header>
      <div class="question-text">${textBlocksHtml(q.question_text)}</div>
      ${imagem}
      ${corpo}
    </article>
  `;
}

function gabaritoVazioHtml(total: number): string {
  if (total === 0) return '';
  const linhas = Array.from({ length: total }, (_, i) => {
    const numero = i + 1;
    return `
      <div class="gab-item">
        <span class="gab-num">${numero}</span>
        <span class="gab-cell">A</span>
        <span class="gab-cell">B</span>
        <span class="gab-cell">C</span>
        <span class="gab-cell">D</span>
        <span class="gab-cell">E</span>
      </div>`;
  }).join('');

  return `
    <section class="gabarito page-break">
      <h2>Folha de Respostas</h2>
      <p class="gab-instr">Marque com X a alternativa escolhida em cada questão.</p>
      <div class="gab-grid">${linhas}</div>
    </section>
  `;
}

export function gerarHtmlSimulado(detalhe: SimuladoDetail): string {
  const questoes = (detalhe.questions ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const totalObjetivas = questoes.filter((q) => q.type === 'multiple_choice').length;

  const meta: Array<[string, string]> = [];
  if (detalhe.course?.name) meta.push(['Curso', detalhe.course.name]);
  if (detalhe.subject?.name) meta.push(['Disciplina', detalhe.subject.name]);
  if (detalhe.exam_type_label) meta.push(['Tipo', detalhe.exam_type_label]);
  meta.push(['Duração', formatExamDuration(detalhe.duration_minutes)]);
  meta.push(['Questões', String(detalhe.total_questions)]);
  meta.push(['Pontuação total', String(detalhe.total_points)]);
  if (detalhe.starts_at) meta.push(['Início', formatDate(detalhe.starts_at)]);
  if (detalhe.ends_at) meta.push(['Prazo', formatDate(detalhe.ends_at)]);

  const metaHtml = meta
    .map(
      ([label, valor]) =>
        `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}:</span> <span class="meta-value">${escapeHtml(valor)}</span></div>`,
    )
    .join('');

  const questoesHtml = questoes.map((q, idx) => questaoHtml(q, idx + 1)).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(detalhe.title)}</title>
  <style>
    @page { margin: 18mm 16mm 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      font-size: 12pt;
      line-height: 1.45;
      margin: 0;
    }
    h1, h2, h3 { color: #0F172A; margin: 0; }
    .header {
      border-bottom: 2px solid #0F172A;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header h1 {
      font-size: 18pt;
      margin-bottom: 6px;
    }
    .header .desc {
      color: #475569;
      font-size: 11pt;
      margin-top: 6px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px 18px;
      margin: 12px 0 6px 0;
      font-size: 10.5pt;
      color: #334155;
    }
    .meta-label { font-weight: 600; color: #1F2937; }
    .student-block {
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 10px 12px;
      margin: 14px 0 18px 0;
      font-size: 10.5pt;
    }
    .student-line {
      display: flex;
      gap: 24px;
      margin: 6px 0;
    }
    .student-line .field {
      flex: 1;
      border-bottom: 1px solid #475569;
      padding-bottom: 2px;
    }
    .student-line .field-label {
      font-weight: 600;
      margin-right: 6px;
      color: #1F2937;
    }
    .question {
      margin: 16px 0 20px 0;
      padding-bottom: 12px;
      border-bottom: 1px solid #E2E8F0;
      page-break-inside: avoid;
    }
    .question:last-child { border-bottom: 0; }
    .question-header {
      display: flex;
      align-items: baseline;
      margin-bottom: 8px;
      font-size: 10.5pt;
      color: #475569;
      page-break-after: avoid;
    }
    .q-number {
      font-weight: 700;
      color: #0F172A;
      font-size: 12pt;
      min-width: 24px;
    }
    .q-subject, .q-type, .q-points {
      background: #F1F5F9;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 9.5pt;
      margin-left: 10px;
    }
    .q-points { margin-left: auto; font-weight: 600; color: #0F172A; }
    .question-text {
      margin: 0 0 10px 0;
      text-align: justify;
      color: #111827;
      line-height: 1.55;
    }
    .question-text p {
      margin: 0 0 7px 0;
    }
    .question-text p:last-child {
      margin-bottom: 0;
    }
    .question-image {
      margin: 8px 0 12px 0;
      text-align: left;
    }
    .question-image img {
      display: block;
      max-width: 100%;
      max-height: 90mm;
      object-fit: contain;
      margin: 0;
    }
    .options {
      list-style: none;
      padding-left: 0;
      margin: 8px 0 0 0;
    }
    .options li {
      display: flex;
      margin: 6px 0;
      align-items: flex-start;
      line-height: 1.45;
    }
    .opt-marker {
      font-weight: 700;
      min-width: 22px;
      color: #0F172A;
      margin-right: 8px;
    }
    .opt-text {
      flex: 1;
    }
    .opt-text p {
      margin: 0 0 4px 0;
    }
    .opt-text p:last-child {
      margin-bottom: 0;
    }
    .answer-area {
      margin-top: 10px;
    }
    .answer-label {
      font-size: 10pt;
      color: #475569;
      margin-bottom: 4px;
    }
    .answer-lines .line {
      border-bottom: 1px solid #94A3B8;
      height: 20px;
      margin-bottom: 4px;
    }
    .page-break { page-break-before: always; }
    .gabarito h2 {
      font-size: 14pt;
      border-bottom: 1px solid #0F172A;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .gab-instr {
      color: #475569;
      font-size: 10.5pt;
      margin: 0 0 12px 0;
    }
    .gab-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px 24px;
    }
    .gab-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border-bottom: 1px dotted #CBD5E1;
    }
    .gab-num {
      width: 26px;
      font-weight: 700;
      text-align: right;
      padding-right: 6px;
    }
    .gab-cell {
      width: 22px;
      height: 22px;
      border: 1px solid #475569;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10pt;
      color: #475569;
    }
    .footer-note {
      margin-top: 14px;
      font-size: 9.5pt;
      color: #64748B;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>${escapeHtml(detalhe.title)}</h1>
    <div class="meta">${metaHtml}</div>
    ${detalhe.description ? `<div class="desc">${nl2br(detalhe.description)}</div>` : ''}
  </header>

  <section class="student-block">
    <div class="student-line">
      <div class="field"><span class="field-label">Aluno(a):</span></div>
      <div class="field" style="flex: 0 0 30%;"><span class="field-label">Data:</span></div>
    </div>
    <div class="student-line">
      <div class="field"><span class="field-label">Turma:</span></div>
      <div class="field" style="flex: 0 0 30%;"><span class="field-label">Nota:</span></div>
    </div>
  </section>

  <main>${questoesHtml}</main>

  ${gabaritoVazioHtml(totalObjetivas)}

  <p class="footer-note">Documento gerado para impressão • ${escapeHtml(detalhe.title)}</p>
</body>
</html>`;
}

// ── Ações públicas ────────────────────────────────────────────────────────────

async function imageToDataUrl(uri: string): Promise<{ dataUrl: string; width: number; height: number; format: string } | null> {
  const urls = imageUrlCandidates(uri);
  const token = await storage.getItem(STORAGE_KEYS.TOKEN);
  const requestOptions: RequestInit[] = [
    {
      headers: {
        Accept: 'image/*',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    },
    {
      headers: { Accept: 'image/*' },
      credentials: 'include',
    },
  ];

  try {
    let response: Response | null = null;

    for (const url of urls) {
      for (const options of requestOptions) {
        try {
          const nextResponse = await fetch(url, options);
          if (nextResponse.ok) {
            response = nextResponse;
            break;
          }
        } catch {
          // Tenta a próxima estratégia sem interromper a geração do PDF.
        }
      }
      if (response) break;
    }

    if (!response) return null;

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });

    const mimeType = blob.type || dataUrl.match(/^data:([^;]+)/)?.[1] || '';
    const format = mimeType.includes('png') ? 'PNG' : mimeType.includes('webp') ? 'WEBP' : 'JPEG';

    return { dataUrl, format, ...dimensions };
  } catch (e) {
    console.warn('[PDF web] não foi possível carregar imagem', urls, e);
    return null;
  }
}

async function gerarPdfNaWeb(detalhe: SimuladoDetail): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (heightNeeded: number) => {
    if (y + heightNeeded <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const writeWrapped = (
    text: string,
    options: { x?: number; size?: number; style?: 'normal' | 'bold'; color?: [number, number, number]; maxWidth?: number; lineHeight?: number } = {},
  ) => {
    const x = options.x ?? margin;
    const size = options.size ?? 11;
    const lineHeight = options.lineHeight ?? size * 1.35;
    const maxWidth = options.maxWidth ?? contentWidth - (x - margin);
    doc.setFont('helvetica', options.style ?? 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(options.color ?? [17, 24, 39]));

    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    addPageIfNeeded(lines.length * lineHeight);
    doc.text(lines, x, y, { baseline: 'top' });
    y += lines.length * lineHeight;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  writeWrapped(detalhe.title, { size: 18, style: 'bold', lineHeight: 24 });
  y += 8;

  const meta: Array<[string, string]> = [];
  if (detalhe.course?.name) meta.push(['Curso', detalhe.course.name]);
  if (detalhe.subject?.name) meta.push(['Disciplina', detalhe.subject.name]);
  if (detalhe.exam_type_label) meta.push(['Tipo', detalhe.exam_type_label]);
  meta.push(['Duração', formatExamDuration(detalhe.duration_minutes)]);
  meta.push(['Questões', String(detalhe.total_questions)]);
  meta.push(['Pontuação total', String(detalhe.total_points)]);
  if (detalhe.starts_at) meta.push(['Início', formatDate(detalhe.starts_at)]);
  if (detalhe.ends_at) meta.push(['Prazo', formatDate(detalhe.ends_at)]);

  meta.forEach(([label, value], index) => {
    const col = index % 2;
    const rowY = y + Math.floor(index / 2) * 16;
    const x = margin + col * (contentWidth / 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(31, 41, 55);
    doc.text(`${label}:`, x, rowY, { baseline: 'top' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(value, x + 62, rowY, { baseline: 'top', maxWidth: contentWidth / 2 - 68 });
  });
  y += Math.ceil(meta.length / 2) * 16 + 12;

  if (detalhe.description) {
    textParagraphs(detalhe.description).forEach((paragraph) => {
      writeWrapped(paragraph, { size: 10.5, color: [71, 85, 105], lineHeight: 15 });
      y += 4;
    });
  }

  y += 8;
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(31, 41, 55);
  doc.text('Aluno(a):', margin + 10, y + 12, { baseline: 'top' });
  doc.text('Data:', margin + contentWidth * 0.7, y + 12, { baseline: 'top' });
  doc.text('Turma:', margin + 10, y + 34, { baseline: 'top' });
  doc.text('Nota:', margin + contentWidth * 0.7, y + 34, { baseline: 'top' });
  doc.line(margin + 68, y + 24, margin + contentWidth * 0.65, y + 24);
  doc.line(margin + contentWidth * 0.75, y + 24, margin + contentWidth - 10, y + 24);
  doc.line(margin + 58, y + 46, margin + contentWidth * 0.65, y + 46);
  doc.line(margin + contentWidth * 0.74, y + 46, margin + contentWidth - 10, y + 46);
  y += 76;

  const questoes = (detalhe.questions ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const [idx, q] of questoes.entries()) {
    addPageIfNeeded(80);
    const numero = idx + 1;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 8, pageWidth - margin, y - 8);

    const badges = [
      q.subject?.name,
      q.type === 'essay' ? 'Discursiva' : 'Objetiva',
      `${q.points} pt${q.points !== 1 ? 's' : ''}`,
    ].filter(Boolean).join('  •  ');

    writeWrapped(`${numero}. ${badges}`, { size: 10.5, style: 'bold', color: [15, 23, 42], lineHeight: 15 });
    y += 4;

    const paragraphs = textParagraphs(q.question_text);
    if (paragraphs.length) {
      paragraphs.forEach((paragraph) => {
        writeWrapped(paragraph, { size: 11, lineHeight: 16 });
        y += 4;
      });
    }

    if (q.image_url) {
      const image = await imageToDataUrl(q.image_url);
      if (image) {
        const imageWidth = Math.min(contentWidth, 360);
        const imageHeight = Math.min((imageWidth * image.height) / image.width, 255);
        addPageIfNeeded(imageHeight + 14);
        doc.addImage(image.dataUrl, image.format, margin, y, imageWidth, imageHeight);
        y += imageHeight + 12;
      }
    }

    if (q.type === 'multiple_choice') {
      const opcoes = (q.options ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      opcoes.forEach((op, optionIndex) => {
        const marker = `${letraOpcao(optionIndex)})`;
        const optionText = plainText(op.option_text).trim();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        addPageIfNeeded(18);
        doc.text(marker, margin, y, { baseline: 'top' });
        writeWrapped(optionText || ' ', { x: margin + 28, size: 10.5, maxWidth: contentWidth - 28, lineHeight: 15 });
        y += 2;
      });

      if (q.allow_text_answer) {
        y += 6;
        writeWrapped('Justificativa / Resposta:', { size: 9.5, color: [71, 85, 105], lineHeight: 13 });
        for (let i = 0; i < 4; i += 1) {
          addPageIfNeeded(20);
          doc.line(margin, y + 12, pageWidth - margin, y + 12);
          y += 20;
        }
      }
    } else {
      y += 6;
      writeWrapped('Resposta:', { size: 9.5, color: [71, 85, 105], lineHeight: 13 });
      for (let i = 0; i < 8; i += 1) {
        addPageIfNeeded(20);
        doc.line(margin, y + 12, pageWidth - margin, y + 12);
        y += 20;
      }
    }

    y += 16;
  }

  const totalObjetivas = questoes.filter((q) => q.type === 'multiple_choice').length;
  if (totalObjetivas > 0) {
    doc.addPage();
    y = margin;
    writeWrapped('Folha de Respostas', { size: 14, style: 'bold', lineHeight: 20 });
    y += 8;
    writeWrapped('Marque com X a alternativa escolhida em cada questão.', { size: 10.5, color: [71, 85, 105], lineHeight: 15 });
    y += 10;

    for (let i = 0; i < totalObjetivas; i += 1) {
      addPageIfNeeded(28);
      const x = i % 2 === 0 ? margin : margin + contentWidth / 2;
      if (i % 2 === 0 && i > 0) y += 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(String(i + 1), x, y, { baseline: 'middle' });
      ['A', 'B', 'C', 'D', 'E'].forEach((letter, letterIndex) => {
        const cellX = x + 30 + letterIndex * 28;
        doc.rect(cellX, y - 9, 20, 20);
        doc.text(letter, cellX + 6, y - 3, { baseline: 'top' });
      });
    }
  }

  doc.save(nomeArquivoPdf(detalhe.title));
}

export async function gerarPdfSimulado(detalhe: SimuladoDetail): Promise<void> {
  if (Platform.OS === 'web') {
    await gerarPdfNaWeb(detalhe);
    return;
  }

  // Mobile: gera arquivo PDF e oferece compartilhamento
  const html = gerarHtmlSimulado(detalhe);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: detalhe.title,
    });
  }
}
