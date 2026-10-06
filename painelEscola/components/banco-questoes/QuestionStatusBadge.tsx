import React from "react";
import { Text, View } from "react-native";

type Props = { isAnnulled: boolean; isOutdated: boolean };

/** Situação da questão com texto (não só cor). */
export default function QuestionStatusBadge({ isAnnulled, isOutdated }: Props) {
  const items = [
    isAnnulled && { label: "Anulada", bg: "#FEE2E2", fg: "#B91C1C" },
    isOutdated && { label: "Desatualizada", bg: "#FEF3C7", fg: "#B45309" },
  ].filter(Boolean) as { label: string; bg: string; fg: string }[];

  if (items.length === 0) items.push({ label: "Regular", bg: "#DCFCE7", fg: "#15803D" });

  return (
    <View className="flex-row flex-wrap gap-1">
      {items.map((item) => (
        <View key={item.label} className="rounded-full px-2 py-0.5" style={{ backgroundColor: item.bg }}>
          <Text className="text-xs font-semibold" style={{ color: item.fg }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
