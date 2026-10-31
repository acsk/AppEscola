import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color, shadow } from "../../constants/theme";

type Props = {
  title: string;
  /** Linhas do texto explicativo (descrição, fórmula, tratamento de ausentes). */
  lines: string[];
};

/** Botão "i" com o cálculo do indicador: abre no hover (web), no foco e no toque. */
export default function InfoTip({ title, lines }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: "relative", zIndex: open ? 20 : 0 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        onHoverIn={() => setOpen(true)}
        onHoverOut={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel={`Como é calculado: ${title}`}
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: color["border-strong"],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text className="font-semibold text-ink-subtle" style={{ fontSize: 10, lineHeight: 12 }}>
          i
        </Text>
      </Pressable>
      {open ? (
        <View
          role="tooltip"
          className="bg-surface border border-border rounded-ds-md"
          style={{
            position: "absolute",
            top: 24,
            left: -122,
            width: 260,
            paddingVertical: 10,
            paddingHorizontal: 12,
            boxShadow: shadow.overlay,
          } as object}
        >
          <Text className="font-semibold text-ink" style={{ fontSize: 12, lineHeight: 18, marginBottom: 2 }}>
            {title}
          </Text>
          {lines.filter(Boolean).map((line) => (
            <Text key={line} className="text-ink-muted" style={{ fontSize: 12, lineHeight: 18 }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
