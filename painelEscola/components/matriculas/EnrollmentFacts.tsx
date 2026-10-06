import React from "react";
import { Text, View } from "react-native";
import { color } from "../../constants/theme";

export type EnrollmentFact = { label: string; value: string; detail?: string | null; mono?: boolean };

type Props = { facts: EnrollmentFact[]; width: number };

/** Faixa de resumo da matrícula: uma superfície, colunas separadas por divisor (4 → 2 → 1 coluna). */
export default function EnrollmentFacts({ facts, width }: Props) {
  const cols = width >= 1100 ? facts.length : width >= 640 ? 2 : 1;
  return (
    <View className="flex-row flex-wrap bg-surface border border-border rounded-ds-md overflow-hidden">
      {facts.map((fact, i) => (
        <View
          key={fact.label}
          style={{
            width: `${100 / cols}%`,
            paddingVertical: 16,
            paddingHorizontal: 20,
            borderLeftWidth: i % cols === 0 ? 0 : 1,
            borderTopWidth: i < cols ? 0 : 1,
            borderColor: color.border,
          }}
        >
          <Text className="text-xs text-ink-subtle">{fact.label}</Text>
          <Text
            className={`text-ink font-medium ${fact.mono ? "font-mono" : ""}`}
            style={{ fontSize: fact.mono ? 14 : 15, lineHeight: 22, marginTop: 4 }}
            numberOfLines={1}
          >
            {fact.value || "—"}
          </Text>
          {fact.detail ? (
            <Text className="text-xs text-ink-muted" style={{ marginTop: 2 }} numberOfLines={1}>
              {fact.detail}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
