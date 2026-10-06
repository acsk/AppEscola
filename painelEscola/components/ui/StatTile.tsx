import React from "react";
import { Text, View } from "react-native";

type Props = {
  /** "o quê" — ex.: "Alunos ativos". */
  label: string;
  /** Valor já formatado — ex.: "412", "87,4". */
  value: string;
  unit?: string;
  /** Variação já formatada, sem sinal — ex.: "18", "1,2 pp", "12%". */
  delta?: string | null;
  trend?: "up" | "down" | null;
  /** Quando cair é bom (ex.: inadimplência), a cor inverte. */
  goodWhen?: "up" | "down";
  /** "comparado a quê" — ex.: "vs. mês anterior". */
  hint?: string;
};

/** Indicador numérico único (KPI). A variação sempre traz seta + número; a cor nunca é a única pista. */
export default function StatTile({ label, value, unit, delta, trend, goodWhen = "up", hint }: Props) {
  const good = trend ? trend === goodWhen : null;
  const deltaClass = good === null ? "text-ink-muted" : good ? "text-success" : "text-danger";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "";

  return (
    <View
      className="bg-surface border border-border rounded-ds-md"
      style={{ paddingVertical: 16, paddingHorizontal: 24, gap: 4, minWidth: 0, flex: 1 }}
      aria-label={`${label}: ${value}${unit ?? ""}${delta ? `, ${trend === "down" ? "queda" : "alta"} de ${delta}` : ""}${hint ? ` ${hint}` : ""}`}
    >
      <Text className="font-medium text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
      <Text className="font-semibold text-ink" style={{ fontSize: 30, lineHeight: 38, letterSpacing: -0.3, fontVariant: ["tabular-nums"] }}>
        {value}
        {unit ? (
          <Text className="font-medium text-ink-muted" style={{ fontSize: 18 }}>
            {unit}
          </Text>
        ) : null}
      </Text>
      {(delta || hint) && (
        <View className="flex-row items-baseline flex-wrap" style={{ gap: 8 }}>
          {delta ? (
            <Text className={`font-mono font-medium ${deltaClass}`} style={{ fontSize: 12, lineHeight: 16 }}>
              {arrow} {delta}
            </Text>
          ) : null}
          {hint ? (
            <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
              {hint}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
