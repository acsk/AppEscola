import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { color, shadow } from "../../constants/theme";

export type AttendanceBar = {
  /** Rótulo do eixo — ex.: "Seg". */
  label: string;
  present: number;
  absent: number;
};

type Props = {
  data: AttendanceBar[];
  /** Descrição para leitores de tela (o que o gráfico mostra). */
  accessibilityLabel: string;
  height?: number;
};

const TICKS = [0, 25, 50, 75, 100];

const pct = (b: AttendanceBar) => {
  const total = b.present + b.absent;
  return total > 0 ? (b.present / total) * 100 : null;
};

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Presença (%) por dia — uma série, barras em `brand` (raio 2px), grade em `border`, eixo em `ink-subtle` (mono).
 * Hover: tooltip e as demais barras vão para `border-strong`. Tabela equivalente para leitores de tela.
 */
export default function AttendanceBarChart({ data, accessibilityLabel, height = 220 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const plotHeight = height - 24;

  return (
    <View>
      <View role="img" aria-label={accessibilityLabel} style={{ height, flexDirection: "row" }}>
        {/* Eixo y */}
        <View style={{ width: 40, height: plotHeight, justifyContent: "space-between" }} aria-hidden>
          {[...TICKS].reverse().map((t) => (
            <Text key={t} className="font-mono text-ink-subtle" style={{ fontSize: 11, lineHeight: 11, textAlign: "right", paddingRight: 8 }}>
              {t}%
            </Text>
          ))}
        </View>

        <View style={{ flex: 1 }}>
          {/* Grade */}
          <View style={{ position: "absolute", left: 0, right: 0, top: 5, height: plotHeight - 10, justifyContent: "space-between" }} aria-hidden>
            {TICKS.map((t) => (
              <View key={t} style={{ height: 1, backgroundColor: color.border }} />
            ))}
          </View>

          {/* Barras */}
          <View style={{ flexDirection: "row", height: plotHeight, paddingTop: 5, paddingBottom: 5 }}>
            {data.map((bar, i) => {
              const value = pct(bar);
              const dim = hover !== null && hover !== i;
              return (
                <Pressable
                  key={bar.label}
                  onHoverIn={() => setHover(i)}
                  onHoverOut={() => setHover((h) => (h === i ? null : h))}
                  onPressIn={() => setHover(i)}
                  style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}
                  aria-label={`${bar.label}: ${value === null ? "sem registros" : `${fmt(value)}% de presença`}`}
                >
                  {value !== null && (
                    <Text className="font-mono font-medium text-ink" style={{ fontSize: 12, lineHeight: 16, marginBottom: 4 }}>
                      {fmt(value)}%
                    </Text>
                  )}
                  <View
                    style={{
                      width: "56%",
                      maxWidth: 48,
                      height: value === null ? 0 : `${Math.max(value, 0.5) * 0.86}%`,
                      backgroundColor: dim ? color["border-strong"] : color.brand,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                  {hover === i && (
                    <View
                      className="bg-surface border border-border rounded-ds-md"
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        zIndex: 10,
                        ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay, whiteSpace: "nowrap" } as object) : {}),
                      }}
                      pointerEvents="none"
                    >
                      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                        {bar.label}
                      </Text>
                      <Text className="font-mono font-semibold text-ink" style={{ fontSize: 14, lineHeight: 20 }}>
                        {value === null ? "Sem registros" : `${fmt(value)}%`}
                      </Text>
                      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                        {bar.present} presentes · {bar.absent} ausentes
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Eixo x */}
          <View style={{ flexDirection: "row", height: 24, alignItems: "center" }} aria-hidden>
            {data.map((bar) => (
              <Text key={bar.label} className="font-mono text-ink-subtle" style={{ flex: 1, fontSize: 11, textAlign: "center" }}>
                {bar.label}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {/* Tabela equivalente (somente leitores de tela) */}
      <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {data.map((bar) => (
          <Text key={bar.label}>
            {bar.label}: {bar.present} presentes, {bar.absent} ausentes
          </Text>
        ))}
      </View>
    </View>
  );
}
