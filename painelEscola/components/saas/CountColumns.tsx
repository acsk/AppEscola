import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color } from "../../constants/theme";

export type CountPoint = { key: string; label: string; value: number };

/** Colunas de uma série (contagens por mês), em `brand`; valor no hover/foco e no rótulo acessível. */
export default function CountColumns({ points, unit, height = 160, format }: { points: CountPoint[]; unit: string; height?: number; format?: (value: number) => string }) {
  const show = (v: number) => (format ? format(v) : `${v.toLocaleString("pt-BR")} ${unit}`);
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(0, ...points.map((p) => p.value));
  const scale = (v: number) => (max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * height) : 0);
  const active = points.find((p) => p.key === hovered);

  return (
    <View style={{ gap: 8 }}>
      <Text className="font-mono text-ink-muted" style={{ fontSize: 12, minHeight: 16 }}>
        {active ? `${active.label}: ${show(active.value)}` : `Máximo: ${show(max)}`}
      </Text>
      <View className="flex-row border-b border-border" style={{ height, alignItems: "flex-end", gap: 4 }}>
        {points.map((p) => (
          <Pressable
            key={p.key}
            onHoverIn={() => setHovered(p.key)}
            onHoverOut={() => setHovered(null)}
            onFocus={() => setHovered(p.key)}
            onBlur={() => setHovered(null)}
            aria-label={`${p.label}: ${show(p.value)}`}
            style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
          >
            <View style={{ width: "70%", maxWidth: 28, height: scale(p.value), backgroundColor: hovered && hovered !== p.key ? color["border-strong"] : color.brand, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          </Pressable>
        ))}
      </View>
      <View className="flex-row" style={{ gap: 4 }}>
        {points.map((p, i) => (
          <Text key={p.key} className="font-mono text-ink-subtle" style={{ flex: 1, fontSize: 10, textAlign: "center" }} numberOfLines={1}>
            {points.length > 12 && i % 2 === 1 ? "" : p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
