import React from "react";
import { View, Text } from "react-native";

const LEGEND_ORDER = [
  "exam",
  "exam_presential",
  "billing",
  "class",
  "school",
  "task",
  "general",
] as const;

type Props = {
  typesMeta: Record<string, { label: string; color: string }>;
};

export default function CalendarColorLegend({ typesMeta }: Props) {
  const items = LEGEND_ORDER.map((key) => {
    const meta = typesMeta[key];
    if (!meta) return null;
    return { key, label: meta.label, color: meta.color };
  }).filter(Boolean) as { key: string; label: string; color: string }[];

  if (items.length === 0) return null;

  return (
    <View className="mt-3 pt-3 border-t border-border">
      <Text className="text-xs font-semibold text-ink-muted mb-2">Legenda</Text>
      <View className="flex-row flex-wrap gap-x-4 gap-y-2">
        {items.map((item) => (
          <View key={item.key} className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: item.color,
              }}
            />
            <Text className="text-xs text-ink-muted">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
