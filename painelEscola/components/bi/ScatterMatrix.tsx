import React, { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { color, font, shadow } from "../../constants/theme";
import { fmtNumber } from "./format";

export type ScatterPoint = { id: number; name: string; x: number; y: number; group: string };

type Props = {
  points: ScatterPoint[];
  xThreshold: number;
  yThreshold: number;
  selected: string;
  counts: Record<string, number>;
  xLabel: string;
  yLabel: string;
  height?: number;
  accessibilityLabel: string;
};

const PAD = { left: 44, right: 16, top: 12, bottom: 40 };

/**
 * Dispersão em quatro quadrantes (A1 alto-direita, A2 alto-esquerda, B1 baixo-direita, B2 baixo-esquerda).
 * Pontos do quadrante selecionado em data-1; os demais neutros. Limiares tracejados. Toque no ponto mostra o aluno.
 */
export default function ScatterMatrix({ points, xThreshold, yThreshold, selected, counts, xLabel, yLabel, height = 360, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<ScatterPoint | null>(null);
  const xMax = Math.max(7, Math.ceil(Math.max(xThreshold, ...points.map((p) => p.x))));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + (Math.min(v, xMax) / xMax) * plotW;
  const y = (v: number) => PAD.top + ((100 - Math.max(0, Math.min(100, v))) / 100) * plotH;
  const tx = x(xThreshold);
  const ty = y(yThreshold);
  const region: Record<string, [number, number, number, number]> = {
    A1: [tx, PAD.top, PAD.left + plotW, ty],
    A2: [PAD.left, PAD.top, tx, ty],
    B1: [tx, ty, PAD.left + plotW, PAD.top + plotH],
    B2: [PAD.left, ty, tx, PAD.top + plotH],
  };
  const axis = { fontFamily: font.mono, fontSize: 10 };
  const [rx1, ry1, rx2, ry2] = region[selected] ?? [0, 0, 0, 0];
  const others = points.filter((p) => p.group !== selected);
  const mine = points.filter((p) => p.group === selected);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View style={{ position: "relative" }}>
          <Svg width={width} height={height} role="img" aria-label={accessibilityLabel}>
            <Rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill={color["surface-sunken"]} />
            <Rect x={rx1} y={ry1} width={Math.max(0, rx2 - rx1)} height={Math.max(0, ry2 - ry1)} fill={color["brand-tint"]} />
            {[0, 20, 40, 60, 80, 100].map((t) => (
              <SvgText key={`y${t}`} x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fill={color["ink-subtle"]} {...axis}>{`${t}%`}</SvgText>
            ))}
            {Array.from({ length: xMax + 1 }, (_, t) => (
              <SvgText key={`x${t}`} x={x(t)} y={PAD.top + plotH + 14} textAnchor="middle" fill={color["ink-subtle"]} {...axis}>{String(t)}</SvgText>
            ))}
            <SvgText x={PAD.left + plotW / 2} y={height - 6} textAnchor="middle" fill={color["ink-muted"]} fontFamily={font.sans} fontSize={11}>{xLabel}</SvgText>
            <SvgText x={12} y={PAD.top + plotH / 2} textAnchor="middle" fill={color["ink-muted"]} fontFamily={font.sans} fontSize={11} transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>{yLabel}</SvgText>
            <Line x1={tx} x2={tx} y1={PAD.top} y2={PAD.top + plotH} stroke={color["ink-muted"]} strokeWidth={1} strokeDasharray="4 3" />
            <Line x1={PAD.left} x2={PAD.left + plotW} y1={ty} y2={ty} stroke={color["ink-muted"]} strokeWidth={1} strokeDasharray="4 3" />
            {(["A2", "A1", "B2", "B1"] as const).map((q) => {
              const [x1, y1, x2, y2] = region[q];
              const right = q.endsWith("1");
              const top = q.startsWith("A");
              return (
                <React.Fragment key={q}>
                  <SvgText x={right ? x2 - 6 : x1 + 6} y={top ? y1 + 12 : y2 - 18} textAnchor={right ? "end" : "start"} fill={color["ink-muted"]} {...axis}>{q}</SvgText>
                  <SvgText x={right ? x2 - 6 : x1 + 6} y={top ? y1 + 28 : y2 - 4} textAnchor={right ? "end" : "start"} fill={color.ink} fontFamily={font.mono} fontSize={14} fontWeight="600">
                    {String(counts[q] ?? 0)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {others.map((p) => (
              <Circle key={p.id} cx={x(p.x)} cy={y(p.y)} r={3.5} fill={color["ink-subtle"]} opacity={0.7} onPress={() => setActive(p)} />
            ))}
            {mine.map((p) => (
              <Circle key={p.id} cx={x(p.x)} cy={y(p.y)} r={4.5} fill={color["data-1"]} stroke={color.surface} strokeWidth={1.5} onPress={() => setActive(p)} />
            ))}
          </Svg>
          {active ? (
            <View
              pointerEvents="none"
              className="bg-surface border border-border rounded-ds-md"
              style={{ position: "absolute", left: Math.min(Math.max(x(active.x) - 90, 0), Math.max(width - 180, 0)), top: Math.max(0, y(active.y) - 70), width: 180, padding: 8, boxShadow: shadow.overlay } as object}
            >
              <Text className="text-ink font-medium" style={{ fontSize: 12 }} numberOfLines={1}>{active.name}</Text>
              <Text className="text-ink-muted" style={{ fontSize: 12 }}>{`${fmtNumber(active.y, 0)}% · ${fmtNumber(active.x, 1)} dias/sem. · ${active.group}`}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <View className="flex-row flex-wrap" style={{ gap: 16, marginTop: 8 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color["data-1"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Aluno no quadrante selecionado</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color["ink-subtle"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Demais alunos</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>Limiares configurados</Text>
        </View>
      </View>
    </View>
  );
}
