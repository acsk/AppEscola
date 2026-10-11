import React from "react";
import { Text, View } from "react-native";
import { TABLE_CELL, TABLE_CELL_MUTED } from "../ui/dataTableStyles";
import { color as dsColor } from "../../constants/theme";

type Props = {
  difficulty: { name: string; sort_order: number } | null;
  /** Quantidade de níveis cadastrados (para o indicador). */
  levels: number;
  /** Texto quando a questão não tem nível. */
  emptyLabel?: string;
};

/** Indicador de nível (blocos em `ink-muted`) + nome; a palavra é a informação, os blocos reforçam. */
export default function DifficultyMeter({ difficulty, levels, emptyLabel = "—" }: Props) {
  if (!difficulty) return <Text className={TABLE_CELL_MUTED}>{emptyLabel}</Text>;

  const total = Math.max(levels, difficulty.sort_order, 1);

  return (
    <View className="flex-row items-center gap-2" aria-label={`Dificuldade: ${difficulty.name}`}>
      <View className="flex-row" style={{ gap: 2 }} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 12,
              backgroundColor: i < difficulty.sort_order ? dsColor["ink-muted"] : dsColor.border,
            }}
          />
        ))}
      </View>
      <Text className={TABLE_CELL} numberOfLines={1}>
        {difficulty.name}
      </Text>
    </View>
  );
}
