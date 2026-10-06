import React from "react";
import { Text, View } from "react-native";
import { TABLE_CELL, TABLE_CELL_MUTED } from "../ui/dataTableStyles";

type Props = {
  difficulty: { name: string; sort_order: number } | null;
  /** Quantidade de níveis cadastrados (para o indicador). */
  levels: number;
};

const LEVEL_COLORS = ["#10B981", "#84CC16", "#F59E0B", "#F97316", "#EF4444"];

/** Indicador de nível (barras) + nome; a cor nunca é a única informação. */
export default function DifficultyMeter({ difficulty, levels }: Props) {
  if (!difficulty) return <Text className={TABLE_CELL_MUTED}>—</Text>;

  const total = Math.max(levels, difficulty.sort_order, 1);
  const color = LEVEL_COLORS[Math.round(((difficulty.sort_order - 1) / Math.max(total - 1, 1)) * (LEVEL_COLORS.length - 1))];

  return (
    <View className="flex-row items-center gap-2" aria-label={`Dificuldade: ${difficulty.name}`}>
      <View className="flex-row items-end gap-0.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              width: 4,
              height: 6 + i * 2,
              borderRadius: 1,
              backgroundColor: i < difficulty.sort_order ? color : "#E5E7EB",
            }}
          />
        ))}
      </View>
      <Text className={TABLE_CELL}>{difficulty.name}</Text>
    </View>
  );
}
