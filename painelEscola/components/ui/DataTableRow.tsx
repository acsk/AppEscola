import React from "react";
import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { mergeTableRowStyle, TABLE_ROW_BG } from "./dataTableStyles";

type Props = {
  index: number;
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

/**
 * Linha de tabela com zebrado (style inline) e hover no web.
 */
export default function DataTableRow({ index, children, onPress, style, className }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className={className}
      style={(state) => {
        const { hovered, pressed } = state;
        const showHover = Platform.OS === "web" && (hovered || pressed);
        return [
          mergeTableRowStyle(index, style),
          showHover ? { backgroundColor: TABLE_ROW_BG.hover } : null,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}
