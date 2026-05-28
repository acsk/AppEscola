import type { StyleProp, ViewStyle } from "react-native";

/**
 * Padrão visual de tabelas desktop no painel (ver painel-escola.md).
 * Cores via style (RN Web não aplica bem bg com opacidade no className).
 */

/** Fundos das linhas — usar com tableBodyRowStyle() */
export const TABLE_ROW_BG = {
  even: "#FFFFFF",
  odd: "#F1F5F9",
  hover: "#EDE9FE",
  header: "#F3F4F6",
} as const;

export const TABLE_BODY_ROW_LAYOUT: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "stretch",
  width: "100%",
  paddingHorizontal: 12,
  paddingVertical: 10,
};

/** Linha de cabeçalho — className + style */
export const TABLE_HEADER_ROW = "flex-row border-b border-gray-200 px-3 py-2.5";

export const TABLE_HEADER_ROW_STYLE: ViewStyle = {
  backgroundColor: TABLE_ROW_BG.header,
};

/** Texto das colunas do cabeçalho */
export const TABLE_HEADER_CELL = "text-xs font-semibold text-gray-600 uppercase tracking-wide";

/** Fundo zebrado por índice (obrigatório no style da linha) */
export function tableBodyRowStyle(index: number): ViewStyle {
  return {
    backgroundColor: index % 2 === 1 ? TABLE_ROW_BG.odd : TABLE_ROW_BG.even,
  };
}

/** @deprecated Preferir tableBodyRowStyle(index) + DataTableRow */
export function tableBodyRowClass(_index: number): string {
  return "flex-row items-center px-3 py-2.5";
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

export function mergeTableRowStyle(
  index: number,
  extra?: StyleProp<ViewStyle>
): StyleProp<ViewStyle> {
  return [TABLE_BODY_ROW_LAYOUT, tableBodyRowStyle(index), extra];
}
