import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { color, shadow } from "../../constants/theme";

export type FinanceMonthBar = {
  label: string;
  paid: number;
  reference: number;
};

type Props = {
  data: FinanceMonthBar[];
  paidLabel: string;
  referenceLabel: string;
  accessibilityLabel: string;
  height?: number;
};

const formatBrl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Barras mensais: recebido em `brand` e a série de referência em `border-strong`. A legenda nomeia as duas. */
export default function FinanceMonthChart({
  data,
  paidLabel,
  referenceLabel,
  accessibilityLabel,
  height = 200,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((bar) => [bar.paid, bar.reference]));
  const plotHeight = height - 28;

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 12 }} accessibilityRole="text">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: color.brand }} />
          <Text className="text-xs text-ink-muted">{paidLabel}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: color["border-strong"] }} />
          <Text className="text-xs text-ink-muted">{referenceLabel}</Text>
        </View>
      </View>

      <View role="img" aria-label={accessibilityLabel} style={{ height, flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: plotHeight }} aria-hidden>
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: color.border }} />
          </View>
          <View style={{ flexDirection: "row", height: plotHeight, alignItems: "flex-end" }}>
            {data.map((bar, i) => {
              const dim = hover !== null && hover !== i;
              const paidHeight = bar.paid <= 0 ? 0 : Math.max((bar.paid / max) * (plotHeight - 8), 2);
              const referenceHeight = bar.reference <= 0 ? 0 : Math.max((bar.reference / max) * (plotHeight - 8), 2);
              return (
                <Pressable
                  key={`${bar.label}-${i}`}
                  onHoverIn={() => setHover(i)}
                  onHoverOut={() => setHover((current) => (current === i ? null : current))}
                  onPressIn={() => setHover(i)}
                  style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}
                  aria-label={`${bar.label}: ${paidLabel} ${formatBrl(bar.paid)}, ${referenceLabel} ${formatBrl(bar.reference)}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: plotHeight }}>
                    <View
                      style={{
                        width: 10,
                        height: paidHeight,
                        backgroundColor: dim ? color["border-strong"] : color.brand,
                      }}
                    />
                    <View
                      style={{
                        width: 10,
                        height: referenceHeight,
                        backgroundColor: dim ? color.border : color["border-strong"],
                      }}
                    />
                  </View>
                  {hover === i ? (
                    <View
                      className="bg-surface border border-border rounded-ds-sm"
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        zIndex: 10,
                        minWidth: 160,
                        ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay } as object) : {}),
                      }}
                      pointerEvents="none"
                    >
                      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                        {bar.label}
                      </Text>
                      <Text className="font-mono font-semibold text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                        {paidLabel}: {formatBrl(bar.paid)}
                      </Text>
                      <Text className="font-mono text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                        {referenceLabel}: {formatBrl(bar.reference)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", height: 28, alignItems: "center" }} aria-hidden>
            {data.map((bar, i) => (
              <Text key={`${bar.label}-axis-${i}`} className="font-mono text-ink-subtle" style={{ flex: 1, fontSize: 11, textAlign: "center" }}>
                {bar.label}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {data.map((bar, i) => (
          <Text key={`${bar.label}-sr-${i}`}>
            {bar.label}: {paidLabel} {formatBrl(bar.paid)}, {referenceLabel} {formatBrl(bar.reference)}
          </Text>
        ))}
      </View>
    </View>
  );
}
