import React, { useRef } from "react";
import { View, Text, TextInput, TextInputProps, Platform } from "react-native";
import { color, size } from "../../constants/theme";
import { useRestrictTextInput, type TextInputRestriction } from "../../hooks/useRestrictTextInput";
import {
  maskCurrency,
  maskPaymentDueDay,
  onlyDecimalInput,
  onlyIntegerInput,
} from "../../utils/masks";

type Props = TextInputProps & {
  label: string;
  error?: string;
  required?: boolean;
  /** Filtra e bloqueia caracteres inválidos (necessário na web). */
  valueFormat?: "integer" | "decimal" | "currency" | "dueDay";
  maxDigits?: number;
  decimalPlaces?: number;
  dense?: boolean;
};

const VALUE_FORMAT_TO_RESTRICTION: Record<
  NonNullable<Props["valueFormat"]>,
  TextInputRestriction
> = {
  integer: "integer",
  decimal: "decimal",
  currency: "digits",
  dueDay: "integer",
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
  dense = false,
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
    if (valueFormat === "currency") {
      onChangeText(maskCurrency(text));
      return;
    }
    if (valueFormat === "dueDay") {
      onChangeText(maskPaymentDueDay(text));
      return;
    }
    onChangeText(text);
  };

  const resolvedKeyboardType =
    keyboardType ??
    (valueFormat === "integer" || valueFormat === "dueDay"
      ? "number-pad"
      : valueFormat === "decimal" || valueFormat === "currency"
        ? "decimal-pad"
        : undefined);

  const webInputMode =
    valueFormat === "integer" || valueFormat === "dueDay"
      ? "numeric"
      : valueFormat === "decimal" || valueFormat === "currency"
        ? "decimal"
        : undefined;

  return (
    <View className={dense ? "mb-2" : "mb-4"}>
      <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>
      <TextInput
        ref={inputRef}
        {...props}
        editable={editable}
        aria-invalid={!!error}
        aria-label={props["aria-label"] ?? label}
        className={`border rounded-ds-md px-3 text-sm text-ink ${
          editable === false ? "bg-surface-sunken text-ink-muted" : "bg-surface"
        } ${error ? "border-danger" : "border-border-strong"} ${props.className ?? ""}`}
        style={[{ height: props.multiline ? undefined : size["control-md"], minHeight: size["control-md"] }, props.style]}
        placeholderTextColor={color["ink-subtle"]}
        keyboardType={resolvedKeyboardType}
        onChangeText={handleChangeText}
        autoComplete={valueFormat ? "off" : props.autoComplete}
        autoCorrect={valueFormat ? false : props.autoCorrect}
        spellCheck={valueFormat ? false : props.spellCheck}
        {...(Platform.OS === "web" && webInputMode ? ({ inputMode: webInputMode } as object) : {})}
      />
      {error && (
        <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
