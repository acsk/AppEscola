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
  /** Segunda série (ex.: média dos colegas), alinhada aos mesmos pontos; ganha legenda. */
  compare?: { name: string; values: (number | null)[]; n?: number[] };
  /** Mostra "n = x alunos" no tooltip (desligue quando a série é de um único aluno). */
  showN?: boolean;
};

const PAD = { left: 40, right: 64, top: 14, bottom: 28 };

/** Trechos contínuos de uma série (ponto sem dado quebra a linha). */
function segmentsOf(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(`${x(i)},${y(v)}`);
  });
  if (current.length) segments.push(current);
  return segments;
}

/**
 * Série ao longo do tempo (opcionalmente com uma série de comparação). Ponto sem dado vira lacuna (não zero);
 * hover mostra valor e amostra. Inclui tabela equivalente para leitores de tela.
 */
export default function LineChart({ points, seriesName, reference, unit = "%", height = 240, accessibilityLabel, compare, showN = true }: Props) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const [y0, y1, ticks] = useMemo(() => {
    const values = [...points.map((p) => p.value), ...(compare?.values ?? [])].filter((v): v is number => v !== null);
    if (reference) values.push(reference.value);
    if (!values.length) return [0, 100, [0, 25, 50, 75, 100]];
    const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
    const step = hi - lo > 40 ? 20 : 10;
    const t: number[] = [];
    for (let v = lo; v <= hi; v += step) t.push(v);
    return [lo, hi, t];
  }, [points, reference, compare]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i * plotW) / (points.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + ((y1 - v) * plotH) / (y1 - y0 || 1);

  const segments = segmentsOf(points.map((p) => p.value), x, y);
  const compareSegments = compare ? segmentsOf(compare.values, x, y) : [];

  let last = points.length - 1;
  while (last >= 0 && points[last].value === null) last--;
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;
  // Ponto sem vizinho com dado não forma linha: precisa do marcador para aparecer.
  const isolated = (i: number) =>
    (i === 0 || points[i - 1].value === null) && (i === points.length - 1 || points[i + 1].value === null);
  const axisFont = { fontFamily: font.mono, fontSize: 11 };
  const tipWidth = compare ? 220 : 160;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {reference || compare ? (
        <View className="flex-row flex-wrap items-center" style={{ gap: 16, marginBottom: 12 }}>
          {compare ? (
            <>
              <LegendItem swatch={<View style={{ width: 14, height: 2, backgroundColor: color["data-1"] }} />} label={seriesName} />
              <LegendItem swatch={<View style={{ width: 14, height: 2, backgroundColor: color["data-2"] }} />} label={compare.name} />
            </>
          ) : null}
          {reference ? (
            <LegendItem
              swatch={<View style={{ width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />}
              label={reference.label}
            />
          ) : null}
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
            {compareSegments.map((seg, k) => (
              <Polyline key={`c${k}`} points={seg.join(" ")} fill="none" stroke={color["data-2"]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {compare?.values.map((v, i) =>
              v !== null && (i === hover || ((i === 0 || compare.values[i - 1] === null) && (i === compare.values.length - 1 || compare.values[i + 1] === null))) ? (
                <Circle key={`cp${i}`} cx={x(i)} cy={y(v)} r={4} fill={color["data-2"]} stroke={color.surface} strokeWidth={2} />
              ) : null
            )}
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
                left: Math.min(Math.max(x(hover) - tipWidth / 2, 0), Math.max(width - tipWidth, 0)),
                top: 0,
                width: tipWidth,
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
                {showN ? `${seriesName} · n = ${points[hover].n} alunos` : seriesName}
              </Text>
              {compare ? (
                <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16, marginTop: 4 }}>
                  {`${compare.name}: ${compare.values[hover] === null ? "—" : `${fmtNumber(compare.values[hover] as number, 1)}${unit}`}${compare.n ? ` (n = ${compare.n[hover]})` : ""}`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {points.map((p, i) => (
          <Text key={`sr${i}`}>
            {`${p.label}: ${p.value === null ? "sem avaliação" : `${fmtNumber(p.value, 1)}${unit}`}${showN ? `, ${p.n} alunos` : ""}${
              compare ? `; ${compare.name}: ${compare.values[i] === null ? "sem dado" : `${fmtNumber(compare.values[i] as number, 1)}${unit}`}` : ""
            }`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      {swatch}
      <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
        {label}
      </Text>
    </View>
  );
}
