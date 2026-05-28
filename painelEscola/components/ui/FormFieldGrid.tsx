import React from "react";
import { View, useWindowDimensions } from "react-native";

const FIELD_GAP = 12;

type RowProps = {
  children: React.ReactNode;
  /** Força 1, 2 ou 3 colunas; se omitido, usa largura da tela */
  columns?: 1 | 2 | 3;
};

export function useFormFieldColumns(override?: 1 | 2 | 3): 1 | 2 | 3 {
  const { width } = useWindowDimensions();
  if (override) return override;
  if (width >= 1100) return 3;
  if (width >= 768) return 2;
  return 1;
}

export function FormFieldRow({ children, columns: columnsProp }: RowProps) {
  const columns = useFormFieldColumns(columnsProp);
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View
      style={{
        flexDirection: columns === 1 ? "column" : "row",
        flexWrap: columns === 1 ? "nowrap" : "wrap",
        gap: FIELD_GAP,
        alignItems: "flex-start",
        width: "100%",
      }}
    >
      {items.map((child, index) => (
        <View
          key={index}
          style={{
            flex: columns === 1 ? undefined : 1,
            minWidth: columns === 1 ? undefined : columns === 3 ? 0 : 220,
            width: columns === 1 ? "100%" : undefined,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function FormFieldFull({ children }: { children: React.ReactNode }) {
  return <View style={{ width: "100%" }}>{children}</View>;
}
