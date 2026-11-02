import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtNumber } from "./format";
import type { BiHeatmap } from "../../services/biService";

type Props = {
  heatmap: BiHeatmap;
  goal: number;
  minSample: number;
  /** Descrição da tabela para leitores de tela. */
  tableLabel: string;
  /** O que a contagem de cada célula representa. */
  countLabel?: string;
  /** Complemento do valor no tooltip (ex.: "de acertos", "de média"). */
  valueLabel?: string;
};

const STEPS = ["seq-1", "seq-2", "seq-3", "seq-4", "seq-5"] as const;
const LABEL_WIDTH = 132;
const CELL_WIDTH = 104;
const CELL_HEIGHT = 34;
const GAP = 2;

/** Faixas de 20 p.p.: 0–19 → seq-1 … 80–100 → seq-5. */
const step = (value: number) => STEPS[Math.min(4, Math.floor(value / 20))];

/** Hachura para célula sem amostra mínima (no web); no nativo fica só o fundo neutro com "—". */
const hatch =
  Platform.OS === "web"
    ? ({
        backgroundImage: `repeating-linear-gradient(135deg, ${color["border"]} 0 1px, transparent 1px 6px)`,
      } as object)
    : {};

/**
 * Mapa de calor turmas × assuntos: escala sequencial de um só tom, número na célula, ▾ abaixo da meta
 * (a cor nunca é a única pista) e célula hachurada quando a amostra é insuficiente — nunca zero.
 */
export default function Heatmap({ heatmap, goal, minSample, tableLabel, countLabel = "respostas", valueLabel = "de acertos" }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const { topics, rows } = heatmap;

  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ minWidth: LABEL_WIDTH + topics.length * (CELL_WIDTH + GAP), flexGrow: 1 }} role="table" aria-label={tableLabel}>
          <View className="flex-row" role="row" style={{ alignItems: "flex-end", marginBottom: 6 }}>
            <Text role="columnheader" className="font-medium text-ink" style={{ width: LABEL_WIDTH, fontSize: 13 }}>
              Turma
            </Text>
            {topics.map((topic) => (
              <Text
                key={topic.topic_id}
                role="columnheader"
                className="text-ink-muted"
                numberOfLines={2}
                style={{ flex: 1, minWidth: CELL_WIDTH, marginLeft: GAP, fontSize: 11, lineHeight: 14, textAlign: "center", paddingHorizontal: 4 }}
              >
                {topic.name}
              </Text>
            ))}
          </View>

          {rows.map((row) => (
            <View key={row.school_class_id} className="flex-row" role="row" style={{ marginTop: GAP, alignItems: "center" }}>
              <Text role="rowheader" className="text-ink" numberOfLines={1} style={{ width: LABEL_WIDTH, fontSize: 13, paddingRight: 8 }}>
                {row.name}
              </Text>
              {row.cells.map((cell, i) => {
                const id = `${row.school_class_id}:${cell.topic_id}`;
                const topicName = cell.label ?? topics[i]?.name ?? "";
                const tip =
                  (cell.value === null
                    ? `${row.name} · ${topicName}: amostra insuficiente (${cell.answers} de ${minSample} ${countLabel})`
                    : `${row.name} · ${topicName}: ${fmtNumber(cell.value, 1)}% ${valueLabel} em ${cell.answers.toLocaleString("pt-BR")} ${countLabel}${cell.below_goal ? " · abaixo da meta" : ""}`) +
                  (cell.extra ? ` · ${cell.extra}` : "");
                const strong = cell.value !== null && cell.value >= 60;

                return (
                  <Pressable
                    key={cell.topic_id}
                    role="cell"
                    aria-label={tip}
                    focusable
                    onHoverIn={() => setHover(id)}
                    onHoverOut={() => setHover((h) => (h === id ? null : h))}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover((h) => (h === id ? null : h))}
                    onPress={() => setHover((h) => (h === id ? null : id))}
                    style={[
                      {
                        flex: 1,
                        minWidth: CELL_WIDTH,
                        height: CELL_HEIGHT,
                        marginLeft: GAP,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: cell.value === null ? color.surface : color[step(cell.value)],
                        borderWidth: hover === id ? 2 : 0,
                        borderColor: color.ink,
                        position: "relative",
                      },
                      cell.value === null ? hatch : null,
                    ]}
                  >
                    <Text
                      className="font-mono"
                      style={{ fontSize: 12, color: cell.value === null ? color["ink-subtle"] : strong ? color["on-seq-strong"] : color.ink }}
                    >
                      {cell.value === null ? "—" : `${fmtNumber(cell.value, 0)}${cell.below_goal ? " ▾" : ""}`}
                    </Text>
                    {hover === id ? (
                      <View
                        pointerEvents="none"
                        className="bg-ink rounded-ds-sm"
                        style={{ position: "absolute", bottom: CELL_HEIGHT + 4, left: -40, right: -40, padding: 8, zIndex: 10 }}
                      >
                        <Text className="text-surface" style={{ fontSize: 12, lineHeight: 16, textAlign: "center" }}>
                          {tip}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="flex-row flex-wrap items-center" style={{ gap: 16 }}>
        <View className="flex-row items-center" style={{ gap: 4 }} aria-label="Escala de 0% a 100% de acertos">
          <Text className="text-ink-muted font-mono" style={{ fontSize: 11 }}>0%</Text>
          {STEPS.map((s) => (
            <View key={s} style={{ width: 22, height: 10, backgroundColor: color[s] }} />
          ))}
          <Text className="text-ink-muted font-mono" style={{ fontSize: 11 }}>100%</Text>
        </View>
        <Text className="text-ink-muted" style={{ fontSize: 12 }}>
          {`▾ abaixo da meta de ${fmtNumber(goal, 0)}%`}
        </Text>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View className="border border-border" style={[{ width: 16, height: 10, backgroundColor: color.surface }, hatch]} />
          <Text className="text-ink-muted" style={{ fontSize: 12 }}>
            {`amostra insuficiente (< ${minSample} ${countLabel}, não conta como zero)`}
          </Text>
        </View>
      </View>
      {heatmap.truncated ? (
        <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
          Mostrando as primeiras turmas em ordem alfabética. Filtre por curso ou turma para ver as demais.
        </Text>
      ) : null}
    </View>
  );
}
