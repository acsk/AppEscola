/**
 * Formatação leve de questões (mesmo formato do painel e da API — App\Support\QuestionRichText):
 * texto puro + as tags <b>, <i> e <u> (sem atributos), quebras com "\n". Qualquer outro "<" é texto literal.
 */

export type RichSegment = { text: string; b: boolean; i: boolean; u: boolean };

type Mark = 'b' | 'i' | 'u';

const TOKEN = /<(\/?)([biu])>/gi;

/** Divide o texto em trechos com a formatação ativa em cada um (tags sem par são ignoradas). */
export function parseRichText(text: string | null | undefined): RichSegment[] {
  const source = text ?? '';
  const depth: Record<Mark, number> = { b: 0, i: 0, u: 0 };
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
    const mark = match[2].toLowerCase() as Mark;
    depth[mark] = match[1] ? Math.max(0, depth[mark] - 1) : depth[mark] + 1;
    cursor = (match.index ?? 0) + match[0].length;
  }
  push(source.slice(cursor));
  return segments;
}

/** Texto sem marcações (PDF em texto puro, acessibilidade, buscas). */
export function plainRichText(text: string | null | undefined): string {
  return (text ?? '').replace(TOKEN, '');
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** HTML seguro (só b/i/u; todo o resto escapado) para o PDF em HTML. Quebras de linha ficam como "\n". */
export function richTextToSafeHtml(text: string | null | undefined): string {
  return parseRichText(text)
    .map((s) => {
      let html = escapeHtml(s.text);
      if (s.u) html = `<u>${html}</u>`;
      if (s.i) html = `<i>${html}</i>`;
      if (s.b) html = `<b>${html}</b>`;
      return html;
    })
    .join('');
}
