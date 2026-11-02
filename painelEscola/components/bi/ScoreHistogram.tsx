import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtNumber } from "./format";

type Props = {
  bins: { from: number; to: number; count: number }[];
  goal: number;
  height?: number;
};

/** Distribuição de resultados em faixas de 10 p.p.; contagem sobre cada barra e meta tracejada. */
export default function ScoreHistogram({ bins, goal, height = 160 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((sum, b) => sum + b.count, 0);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, position: "relative" }} role="img" aria-label={`Distribuição de ${total} resultados por faixa de 10 pontos percentuais`}>
        <View className="flex-row" style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 18, alignItems: "flex-end", gap: 2 }}>
          {bins.map((bin, i) => (
            <Pressable
              key={bin.from}
              onHoverIn={() => setHover(i)}
              onHoverOut={() => setHover((h) => (h === i ? null : h))}
              onPress={() => setHover((h) => (h === i ? null : i))}
              aria-label={`${bin.from}% a ${bin.to}%: ${bin.count} resultado(s)`}
              style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
            >
              <Text className="font-mono text-ink-muted" style={{ fontSize: 11, marginBottom: 2 }}>
                {bin.count || ""}
              </Text>
              <View
                style={{
                  width: "100%",
                  height: `${(bin.count / max) * 85}%`,
                  minHeight: bin.count ? 2 : 0,
                  backgroundColor: color["data-1"],
                  opacity: hover === null || hover === i ? 1 : 0.55,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            </Pressable>
          ))}
        </View>
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, bottom: 0, left: `${goal}%`, borderLeftWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }}
        />
      </View>
      <View className="flex-row border-t border-border" style={{ paddingTop: 4 }}>
        {bins.map((bin) => (
          <Text key={bin.from} className="font-mono text-ink-subtle" style={{ flex: 1, fontSize: 10, textAlign: "center" }}>
            {bin.from}
          </Text>
        ))}
      </View>
      <Text className="text-ink-muted" style={{ fontSize: 12 }}>
        {hover !== null
          ? `${bins[hover].from}% a ${bins[hover].to}%: ${bins[hover].count} de ${total} (${fmtNumber(total ? (bins[hover].count / total) * 100 : 0, 0)}%)`
          : `% da nota máxima · linha tracejada = meta de ${fmtNumber(goal, 0)}%`}
      </Text>
    </View>
  );
}
