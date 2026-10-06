import React from "react";
import { View, Text } from "react-native";
import { color, font, size } from "../../constants/theme";

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
      <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>
      {/* Renderização nativa para web */}
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        aria-invalid={!!error}
        style={{
          border: `1px solid ${error ? color.danger : color["border-strong"]}`,
          borderRadius: 4,
          padding: "0 12px",
          fontSize: 14,
          fontFamily: font.sans,
          color: disabled ? color["ink-muted"] : value !== "" ? color.ink : color["ink-subtle"],
          backgroundColor: disabled ? color["surface-sunken"] : color.surface,
          width: "100%",
          height: dense ? size["control-sm"] : size["control-md"],
          cursor: disabled ? "not-allowed" : "pointer",
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
        <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
