import React from "react";
import { Pressable, Text, View } from "react-native";
import { color } from "../../constants/theme";

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Botões segmentados (ex.: Online / Presencial); selecionado em `surface-sunken`. */
export default function SegmentedControl<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View className="flex-row border border-border-strong rounded-ds-sm overflow-hidden" role="group" aria-label={accessibilityLabel}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={selected ? "bg-surface-sunken" : "bg-surface"}
            style={{ height: 30, paddingHorizontal: 12, justifyContent: "center", borderLeftWidth: i ? 1 : 0, borderColor: color.border }}
          >
            <Text className={`font-medium ${selected ? "text-ink" : "text-ink-muted"}`} style={{ fontSize: 13 }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
