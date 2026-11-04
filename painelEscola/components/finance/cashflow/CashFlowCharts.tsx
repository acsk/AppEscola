import React, { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { color, font } from "../../../constants/theme";
import { fmtMoney } from "../../financeiro/format";
import type { CashFlowBucket } from "../../../services/cashFlow";

const IN = color["data-1"];
const OUT = color["data-2"];

export const fmtShort = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1000) return `${sign}${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sign}${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** Valor mostrado na barra: realizado no que já aconteceu; previsto no futuro. */
const barValue = (b: CashFlowBucket, side: "in" | "out") =>
  Number(b.state === "future" ? (side === "in" ? b.planned_in : b.planned_out) : side === "in" ? b.realized_in : b.realized_out) || 0;

/** Entradas e saídas por intervalo. Barra cheia = realizado; contorno tracejado = previsto (ainda não aconteceu). */
export function CashFlowColumns({ buckets, height = 200 }: { buckets: CashFlowBucket[]; height?: number }) {
  const max = Math.max(1, ...buckets.flatMap((b) => [barValue(b, "in"), barValue(b, "out")]));
  const scale = (v: number) => (v > 0 ? Math.max(2, (v / max) * height) : 0);
  const firstFuture = buckets.findIndex((b) => b.state === "future");

  const legend = [
    { label: "Entradas", style: { backgroundColor: IN } },
    { label: "Saídas", style: { backgroundColor: OUT } },
    { label: "Previsto", style: { borderWidth: 1.5, borderStyle: "dashed" as const, borderColor: color["ink-muted"] } },
  ];

  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        {legend.map((l) => (
          <View key={l.label} className="flex-row items-center" style={{ gap: 6 }}>
            <View style={[{ width: 10, height: 10, borderRadius: 2 }, l.style]} />
            <Text className="text-ink-muted" style={{ fontSize: 12 }}>{l.label}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row border-b border-border" style={{ height, alignItems: "flex-end", gap: 6 }}>
        {buckets.map((b, i) => (
          <View
            key={b.key}
            className="flex-row"
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "flex-end",
              gap: 2,
              height: "100%",
              borderLeftWidth: i === firstFuture && i > 0 ? 1 : 0,
              borderLeftColor: color["ink-subtle"],
              borderStyle: "dashed",
            }}
            aria-label={`${b.label}: entradas ${fmtMoney(barValue(b, "in"))}, saídas ${fmtMoney(barValue(b, "out"))}${b.state === "future" ? " (previsto)" : ""}`}
          >
            {(["in", "out"] as const).map((side) => {
              const c = side === "in" ? IN : OUT;
              const future = b.state === "future";
              return (
                <View
                  key={side}
                  style={{
                    width: "36%",
                    maxWidth: 22,
                    height: scale(barValue(b, side)),
                    backgroundColor: future ? "transparent" : c,
                    borderWidth: future ? 1.5 : 0,
                    borderStyle: "dashed",
                    borderColor: c,
                    borderTopLeftRadius: 2,
                    borderTopRightRadius: 2,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View className="flex-row" style={{ gap: 6 }}>
        {buckets.map((b) => (
          <Text key={b.key} className={`font-mono ${b.state === "current" ? "text-ink" : "text-ink-muted"}`} style={{ flex: 1, fontSize: 10, textAlign: "center" }} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const PAD = { left: 52, right: 12, top: 12, bottom: 22 };

/** Resultado acumulado no fim de cada intervalo: linha cheia = realizado; tracejada = projeção. */
export function CumulativeLine({ buckets, height = 200 }: { buckets: CashFlowBucket[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const values = buckets.map((b) => Number(b.cumulative) || 0);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (buckets.length > 1 ? (i / (buckets.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * plotH;

  // Linha cheia até o último intervalo encerrado; dali em diante tracejada (o atual já inclui o que ainda vence).
  const firstOpen = buckets.findIndex((b) => b.state !== "past");
  const split = firstOpen === -1 ? values.length - 1 : firstOpen - 1;
  const realized = split >= 0 ? values.slice(0, split + 1).map((v, i) => `${x(i)},${y(v)}`).join(" ") : "";
  const projected = values.slice(Math.max(0, split)).map((v, i) => `${x(i + Math.max(0, split))},${y(v)}`).join(" ");
  const ticks = [hi, (hi + lo) / 2, lo];

  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row" style={{ gap: 16 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 14, height: 2, backgroundColor: IN }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Realizado</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Projetado</Text>
        </View>
      </View>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }} aria-label="Resultado acumulado por intervalo">
        {width > 0 && buckets.length > 0 ? (
          <Svg width={width} height={height}>
            {ticks.map((t, i) => (
              <React.Fragment key={i}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={color.border} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y(t) + 3} fontSize={10} fill={color["ink-subtle"]} textAnchor="end" fontFamily={font.mono}>
                  {fmtShort(t)}
                </SvgText>
              </React.Fragment>
            ))}
            {lo < 0 ? <Line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke={color["ink-muted"]} strokeWidth={1} /> : null}
            {split > 0 ? <Polyline points={realized} fill="none" stroke={IN} strokeWidth={2} /> : null}
            {firstOpen !== -1 ? <Polyline points={projected} fill="none" stroke={color["ink-muted"]} strokeWidth={2} strokeDasharray="5,4" /> : null}
            {values.map((v, i) => (
              <Circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={buckets[i].state === "past" ? IN : color["ink-muted"]} />
            ))}
            {[0, buckets.length - 1].filter((i, idx, arr) => arr.indexOf(i) === idx).map((i) => (
              <SvgText key={`l${i}`} x={x(i)} y={height - 6} fontSize={10} fill={color["ink-subtle"]} textAnchor={i === 0 ? "start" : "end"} fontFamily={font.mono}>
                {buckets[i].label}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
