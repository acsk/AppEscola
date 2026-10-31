import React from "react";
import { Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtNumber } from "./format";
import type { BiSubjectDifficulty } from "../../services/biService";

type Props = {
  items: BiSubjectDifficulty[];
  goal: number;
};

/** Barras horizontais de aproveitamento por disciplina, com a meta tracejada e o assunto mais crítico. */
export default function DifficultyBars({ items, goal }: Props) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((item) => (
        <View key={item.subject_id} style={{ gap: 6 }} aria-label={`${item.name}: ${fmtNumber(item.accuracy, 0)}% de acertos em ${item.answers} respostas`}>
          <View className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                {item.name}
              </Text>
              {item.critical_topic ? (
                <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 14 }}>
                  {`${item.critical_topic.name} · ${fmtNumber(item.critical_topic.accuracy, 0)}%`}
                </Text>
              ) : null}
            </View>
            <Text className="font-mono font-medium text-ink" style={{ fontSize: 12, lineHeight: 16 }}>
              {`${fmtNumber(item.accuracy, 0)}%`}
              <Text className="text-ink-subtle" style={{ fontSize: 11, fontFamily: undefined }}>
                {`  ${item.answers.toLocaleString("pt-BR")} resp.`}
              </Text>
            </Text>
          </View>
          <View className="bg-surface-sunken" style={{ height: 10, borderRadius: 2, position: "relative" }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${item.accuracy}%`, backgroundColor: color["data-1"], borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
            <View style={{ position: "absolute", top: -4, bottom: -4, left: `${goal}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          </View>
        </View>
      ))}
      <View className="flex-row items-center" style={{ gap: 6, marginTop: 4 }}>
        <View style={{ height: 12, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
        <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
          {`Meta de ${fmtNumber(goal, 0)}%`}
        </Text>
      </View>
    </View>
  );
}
