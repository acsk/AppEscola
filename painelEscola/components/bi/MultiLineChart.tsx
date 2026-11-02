import React, { useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { color, font, shadow } from "../../constants/theme";
import { fmtNumber } from "./format";

type Series = { key: string; name: string; values: (number | null)[]; color: string };

type Props = {
  labels: string[];
  series: Series[];
  height?: number;
  accessibilityLabel: string;
};

const PAD = { left: 36, right: 96, top: 12, bottom: 26 };

/** Até 3 séries na mesma escala (0–100), legenda + rótulo no fim de cada linha; ponto sem amostra é lacuna. */
export default function MultiLineChart({ labels, series, height = 220, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const [y0, y1, ticks] = useMemo(() => {
    const values = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (!values.length) return [0, 100, [0, 50, 100]];
    const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 20) * 20);
    const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 20) * 20);
    const t: number[] = [];
    for (let v = lo; v <= hi; v += 20) t.push(v);
    return [lo, hi, t];
  }, [series]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length > 1 ? (i * plotW) / (labels.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + ((y1 - v) * plotH) / (y1 - y0 || 1);
  const step = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const segments = (values: (number | null)[]) => {
    const out: string[][] = [];
    let cur: string[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(`${x(i)},${y(v)}`);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const lastIndex = (values: (number | null)[]) => {
    let i = values.length - 1;
    while (i >= 0 && values[i] === null) i--;
    return i;
  };
  const axisFont = { fontFamily: font.mono, fontSize: 11 };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View className="flex-row flex-wrap" style={{ gap: 16, marginBottom: 12 }}>
        {series.map((s) => (
          <View key={s.key} className="flex-row items-center" style={{ gap: 6 }}>
            <View style={{ width: 14, height: 2, backgroundColor: s.color }} />
            <Text className="text-ink-muted" style={{ fontSize: 12 }}>{s.name}</Text>
          </View>
        ))}
      </View>
      {width > 0 ? (
        <View style={{ position: "relative" }}>
          <Svg width={width} height={height} role="img" aria-label={accessibilityLabel}>
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={color.border} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`t${t}`} x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fill={color["ink-subtle"]} {...axisFont}>
                {String(t)}
              </SvgText>
            ))}
            {labels.map((l, i) => (
              <SvgText key={`x${i}`} x={x(i)} y={height - 8} textAnchor="middle" fill={color["ink-subtle"]} {...axisFont}>
                {l}
              </SvgText>
            ))}
            {hover !== null ? <Line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke={color["border-strong"]} strokeWidth={1} /> : null}
            {series.map((s) =>
              segments(s.values).map((seg, k) => (
                <Polyline key={`${s.key}${k}`} points={seg.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))
            )}
            {series.map((s) =>
              s.values.map((v, i) => {
                const isolated = (i === 0 || s.values[i - 1] === null) && (i === s.values.length - 1 || s.values[i + 1] === null);
                return v !== null && (isolated || i === hover || i === lastIndex(s.values)) ? (
                  <Circle key={`${s.key}p${i}`} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke={color.surface} strokeWidth={2} />
                ) : null;
              })
            )}
            {series.map((s) => {
              const i = lastIndex(s.values);
              return i >= 0 ? (
                <SvgText key={`${s.key}end`} x={x(i) + 10} y={y(s.values[i] as number) + 4} fill={color.ink} fontFamily={font.sans} fontSize={11}>
                  {`${s.name} ${fmtNumber(s.values[i] as number, 0)}`}
                </SvgText>
              ) : null;
            })}
          </Svg>
          {labels.map((_, i) => (
            <Pressable
              key={`h${i}`}
              accessible={false}
              onHoverIn={() => setHover(i)}
              onHoverOut={() => setHover((h) => (h === i ? null : h))}
              onPressIn={() => setHover(i)}
              style={{ position: "absolute", left: x(i) - step / 2, top: PAD.top, width: Math.max(step, 1), height: plotH }}
            />
          ))}
          {hover !== null ? (
            <View
              pointerEvents="none"
              className="bg-surface border border-border rounded-ds-md"
              style={{ position: "absolute", left: Math.min(Math.max(x(hover) - 80, 0), Math.max(width - 160, 0)), top: 0, width: 160, padding: 8, boxShadow: shadow.overlay } as object}
            >
              <Text className="text-ink-muted" style={{ fontSize: 12, marginBottom: 4 }}>{labels[hover]}</Text>
              {series.map((s) => (
                <Text key={s.key} className="text-ink" style={{ fontSize: 12, lineHeight: 18 }}>
                  {`${s.name}: ${s.values[hover] === null ? "sem amostra" : fmtNumber(s.values[hover] as number, 0)}`}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {labels.map((l, i) => (
          <Text key={`sr${i}`}>{`${l}: ${series.map((s) => `${s.name} ${s.values[i] === null ? "sem amostra" : fmtNumber(s.values[i] as number, 0)}`).join(", ")}`}</Text>
        ))}
      </View>
    </View>
  );
}
