import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
              <span class="opt-text">${nl2br(op.option_text)}</span>
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
      <div class="question-text">${nl2br(q.question_text)}</div>
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
      margin: 14px 0 18px 0;
      page-break-inside: avoid;
    }
    .question-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 6px;
      font-size: 10.5pt;
      color: #475569;
    }
    .q-number {
      font-weight: 700;
      color: #0F172A;
      font-size: 12pt;
    }
    .q-subject, .q-type, .q-points {
      background: #F1F5F9;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 9.5pt;
    }
    .q-points { margin-left: auto; font-weight: 600; color: #0F172A; }
    .question-text {
      margin: 6px 0 8px 0;
      text-align: justify;
    }
    .question-image {
      margin: 8px 0;
      text-align: center;
    }
    .question-image img {
      max-width: 100%;
      max-height: 90mm;
      object-fit: contain;
    }
    .options {
      list-style: none;
      padding-left: 6px;
      margin: 6px 0;
    }
    .options li {
      display: flex;
      gap: 8px;
      margin: 4px 0;
      align-items: flex-start;
    }
    .opt-marker {
      font-weight: 700;
      min-width: 18px;
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

function imprimirNaWeb(html: string, titulo: string): void {
  // Usa um iframe oculto para imprimir SOMENTE o HTML do simulado,
  // sem abrir nenhuma janela visível para o usuário.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.title = titulo;
  document.body.appendChild(iframe);

  let limpou = false;
  const cleanup = () => {
    if (limpou) return;
    limpou = true;
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
    }, 1000);
  };

  const disparar = () => {
    try {
      const cw = iframe.contentWindow;
      if (!cw) { cleanup(); return; }
      cw.focus();
      // Pequeno delay para garantir que imagens/estilos estejam aplicados.
      setTimeout(() => {
        try {
          cw.print();
        } catch (e) {
          console.warn('[PDF web] print() falhou', e);
        }
        cleanup();
      }, 350);
    } catch (e) {
      console.warn('[PDF web] iframe falhou', e);
      cleanup();
    }
  };

  iframe.onload = disparar;

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    // Em alguns navegadores o onload não dispara para document.write — fallback por timer
    setTimeout(() => {
      if (!limpou) disparar();
    }, 1500);
  } else {
    cleanup();
  }
}

export async function gerarPdfSimulado(detalhe: SimuladoDetail): Promise<void> {
  const html = gerarHtmlSimulado(detalhe);

  if (Platform.OS === 'web') {
    imprimirNaWeb(html, detalhe.title);
    return;
  }

  // Mobile: gera arquivo PDF e oferece compartilhamento
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: detalhe.title,
    });
  }
}
