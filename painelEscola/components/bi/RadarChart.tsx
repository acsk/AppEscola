import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import { color, font } from "../../constants/theme";
import { fmtNumber } from "./format";

type Axis = { label: string; value: number | null; compare: number | null };

type Props = {
  axes: Axis[];
  seriesName: string;
  compareName: string;
  size?: number;
};

/**
 * Radar de 0 a 100: série principal em data-1 e comparação tracejada (neutra). Eixo sem valor fica
 * no centro e marcado "sem amostra" — nunca como zero de verdade na legenda.
 */
export default function RadarChart({ axes, seriesName, compareName, size = 260 }: Props) {
  const c = size / 2;
  const r = size / 2 - 44;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const point = (i: number, v: number) => [c + Math.cos(angle(i)) * r * (v / 100), c + Math.sin(angle(i)) * r * (v / 100)];
  const polygon = (pick: (a: Axis) => number | null) => axes.map((a, i) => point(i, pick(a) ?? 0).join(",")).join(" ");
  const hasCompare = axes.some((a) => a.compare !== null);

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View style={{ width: 14, height: 2, backgroundColor: color["data-1"] }} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>{seriesName}</Text>
        </View>
        {hasCompare ? (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View style={{ width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color["ink-muted"] }} />
            <Text className="text-ink-muted" style={{ fontSize: 12 }}>{compareName}</Text>
          </View>
        ) : null}
      </View>
      <Svg
        width={size}
        height={size}
        role="img"
        aria-label={`${seriesName}: ${axes.map((a) => `${a.label} ${a.value === null ? "sem amostra" : fmtNumber(a.value, 0)}`).join(", ")}`}
      >
        {[25, 50, 75, 100].map((ring) => (
          <Polygon key={ring} points={axes.map((_, i) => point(i, ring).join(",")).join(" ")} fill="none" stroke={color.border} strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 100);
          return <Line key={`ax${i}`} x1={c} y1={c} x2={x} y2={y} stroke={color.border} strokeWidth={1} />;
        })}
        {hasCompare ? (
          <Polygon points={polygon((a) => a.compare)} fill="none" stroke={color["ink-muted"]} strokeWidth={1.5} strokeDasharray="4 3" />
        ) : null}
        <Polygon points={polygon((a) => a.value)} fill={color["data-1"]} fillOpacity={0.12} stroke={color["data-1"]} strokeWidth={2} strokeLinejoin="round" />
        {axes.map((a, i) => {
          if (a.value === null) return null;
          const [x, y] = point(i, a.value);
          return <Circle key={`p${i}`} cx={x} cy={y} r={4} fill={color["data-1"]} stroke={color.surface} strokeWidth={2} />;
        })}
        {axes.map((a, i) => {
          const [x, y] = point(i, 122);
          return (
            <SvgText key={`l${i}`} x={x} y={y} textAnchor="middle" fill={color.ink} fontFamily={font.sans} fontSize={12}>
              {`${a.label} ${a.value === null ? "—" : fmtNumber(a.value, 0)}`}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
