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
  disabled?: boolean;
  /** Menos margem e label alinhado a outros campos densos */
  dense?: boolean;
};

export default function FormSelect({
  label,
  value,
  options,
  onChange,
  error,
  placeholder,
  required,
  disabled = false,
  dense = false,
}: Props) {
  return (
    <View className={dense ? "mb-2" : "mb-4"}>
      <Text
        className={`font-medium text-gray-600 ${dense ? "text-xs mb-1" : "text-sm font-semibold text-gray-700 mb-1.5"}`}
      >
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      {/* Renderização nativa para web */}
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          border: `1px solid ${error ? "#FCA5A5" : "#E5E7EB"}`,
          borderRadius: 12,
          padding: "0 14px",
          fontSize: 14,
          color: disabled ? "#9CA3AF" : value ? "#1F2937" : "#9CA3AF",
          backgroundColor: disabled ? "#F3F4F6" : "#F9FAFB",
          outline: "none",
          width: "100%",
          height: 44,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.8 : 1,
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
