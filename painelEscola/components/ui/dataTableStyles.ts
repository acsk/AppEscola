import type { StyleProp, ViewStyle } from "react-native";
import { color } from "../../constants/theme";

/**
 * Padrão de tabelas do painel (design system "Cursinho Hub"; ver painel-escola.md).
 * Sem zebra: linhas separadas por borda `border`, hover em `surface-sunken`, cabeçalho em `surface-sunken`.
 * Cores via style (RN Web não aplica bem bg com opacidade no className).
 */

/** Fundos das linhas. `even`/`odd` iguais (sem zebra); mantidos por compatibilidade. */
export const TABLE_ROW_BG = {
  even: color.surface,
  odd: color.surface,
  hover: color["surface-sunken"],
  header: color["surface-sunken"],
} as const;

export const TABLE_BODY_ROW_LAYOUT: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "stretch",
  width: "100%",
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderBottomColor: color.border,
};

/** Linha de cabeçalho — className + style */
export const TABLE_HEADER_ROW = "flex-row border-b border-border px-4 py-2.5";

export const TABLE_HEADER_ROW_STYLE: ViewStyle = {
  backgroundColor: TABLE_ROW_BG.header,
};

/** Texto das colunas do cabeçalho (12px/500, sem caixa alta) */
export const TABLE_HEADER_CELL = "text-xs font-medium text-ink-muted tracking-wide";

/** Fundo da linha do corpo (sem zebra; o índice é mantido por compatibilidade). */
export function tableBodyRowStyle(_index: number): ViewStyle {
  return { backgroundColor: TABLE_ROW_BG.even };
}

/** @deprecated Preferir tableBodyRowStyle(index) + DataTableRow */
export function tableBodyRowClass(_index: number): string {
  return "flex-row items-center px-4 py-3 border-b border-border";
}

/** Célula padrão (14px) */
export const TABLE_CELL = "text-sm text-ink";

/** Célula com ênfase (nome, título) */
export const TABLE_CELL_SEMIBOLD = "text-sm font-medium text-ink";

/** Célula secundária / metadado */
export const TABLE_CELL_MUTED = "text-sm text-ink-muted";

/** Subtítulo abaixo do valor principal na mesma coluna */
export const TABLE_CELL_SUBLINE = "text-xs text-ink-subtle mt-0.5";

/** Matrícula, datas, horários, quantidades (mono, tabular) */
export const TABLE_CELL_ENROLLMENT = "text-sm font-mono text-ink";

/** Dados tabulares em mono (datas, horários, códigos). */
export const TABLE_CELL_MONO = "text-sm font-mono text-ink";

/** Container da tabela */
export const TABLE_CONTAINER = "bg-surface rounded-ds-md overflow-hidden border border-border";

export function mergeTableRowStyle(index: number, extra?: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  return [TABLE_BODY_ROW_LAYOUT, tableBodyRowStyle(index), extra];
}
