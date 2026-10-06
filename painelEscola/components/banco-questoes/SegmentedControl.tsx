import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

type Option = { value: number; label: string };

type Props = {
  label: string;
  options: Option[];
  value: number | null;
  onChange: (value: number | null) => void;
  /** Permite desmarcar clicando na opção selecionada. */
  allowClear?: boolean;
};

/** Escolha única com até 4 opções (role="radiogroup"). */
export default function SegmentedControl({ label, options, value, onChange, allowClear = true }: Props) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-ink-muted mb-1" nativeID={`seg-${label}`}>
        {label}
      </Text>
      <View
        role="radiogroup"
        aria-labelledby={`seg-${label}`}
        className="flex-row rounded-ds-md border border-border overflow-hidden"
      >
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              role="radio"
              aria-checked={selected}
              onPress={() => onChange(selected && allowClear ? null : option.value)}
              className={`flex-1 items-center justify-center px-2 ${selected ? "bg-brand" : "bg-surface"}`}
              style={{ height: 40, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: "#D9DDE3" }}
              activeOpacity={0.85}
            >
              <Text className={`text-xs font-semibold ${selected ? "text-white" : "text-ink"}`}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
