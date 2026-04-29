import React from "react";
import { View, Text } from "react-native";

export type SelectOption = { value: string | number; label: string };

type Props = {
  label: string;
  value: string | number;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
};

export default function FormSelect({
  label,
  value,
  options,
  onChange,
  error,
  placeholder,
  required,
}: Props) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      {/* Renderização nativa para web */}
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: `1px solid ${error ? "#FCA5A5" : "#E5E7EB"}`,
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 14,
          color: value ? "#1F2937" : "#9CA3AF",
          backgroundColor: "#F9FAFB",
          outline: "none",
          width: "100%",
          height: 42,
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
