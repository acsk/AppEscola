import React, { useRef } from "react";
import { View, Text, TextInput, TextInputProps, Platform } from "react-native";
import { useRestrictTextInput, type TextInputRestriction } from "../../hooks/useRestrictTextInput";
import { onlyDecimalInput, onlyIntegerInput } from "../../utils/masks";

type Props = TextInputProps & {
  label: string;
  error?: string;
  required?: boolean;
  /** Filtra e bloqueia caracteres inválidos (necessário na web). */
  valueFormat?: "integer" | "decimal";
  maxDigits?: number;
  decimalPlaces?: number;
};

const VALUE_FORMAT_TO_RESTRICTION: Record<NonNullable<Props["valueFormat"]>, TextInputRestriction> = {
  integer: "integer",
  decimal: "decimal",
};

export default function FormInput({
  label,
  error,
  required,
  valueFormat,
  maxDigits,
  decimalPlaces = 2,
  onChangeText,
  keyboardType,
  editable = true,
  ...props
}: Props) {
  const inputRef = useRef<TextInput>(null);

  useRestrictTextInput(
    inputRef,
    valueFormat ? VALUE_FORMAT_TO_RESTRICTION[valueFormat] : undefined,
    editable !== false
  );

  const handleChangeText = (text: string) => {
    if (!onChangeText) return;
    if (valueFormat === "integer") {
      onChangeText(onlyIntegerInput(text, maxDigits));
      return;
    }
    if (valueFormat === "decimal") {
      onChangeText(onlyDecimalInput(text, decimalPlaces));
      return;
    }
    onChangeText(text);
  };

  const resolvedKeyboardType =
    keyboardType ??
    (valueFormat === "integer" ? "number-pad" : valueFormat === "decimal" ? "decimal-pad" : undefined);

  const webInputMode =
    valueFormat === "integer" ? "numeric" : valueFormat === "decimal" ? "decimal" : undefined;

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      <TextInput
        ref={inputRef}
        {...props}
        editable={editable}
        className={`border rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-gray-50 ${
          error ? "border-red-400" : "border-gray-200"
        } ${props.className ?? ""}`}
        placeholderTextColor="#9CA3AF"
        keyboardType={resolvedKeyboardType}
        onChangeText={handleChangeText}
        autoComplete={valueFormat ? "off" : props.autoComplete}
        autoCorrect={valueFormat ? false : props.autoCorrect}
        spellCheck={valueFormat ? false : props.spellCheck}
        {...(Platform.OS === "web" && webInputMode ? ({ inputMode: webInputMode } as object) : {})}
      />
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
