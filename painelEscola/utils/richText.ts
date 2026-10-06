/**
 * Formatação leve de questões: texto puro + as tags <b>, <i> e <u> (sem atributos), quebras com "\n".
 * Qualquer outro "<" é texto literal (ex.: "x < 3"). Mesmo formato normalizado pela API
 * (App\Support\QuestionRichText). Exibição: componente RichText (nunca innerHTML com o valor cru).
 */

export type RichMark = "b" | "i" | "u";

export type RichSegment = { text: string; b: boolean; i: boolean; u: boolean };

const TOKEN = /<(\/?)([biu])>/gi;

/** Divide o texto em trechos com a formatação ativa em cada um (tags sem par são ignoradas). */
export function parseRichText(text: string | null | undefined): RichSegment[] {
  const source = text ?? "";
  const depth: Record<RichMark, number> = { b: 0, i: 0, u: 0 };
  const segments: RichSegment[] = [];
  const push = (chunk: string) => {
    if (!chunk) return;
    const style = { b: depth.b > 0, i: depth.i > 0, u: depth.u > 0 };
    const last = segments[segments.length - 1];
    if (last && last.b === style.b && last.i === style.i && last.u === style.u) last.text += chunk;
    else segments.push({ text: chunk, ...style });
  };

  let cursor = 0;
  for (const match of source.matchAll(TOKEN)) {
    push(source.slice(cursor, match.index));
    const mark = match[2].toLowerCase() as RichMark;
    depth[mark] = match[1] ? Math.max(0, depth[mark] - 1) : depth[mark] + 1;
    cursor = (match.index ?? 0) + match[0].length;
  }
  push(source.slice(cursor));
  return segments;
}

/** Texto sem marcações (listagens com uma linha, validação de "vazio", busca). */
export function plainRichText(text: string | null | undefined): string {
  return (text ?? "").replace(TOKEN, "");
}

export function hasRichFormatting(text: string | null | undefined): boolean {
  return parseRichText(text).some((s) => s.b || s.i || s.u);
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Valor → HTML do editor (só b/i/u/br; o resto é escapado). */
export function richTextToHtml(text: string | null | undefined): string {
  return parseRichText(text)
    .map((s) => {
      let html = escapeHtml(s.text).replace(/\n/g, "<br>");
      if (s.u) html = `<u>${html}</u>`;
      if (s.i) html = `<i>${html}</i>`;
      if (s.b) html = `<b>${html}</b>`;
      return html;
    })
    .join("");
}

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);

type DomLike = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomLike>;
  style?: { fontWeight?: string; fontStyle?: string; textDecoration?: string; textDecorationLine?: string };
};

function marksOf(node: DomLike): RichMark[] {
  const marks: RichMark[] = [];
  const tag = node.nodeName.toUpperCase();
  const style = node.style;
  const weight = style?.fontWeight ?? "";
  if (tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600) marks.push("b");
  if (tag === "I" || tag === "EM" || style?.fontStyle === "italic") marks.push("i");
  if (tag === "U" || tag === "INS" || `${style?.textDecoration ?? ""} ${style?.textDecorationLine ?? ""}`.includes("underline")) {
    marks.push("u");
  }
  return marks;
}

/**
 * DOM do editor (ou HTML colado) → valor no formato da API. Só preserva negrito/itálico/sublinhado
 * (por tag ou estilo inline) e quebras de linha; o resto vira texto.
 */
export function domToRichText(root: DomLike): string {
  let out = "";
  const newline = () => {
    if (out !== "" && !out.endsWith("\n")) out += "\n";
  };

  const walk = (node: DomLike) => {
    if (node.nodeType === 3) {
      out += (node.textContent ?? "").replace(/ /g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName.toUpperCase();
    if (tag === "BR") {
      out += "\n";
      return;
    }
    if (tag === "SCRIPT" || tag === "STYLE") return;

    const block = BLOCK_TAGS.has(tag);
    if (block) newline();
    const marks = marksOf(node);
    marks.forEach((m) => (out += `<${m}>`));
    Array.from(node.childNodes).forEach(walk);
    [...marks].reverse().forEach((m) => (out += `</${m}>`));
    if (block) newline();
  };

  Array.from(root.childNodes).forEach(walk);
  return normalizeRichText(out);
}

/** Remove tags vazias/redundantes e a quebra final que o contentEditable deixa. */
export function normalizeRichText(text: string): string {
  let value = text;
  let previous: string;
  do {
    previous = value;
    value = value
      .replace(/<([biu])><\/\1>/g, "")
      .replace(/<\/([biu])><\1>/g, "");
  } while (value !== previous);
  return value.replace(/\n$/, "");
}
