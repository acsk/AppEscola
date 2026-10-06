import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export type DefinitionRow = {
  label: string;
  value: string;
  /** Valor ausente/neutro ("Sem desconto"): em `ink-subtle`, peso normal. */
  muted?: boolean;
  /** Valor em texto (não numérico): sans em vez de mono. */
  text?: boolean;
  onPress?: () => void;
};

type Props = { rows: DefinitionRow[]; total?: DefinitionRow };

/** Lista rótulo → valor de painel lateral (valores em mono; linha de total destacada). */
export default function DefinitionRows({ rows, total }: Props) {
  const valueClass = (row: DefinitionRow) =>
    row.muted ? "text-ink-subtle" : row.onPress ? "text-brand font-medium" : `text-ink font-medium ${row.text ? "" : "font-mono"}`;

  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} className="flex-row items-baseline justify-between" style={{ paddingVertical: 8, gap: 12 }}>
          <Text className="text-sm text-ink-muted">{row.label}</Text>
          {row.onPress ? (
            <TouchableOpacity onPress={row.onPress} role="link">
              <Text className={`text-sm ${valueClass(row)}`}>{row.value}</Text>
            </TouchableOpacity>
          ) : (
            <Text className={`text-sm ${valueClass(row)}`} numberOfLines={1} style={{ flexShrink: 1, textAlign: "right" }}>
              {row.value}
            </Text>
          )}
        </View>
      ))}
      {total && (
        <View className="flex-row items-baseline justify-between border-t border-border" style={{ marginTop: 8, paddingTop: 12, gap: 12 }}>
          <Text className="text-sm font-semibold text-ink">{total.label}</Text>
          <Text className="font-mono font-semibold text-ink" style={{ fontSize: 16 }}>
            {total.value}
          </Text>
        </View>
      )}
    </View>
  );
}
