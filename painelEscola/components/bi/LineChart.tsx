import React, { useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { color, font, shadow } from "../../constants/theme";
import { fmtNumber } from "./format";

export type LinePoint = { label: string; value: number | null; n: number };

type Props = {
  points: LinePoint[];
  seriesName: string;
  /** Linha de referência tracejada (ex.: meta pedagógica). */
  reference?: { value: number; label: string };
  unit?: string;
  height?: number;
  accessibilityLabel: string;
};

const PAD = { left: 40, right: 64, top: 14, bottom: 28 };

/**
 * Série única ao longo do tempo. Ponto sem dado vira lacuna (não zero); hover mostra valor e amostra.
 * Inclui tabela equivalente para leitores de tela.
 */
export default function LineChart({ points, seriesName, reference, unit = "%", height = 240, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const [y0, y1, ticks] = useMemo(() => {
    const values = points.map((p) => p.value).filter((v): v is number => v !== null);
    if (reference) values.push(reference.value);
    if (!values.length) return [0, 100, [0, 25, 50, 75, 100]];
    const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
    const step = hi - lo > 40 ? 20 : 10;
    const t: number[] = [];
    for (let v = lo; v <= hi; v += step) t.push(v);
    return [lo, hi, t];
  }, [points, reference]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i * plotW) / (points.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + ((y1 - v) * plotH) / (y1 - y0 || 1);

  const segments: string[][] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(`${x(i)},${y(p.value)}`);
  });
  if (current.length) segments.push(current);

  let last = points.length - 1;
  while (last >= 0 && points[last].value === null) last--;
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;
  // Ponto sem vizinho com dado não forma linha: precisa do marcador para aparecer.
  const isolated = (i: number) =>
    (i === 0 || points[i - 1].value === null) && (i === points.length - 1 || points[i + 1].value === null);
  const axisFont = { fontFamily: font.mono, fontSize: 11 };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {reference ? (
        <View className="flex-row items-center" style={{ gap: 6, marginBottom: 12 }}>
          <View style={{ width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
            {reference.label}
          </Text>
        </View>
      ) : null}
      {width > 0 ? (
        <View style={{ position: "relative" }}>
          <Svg width={width} height={height} role="img" aria-label={accessibilityLabel}>
            <G>
              {ticks.map((t) => (
                <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={color.border} strokeWidth={1} />
              ))}
              {ticks.map((t) => (
                <SvgText key={`t${t}`} x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fill={color["ink-subtle"]} {...axisFont}>
                  {`${t}${unit}`}
                </SvgText>
              ))}
              {points.map((p, i) => (
                <SvgText key={`x${p.label}${i}`} x={x(i)} y={height - 8} textAnchor="middle" fill={color["ink-subtle"]} {...axisFont}>
                  {p.label}
                </SvgText>
              ))}
            </G>
            {reference ? (
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke={color["ink-muted"]}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}
            {hover !== null ? (
              <Line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke={color["border-strong"]} strokeWidth={1} />
            ) : null}
            {segments.map((seg, k) => (
              <Polyline key={k} points={seg.join(" ")} fill="none" stroke={color["data-1"]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((p, i) =>
              p.value !== null && (isolated(i) || i === last || i === hover) ? (
                <Circle key={`p${i}`} cx={x(i)} cy={y(p.value)} r={i === hover ? 5 : 4} fill={color["data-1"]} stroke={color.surface} strokeWidth={2} />
              ) : null
            )}
            {last >= 0 && points[last].value !== null ? (
              <SvgText x={x(last) + 10} y={y(points[last].value as number) + 4} fill={color.ink} fontFamily={font.mono} fontSize={11} fontWeight="500">
                {`${fmtNumber(points[last].value as number, 0)}${unit}`}
              </SvgText>
            ) : null}
          </Svg>
          {/* Faixas de hover por mês, sobre o SVG (hover no web, toque no mobile). */}
          {points.map((_, i) => (
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
              style={{
                position: "absolute",
                left: Math.min(Math.max(x(hover) - 80, 0), Math.max(width - 160, 0)),
                top: 0,
                width: 160,
                paddingVertical: 8,
                paddingHorizontal: 10,
                boxShadow: shadow.overlay,
              } as object}
            >
              <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                {points[hover].label}
              </Text>
              <Text className="font-mono font-semibold text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                {points[hover].value === null ? "Sem avaliação" : `${fmtNumber(points[hover].value as number, 1)}${unit}`}
              </Text>
              <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 16 }}>
                {`${seriesName} · n = ${points[hover].n} alunos`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {points.map((p, i) => (
          <Text key={`sr${i}`}>{`${p.label}: ${p.value === null ? "sem avaliação" : `${fmtNumber(p.value, 1)}${unit}`}, ${p.n} alunos`}</Text>
        ))}
      </View>
    </View>
  );
}
