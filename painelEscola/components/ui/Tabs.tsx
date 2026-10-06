import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { color } from "../../constants/theme";

export type TabItem<K extends string = string> = { id: K; label: string; count?: number | null };

type Props<K extends string> = {
  items: TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  /** Rótulo do grupo para leitores de tela. */
  accessibilityLabel?: string;
};

/** Abas sublinhadas (nunca pílulas): ativa com texto e sublinhado de 2px em `brand`. */
export default function Tabs<K extends string>({ items, value, onChange, accessibilityLabel }: Props<K>) {
  return (
    <View className="border-b border-border">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View role="tablist" aria-label={accessibilityLabel} className="flex-row" style={{ gap: 24 }}>
          {items.map((tab) => {
            const active = tab.id === value;
            return (
              <TouchableOpacity
                key={tab.id}
                role="tab"
                aria-selected={active}
                onPress={() => onChange(tab.id)}
                activeOpacity={0.7}
                className="flex-row items-center"
                style={{ height: 40, gap: 8 }}
              >
                <Text className={`text-sm font-medium ${active ? "text-brand" : "text-ink-muted"}`}>{tab.label}</Text>
                {tab.count !== undefined && (
                  <Text className="font-mono text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
                    {tab.count ?? "…"}
                  </Text>
                )}
                {active && (
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: color.brand }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
