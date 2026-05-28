/**
 * Padrão visual de tabelas desktop no painel (ver painel-escola.md).
 * Mesmo tamanho de fonte no cabeçalho e nas células; zebrado sutil nas linhas.
 */

/** Linha de cabeçalho da tabela */
export const TABLE_HEADER_ROW = "flex-row bg-gray-100 border-b border-gray-200 px-3 py-2.5";

/** Texto das colunas do cabeçalho */
export const TABLE_HEADER_CELL = "text-xs font-semibold text-gray-600 uppercase tracking-wide";

const TABLE_BODY_ROW_BASE = "flex-row items-center px-3 py-2.5";

/** Linha par (índice 0, 2, 4…) */
export const TABLE_BODY_ROW_EVEN = `${TABLE_BODY_ROW_BASE} bg-white`;

/** Linha ímpar — zebrado sutil */
export const TABLE_BODY_ROW_ODD = `${TABLE_BODY_ROW_BASE} bg-slate-50/80`;

/** @deprecated Use tableBodyRowClass(index) para zebrado */
export const TABLE_BODY_ROW = TABLE_BODY_ROW_EVEN;

/** Classe da linha conforme índice (zebrado alternado) */
export function tableBodyRowClass(index: number): string {
  return index % 2 === 1 ? TABLE_BODY_ROW_ODD : TABLE_BODY_ROW_EVEN;
}

/** Célula padrão */
export const TABLE_CELL = "text-xs text-gray-800";

/** Célula com ênfase (nome, título) */
export const TABLE_CELL_SEMIBOLD = "text-xs font-semibold text-gray-800";

/** Célula secundária / metadado */
export const TABLE_CELL_MUTED = "text-xs text-gray-500";

/** Subtítulo abaixo do valor principal na mesma coluna */
export const TABLE_CELL_SUBLINE = "text-xs text-gray-500 mt-0.5";

/** Matrícula (tema violeta, mono) */
export const TABLE_CELL_ENROLLMENT = "text-xs font-mono font-semibold text-violet-600";

/** Container da tabela dentro do card */
export const TABLE_CONTAINER =
  "bg-white rounded-2xl overflow-hidden border border-gray-200";
