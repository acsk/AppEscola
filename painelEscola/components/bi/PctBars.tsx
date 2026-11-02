import React from "react";
import { Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtNumber } from "./format";

export type PctBarItem = { key: string | number; label: string; sublabel?: string; value: number; note?: string };

type Props = {
  items: PctBarItem[];
  goal: number;
};

/** Barras horizontais de percentual com a meta tracejada; abaixo da meta ganha ▾ (a cor não é a única pista). */
export default function PctBars({ items, goal }: Props) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((item) => {
        const below = item.value < goal;
        return (
          <View key={item.key} style={{ gap: 6 }} aria-label={`${item.label}: ${fmtNumber(item.value, 1)}%${below ? ", abaixo da meta" : ""}${item.note ? `, ${item.note}` : ""}`}>
            <View className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
              <View style={{ flexShrink: 1 }}>
                <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18 }}>{item.label}</Text>
                {item.sublabel ? (
                  <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 14 }}>{item.sublabel}</Text>
                ) : null}
              </View>
              <Text className="font-mono font-medium text-ink" style={{ fontSize: 12, lineHeight: 16 }}>
                {`${fmtNumber(item.value, 0)}%${below ? " ▾" : ""}`}
                {item.note ? <Text className="text-ink-subtle" style={{ fontSize: 11 }}>{`  ${item.note}`}</Text> : null}
              </Text>
            </View>
            <View className="bg-surface-sunken" style={{ height: 10, borderRadius: 2, position: "relative" }}>
              <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, item.value)}%`, backgroundColor: color["data-1"], borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
              <View style={{ position: "absolute", top: -4, bottom: -4, left: `${goal}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
            </View>
          </View>
        );
      })}
      <View className="flex-row items-center" style={{ gap: 6, marginTop: 4 }}>
        <View style={{ height: 12, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
        <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>{`Meta de ${fmtNumber(goal, 0)}% · ▾ abaixo da meta`}</Text>
      </View>
    </View>
  );
}
