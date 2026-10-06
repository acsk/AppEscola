import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

type Option<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Permite desmarcar clicando na opção selecionada. */
  allowClear?: boolean;
};

/** Escolha única com até 4 opções (role="radiogroup"). */
export default function SegmentedControl<T extends string | number>({ label, options, value, onChange, allowClear = true }: Props<T>) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-ink-muted mb-1" nativeID={`seg-${label}`}>
        {label}
      </Text>
      <View
        role="radiogroup"
        aria-labelledby={`seg-${label}`}
        className="flex-row rounded-ds-md border border-border-strong overflow-hidden"
      >
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              role="radio"
              aria-checked={selected}
              onPress={() => onChange(selected && allowClear ? null : option.value)}
              className={`flex-1 items-center justify-center px-2 ${selected ? "bg-surface-sunken" : "bg-surface"}`}
              style={{ height: 40, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: "var(--ds-border)" }}
              activeOpacity={0.85}
            >
              <Text className={`text-xs font-semibold ${selected ? "text-ink" : "text-ink-muted"}`}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
