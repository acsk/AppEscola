/**
 * Extração de texto para importação. O modal usa extractPdfPages e pdfDocumentText:
 * envia o texto integral à IA, responsável pela separação das questões.
 *
 * 1. `extractPdfPages`: lê o texto de cada página no navegador (pdf.js; a API não tem biblioteca de PDF).
 * 2. `prepareQuestionBlocks` (pura, testável): limpa cabeçalho/rodapé/número de página, desfaz hifenização,
 *    detecta o gabarito e divide o texto em um bloco por questão (numeração sequencial).
 * Compatibilidade com preparação de blocos para o endpoint textual ai/extract.
 */

export type PreparedBlock = {
  key: string;
  /** Número da questão no PDF (null quando não foi possível identificar). */
  number: number | null;
  text: string;
  /** Letra do gabarito encontrada no próprio PDF. */
  answerHint: string | null;
  /** Bloco acima do limite aceito pela API (precisa ser dividido/encurtado). */
  tooLong: boolean;
  /** Cita figura/gráfico/tabela/imagem: o PDF não traz a imagem como texto. */
  mentionsImage: boolean;
  include: boolean;
};

export type PreparedPdf = {
  pages: number;
  blocks: PreparedBlock[];
  /** Gabarito detectado (número → letra). */
  answerKey: Record<number, string>;
  /** Texto antes da 1ª questão (capa, instruções), descartado. */
  preambleChars: number;
  removedLines: number;
};

/** Limites espelhados da API (QuestionAiExtractRequest). */
export const MAX_BLOCK_CHARS = 8000;
export const BLOCKS_PER_REQUEST = 5;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;
export const MAX_DOCUMENT_CHARS = 120000;

export function pdfDocumentText(pages: string[]): string {
  if (!pages.some((text) => text.trim().length >= 15)) {
    throw new Error("O PDF não possui texto extraível. Para PDFs escaneados, aplique OCR antes de importar; as imagens serão anexadas manualmente.");
  }
  const text = pages.map((page, index) => `[PÁGINA ${index + 1}]\n${page.trim() || "[SEM TEXTO EXTRAÍVEL]"}`).join("\n\n");
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new Error(`O texto do PDF ultrapassa ${MAX_DOCUMENT_CHARS.toLocaleString("pt-BR")} caracteres. Divida o documento e tente novamente.`);
  }
  return text;
}

const PAGE_NUMBER = /^(?:p[aá]g(?:ina)?\.?\s*)?\d{1,3}(?:\s*(?:de|\/)\s*\d{1,3})?$/i;
const QUESTION_START = /^(?:quest[aã]o\s*)?(\d{1,3})\s*(?:[.)\-–:]|\s)\s*(?=\S)|^quest[aã]o\s*(\d{1,3})\s*$/i;
const ANSWER_KEY_TITLE = /^\s*(?:gabarito|respostas?)\b/i;
const ANSWER_PAIR = /(\d{1,3})\s*[-–.):=]?\s*([A-Ja-j])(?![A-Za-zÀ-ú])/g;
const IMAGE_HINT = /\b(figura|gr[aá]fico|imagem|tabela|mapa|charge|tirinha|ilustra[cç][aã]o|esquema)\b/i;

let seq = 0;
const nextKey = () => `blk-${Date.now()}-${seq++}`;

const normalizeLine = (line: string) => line.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

/** Linha "assinatura" para detectar cabeçalho/rodapé repetido (ignora números, ex.: "Página 3"). */
const signature = (line: string) => line.toLowerCase().replace(/\d+/g, "#");

export function prepareQuestionBlocks(pageTexts: string[]): PreparedPdf {
  const pages = pageTexts.map((text) => text.split(/\r?\n/).map(normalizeLine).filter(Boolean));

  // Cabeçalho/rodapé: linhas curtas que se repetem em pelo menos metade das páginas (com 3+ páginas).
  const repeated = new Set<string>();
  if (pages.length >= 3) {
    const counts = new Map<string, number>();
    pages.forEach((lines) => {
      new Set(lines.filter((l) => l.length <= 100).map(signature)).forEach((sig) => counts.set(sig, (counts.get(sig) ?? 0) + 1));
    });
    counts.forEach((count, sig) => count >= Math.ceil(pages.length / 2) && repeated.add(sig));
  }

  let removedLines = 0;
  // Limpeza por página (mantida para o modo "um bloco por página").
  const cleanPages: string[][] = pages.map(() => []);
  let last: { page: number; index: number } | null = null;
  pages.forEach((pageLines, p) =>
    pageLines.forEach((line) => {
      if (repeated.has(signature(line)) || PAGE_NUMBER.test(line)) {
        removedLines += 1;
        return;
      }
      // Hifenização de quebra de linha: "fotossín-" + "tese" → "fotossíntese".
      const prev = last ? cleanPages[last.page][last.index] : undefined;
      if (last && prev && /[A-Za-zÀ-ú]-$/.test(prev) && /^[a-zà-ú]/.test(line)) {
        cleanPages[last.page][last.index] = prev.slice(0, -1) + line;
        return;
      }
      cleanPages[p].push(line);
      last = { page: p, index: cleanPages[p].length - 1 };
    })
  );
  const lines = cleanPages.flat();

  // Gabarito: tudo a partir do título "Gabarito"/"Respostas" (procurado da metade do texto em diante).
  const answerKey: Record<number, string> = {};
  let bodyEnd = lines.length;
  for (let i = Math.floor(lines.length / 2); i < lines.length; i += 1) {
    if (ANSWER_KEY_TITLE.test(lines[i])) {
      const keyText = lines.slice(i).join(" ");
      for (const m of keyText.matchAll(ANSWER_PAIR)) answerKey[Number(m[1])] = m[2].toUpperCase();
      if (Object.keys(answerKey).length >= 2) bodyEnd = i;
      else Object.keys(answerKey).forEach((k) => delete answerKey[Number(k)]);
      break;
    }
  }

  // Divisão por numeração SEQUENCIAL (evita cortar em listas internas "1." de um enunciado).
  const blocks: { number: number | null; lines: string[] }[] = [];
  let preambleChars = 0;
  let expected: number | null = null;
  for (const line of lines.slice(0, bodyEnd)) {
    const m = line.match(QUESTION_START);
    const n = m ? Number(m[1] ?? m[2]) : null;
    const startsQuestion = n !== null && (expected === null ? n <= 5 : n === expected);
    if (startsQuestion) {
      blocks.push({ number: n, lines: [line] });
      expected = n! + 1;
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    } else {
      preambleChars += line.length;
    }
  }

  // Sem numeração reconhecível: um bloco por página (o professor junta/remove na revisão).
  const finalBlocks =
    blocks.length > 0
      ? blocks
      : cleanPages.map((pageLines) => ({ number: null, lines: pageLines })).filter((b) => b.lines.length);

  return {
    pages: pageTexts.length,
    answerKey,
    preambleChars: blocks.length > 0 ? preambleChars : 0,
    removedLines,
    blocks: finalBlocks.map((b) => {
      const text = b.lines.join("\n").trim();
      return {
        key: nextKey(),
        number: b.number,
        text,
        answerHint: b.number !== null ? answerKey[b.number] ?? null : null,
        tooLong: text.length > MAX_BLOCK_CHARS,
        mentionsImage: IMAGE_HINT.test(text),
        include: text.length >= 10,
      };
    }),
  };
}

/** Junta o bloco com o seguinte (correção manual de divisão errada). */
export function mergeWithNext(blocks: PreparedBlock[], key: string): PreparedBlock[] {
  const i = blocks.findIndex((b) => b.key === key);
  if (i < 0 || i >= blocks.length - 1) return blocks;
  const merged = `${blocks[i].text}\n${blocks[i + 1].text}`;
  const joined: PreparedBlock = {
    ...blocks[i],
    text: merged,
    answerHint: blocks[i].answerHint ?? blocks[i + 1].answerHint,
    tooLong: merged.length > MAX_BLOCK_CHARS,
    mentionsImage: IMAGE_HINT.test(merged),
  };
  return [...blocks.slice(0, i), joined, ...blocks.slice(i + 2)];
}

export function chunkBlocks<T>(items: T[], size = BLOCKS_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type PdfQuestionMark = { number: number; section: string | null; anchor: string };

const QUESTION_LINE = /^(?:quest[aã]o\s*)?(\d{1,3})\s*[.)\-–:]/i;
const OPTION_LINE = /^\(?([A-Ea-e])\)/;

/** Letras de alternativa na linha. "A), B), C) e D)" é a instrução da capa, não um gabarito. */
function optionLetters(line: string): string[] {
  const markers = [...line.matchAll(/(?:^|\s)\(?([A-Ea-e])\)/g)];
  if (!markers.length) return [];
  if (markers.length >= 2 && !/\d/.test(line.slice(0, 24)) && /[A-Ea-e]\)\s*,/i.test(line)) return [];
  return markers.map((marker) => marker[1].toUpperCase());
}
const SKIP_HEADING = /\b(?:texto|instru|gabarito|c[aá]lculo)\b/i;

function foldName(value: string): string {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
}

/** "Língua Portuguesa" e "POTUGUÊS" caem no mesmo núcleo para comparar com o catálogo. */
function subjectCore(value: string): string {
  return foldName(value).replace(/^lingua/, "");
}

function compactText(value: string): string {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu, "").replace(/<[^>]*>/g, "").replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = cost === 0 ? rows[i - 1][j - 1] : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

/** Título de matéria no PDF ("MATEMÁTICA", "POTUGUÊS") → nome do catálogo, quando for o mesmo. */
function resolveSubject(heading: string, subjectNames: string[]): string | null {
  const folded = subjectCore(heading);
  if (folded.length < 4) return null;
  let best: { name: string; distance: number } | null = null;
  for (const name of subjectNames) {
    const candidate = subjectCore(name);
    if (candidate.length < 4) continue;
    if (candidate.includes(folded) || folded.includes(candidate)) return name;
    const distance = editDistance(folded, candidate);
    if (distance <= 2 && (best === null || distance < best.distance)) best = { name, distance };
  }
  return best?.name ?? null;
}

function isSubjectHeading(line: string): boolean {
  if (line.length < 4 || line.length > 48 || /\d/.test(line) || SKIP_HEADING.test(line)) return false;
  const letters = line.replace(/[^A-Za-zÀ-ú]/g, "");
  if (letters.length < 4) return false;
  const upper = [...letters].filter((char) => char !== char.toLowerCase() && char === char.toUpperCase()).length;
  return upper / letters.length >= 0.7;
}

/**
 * Numeração do PDF por matéria. Português 1–20 e, depois do título Matemática, de novo 1–20.
 * Instruções numeradas e o gabarito final não entram.
 */
export function pdfQuestionMarks(pages: string[], subjectNames: string[] = []): PdfQuestionMark[] {
  const lines = pages.flatMap((page) => page.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean));
  const marks: PdfQuestionMark[] = [];
  let gabarito = false;
  let section: string | null = null;
  let heading: string | null = null;
  let previous: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^gabarito\b/i.test(line)) {
      gabarito = true;
      continue;
    }
    if (gabarito) continue;
    const namedSubject = line.length <= 48 && !/\d/.test(line) && !SKIP_HEADING.test(line)
      ? resolveSubject(line, subjectNames)
      : null;
    if (isSubjectHeading(line) || namedSubject) {
      heading = line;
      continue;
    }
    const match = line.match(QUESTION_LINE);
    if (!match) continue;
    const number = Number(match[1]);
    const letters = new Set<string>();
    for (let j = i + 1; j < lines.length; j += 1) {
      if (QUESTION_LINE.test(lines[j]) && !OPTION_LINE.test(lines[j])) break;
      optionLetters(lines[j]).forEach((letter) => letters.add(letter));
    }
    const hasOption = letters.size >= 2;
    const restart = previous !== null && number < previous && number <= 3;
    const sequential = previous === null ? number <= 5 : number === previous + 1;
    if (!hasOption || (!sequential && !restart)) continue;
    if ((restart || previous === null) && heading) {
      section = resolveSubject(heading, subjectNames) ?? heading;
    }
    heading = null;
    marks.push({ number, section, anchor: compactText(line.replace(QUESTION_LINE, "")).slice(0, 40) });
    previous = number;
  }
  return marks;
}

type NumberedQuestion = {
  source_number?: string | null;
  subject_id?: number | null;
  topic_ids?: number[];
  question_text?: string | null;
};

function withPdfMark<T extends NumberedQuestion>(
  question: T,
  mark: PdfQuestionMark,
  subjects: { id: number; name: string }[],
): T {
  const subject = mark.section
    ? subjects.find((item) => subjectCore(item.name) === subjectCore(mark.section!))
    : undefined;
  if (!subject || subject.id === question.subject_id) {
    return { ...question, source_number: String(mark.number) };
  }
  return { ...question, source_number: String(mark.number), subject_id: subject.id, topic_ids: [] };
}

/**
 * Grava o número da matéria (Português 1–20, Matemática 1–20) e a disciplina do trecho.
 * Com a mesma quantidade, a ordem do PDF vale. Num bloco parcial, o enunciado localiza a questão.
 */
export function applyPdfSections<T extends NumberedQuestion>(
  pages: string[],
  questions: T[],
  subjects: { id: number; name: string }[],
): T[] {
  const marks = pdfQuestionMarks(pages, subjects.map((subject) => subject.name));
  if (!marks.length) return questions;
  if (marks.length === questions.length) {
    return questions.map((question, index) => withPdfMark(question, marks[index], subjects));
  }
  const used = new Set<number>();
  return questions.map((question) => {
    const key = compactText((question.question_text ?? "").replace(/^(?:quest[aã]o\s*)?\d{1,3}\s*[.)\-–:]\s*/i, ""));
    if (key.length < 18) return question;
    const index = marks.findIndex((mark, at) => {
      if (used.has(at) || mark.anchor.length < 12) return false;
      return key.includes(mark.anchor) || mark.anchor.includes(key.slice(0, 28));
    });
    if (index < 0) return question;
    used.add(index);
    return withPdfMark(question, marks[index], subjects);
  });
}

/** Lê o texto de cada página do PDF no navegador (pdf.js do react-pdf, worker do CDN). */
/** Páginas por chamada à IA: provas longas numa chamada só fazem o modelo encurtar a lista de questões. */
export const PAGES_PER_AI_BLOCK = 2;

/** Blocos [from, to] (1-based) cobrindo todas as páginas. */
export function pageBlocks(pageCount: number, size = PAGES_PER_AI_BLOCK): { from: number; to: number }[] {
  const blocks: { from: number; to: number }[] = [];
  for (let from = 1; from <= pageCount; from += size) blocks.push({ from, to: Math.min(pageCount, from + size - 1) });
  return blocks;
}

/**
 * Mesma questão devolvida por dois blocos (página de contexto): compara o comando (último parágrafo,
 * sem o texto de apoio que um bloco pode ter anexado e o outro não) + alternativas.
 */
export function questionFingerprint(q: { question_text?: string | null; options?: { option_text?: string | null }[] }): string {
  const norm = (v?: string | null) => (v ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, "").toLowerCase();
  const command = norm((q.question_text ?? "").split(/\n\s*\n/).pop()).slice(-120);
  return `${command}|${(q.options ?? []).map((o) => norm(o.option_text).slice(0, 40)).join("|")}`;
}

/** Trecho de texto do pdf.js com posição (x/y da linha de base, em unidades do PDF; y cresce para cima). */
export type PdfTextItem = { str: string; x: number; y: number; width: number; height: number; hasEOL: boolean };

const FRACTION_PART = /^[\p{N}\p{L}.,()+\-−√π²³]{1,10}$/u;
const FRACTION_BAR = /^[\s\-–—_─]*$/;

const isFractionPart = (item: PdfTextItem) => {
  const s = item.str.trim();
  return item.height > 0 && FRACTION_PART.test(s) && (/\d/.test(s) || s.length <= 2);
};

/** Numerador e denominador centralizados um sobre o outro, a cerca de uma altura de letra de distância. */
function stacked(a: PdfTextItem, b: PdfTextItem): boolean {
  const h = Math.max(a.height, b.height);
  const ratio = a.height / b.height;
  const dy = Math.abs(a.y - b.y);
  const centerGap = Math.abs(a.x + a.width / 2 - (b.x + b.width / 2));
  return ratio >= 0.6 && ratio <= 1.67 && dy >= 0.4 * h && dy <= 1.6 * h && centerGap <= Math.max(a.width, b.width) / 2 + 0.3 * h;
}

/** Texto da frase na altura do traço da fração, ao lado dela: distingue fração de uma coluna de tabela. */
function hasMiddleNeighbor(items: PdfTextItem[], a: PdfTextItem, b: PdfTextItem): boolean {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y, b.y);
  const band = top - bottom;
  const h = Math.max(a.height, b.height);
  const left = Math.min(a.x, b.x) - 4 * h;
  const right = Math.max(a.x + a.width, b.x + b.width) + 4 * h;
  return items.some((k) => k !== a && k !== b && k.str.trim() !== "" && !FRACTION_BAR.test(k.str)
    && k.y > bottom + 0.15 * band && k.y < top - 0.15 * band
    && k.x + k.width >= left && k.x <= right);
}

/**
 * Frações empilhadas viram "1/100": o pdf.js entrega numerador e denominador como trechos separados
 * (com quebra de linha entre eles e, conforme o gerador do PDF, o denominador primeiro).
 * O numerador é o de cima, pela posição, não pela ordem no arquivo.
 */
export function joinStackedFractions(items: PdfTextItem[]): PdfTextItem[] {
  const removed = new Set<number>();
  const result = items.map((item) => ({ ...item }));
  for (let i = 0; i < items.length; i += 1) {
    if (removed.has(i) || !isFractionPart(items[i])) continue;
    const between: number[] = [];
    for (let j = i + 1; j < Math.min(items.length, i + 6); j += 1) {
      const b = items[j];
      if (FRACTION_BAR.test(b.str)) {
        between.push(j);
        continue;
      }
      if (isFractionPart(b) && stacked(items[i], b) && hasMiddleNeighbor(items, items[i], b)) {
        const [top, bottom] = items[i].y > b.y ? [items[i], b] : [b, items[i]];
        const left = Math.min(top.x, bottom.x);
        result[i] = {
          str: `${top.str.trim()}/${bottom.str.trim()}`,
          x: left,
          y: (top.y + bottom.y) / 2,
          width: Math.max(top.x + top.width, bottom.x + bottom.width) - left,
          height: Math.max(top.height, bottom.height),
          hasEOL: b.hasEOL,
        };
        [...between, j].forEach((k) => removed.add(k));
      }
      break;
    }
  }
  return result.filter((_, index) => !removed.has(index));
}

/** Linhas da página, de cima para baixo. Itens da mesma linha ficam da esquerda para a direita. */
function groupPdfLines(items: PdfTextItem[]): PdfTextItem[][] {
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  items.forEach((item) => {
    if (item.str === "") return;
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, item.height * 0.35));
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  });
  lines.sort((a, b) => b.y - a.y);
  lines.forEach((line) => line.items.sort((a, b) => a.x - b.x));
  return lines.map((line) => line.items);
}

/**
 * Meio da página com uma faixa vazia e texto dos dois lados: prova em duas colunas.
 * Título largo (uma seção centralizada) não conta, para não tapar o vão.
 */
function columnGap(items: PdfTextItem[], pageWidth: number): number | null {
  if (pageWidth < 200) return null;
  const bins = new Array(Math.ceil(pageWidth)).fill(0);
  items.forEach((item) => {
    if (item.width > pageWidth * 0.45 || item.y < 40) return;
    const from = Math.max(0, Math.floor(item.x));
    const to = Math.min(bins.length - 1, Math.ceil(item.x + Math.max(item.width, 1)));
    for (let x = from; x <= to; x += 1) bins[x] += 1;
  });
  const leftBound = Math.floor(pageWidth * 0.32);
  const rightBound = Math.floor(pageWidth * 0.68);
  let best: { mid: number; len: number } | null = null;
  let run: number | null = null;
  for (let x = leftBound; x <= rightBound; x += 1) {
    if (bins[x] === 0) {
      if (run === null) run = x;
    } else if (run !== null) {
      const len = x - run;
      if (len >= 16 && (best === null || len > best.len)) best = { mid: run + len / 2, len };
      run = null;
    }
  }
  if (best === null) return null;
  const left = items.filter((item) => item.x + item.width < best.mid).length;
  const right = items.filter((item) => item.x >= best.mid).length;
  return left >= 8 && right >= 8 ? best.mid : null;
}

/** Junta os trechos da linha. Espaço só quando há vão de palavra; "7"+"0" continua "70". */
function joinPdfLine(items: PdfTextItem[]): string {
  let text = "";
  let prev: PdfTextItem | null = null;
  items.forEach((item) => {
    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      const word = gap > Math.max(1.2, prev.height * 0.18);
      if (word && text !== "" && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
    }
    text += item.str;
    prev = item;
  });
  return text.replace(/[ \t]+/g, " ").trim();
}

/**
 * Ordem de leitura da página. Com duas colunas, a da esquerda vem inteira e depois a da direita:
 * a questão da coluna seguinte deixa de entrar na mesma linha da questão atual.
 */
export function layoutPageText(items: PdfTextItem[], pageWidth: number): string {
  const lines = groupPdfLines(items);
  const gap = columnGap(items, pageWidth);
  if (gap === null) return lines.map(joinPdfLine).filter(Boolean).join("\n");

  const left: string[] = [];
  const right: string[] = [];
  lines.forEach((line) => {
    const leftItems = line.filter((item) => item.x < gap);
    const rightItems = line.filter((item) => item.x >= gap);
    const leftText = joinPdfLine(leftItems);
    const rightText = joinPdfLine(rightItems);
    if (leftText) left.push(leftText);
    if (rightText) right.push(rightText);
  });
  return [...left, ...right].join("\n");
}

export async function extractPdfPages(file: File): Promise<string[]> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`O PDF tem ${pdf.numPages} páginas. Importe no máximo ${MAX_PDF_PAGES} páginas por vez.`);
    }
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const items: PdfTextItem[] = content.items.flatMap((item) => ("str" in item
          ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, hasEOL: item.hasEOL }]
          : []));
        pages.push(layoutPageText(joinStackedFractions(items), viewport.width));
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
