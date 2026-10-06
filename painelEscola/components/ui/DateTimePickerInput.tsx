import React, { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { maskDateTime, displayDateTimeToISO } from "../../utils/masks";
import { useRestrictTextInput } from "../../hooks/useRestrictTextInput";

type Props = {
  label: string;
  /** Valor em DD/MM/AAAA HH:MM */
  value: string;
  /** Chamado com o novo valor em DD/MM/AAAA HH:MM */
  onChangeText: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function DateTimePickerInput({
  label,
  value,
  onChangeText,
  error,
  required,
  disabled = false,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);

  useRestrictTextInput(inputRef, "digits", !disabled);

  const openCalendar = () => {
    if (disabled || !hiddenRef.current) return;
    try {
      hiddenRef.current.showPicker?.();
    } catch {
      hiddenRef.current.click();
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) return;
    const [datePart, timePart] = raw.split("T");
    if (!datePart) return;
    const [year, month, day] = datePart.split("-");
    const time = timePart ? timePart.slice(0, 5) : "00:00";
    onChangeText(`${day}/${month}/${year} ${time}`);
  };

  const isoValue = (() => {
    const full = displayDateTimeToISO(value);
    return full ? full.slice(0, 16) : "";
  })();

  return (
    <View className="mb-4">
      <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>

      <View
        className={`flex-row items-center border rounded-ds-md px-3 ${
          disabled ? "bg-surface-sunken" : "bg-surface"
        } ${error ? "border-danger" : "border-border-strong"}`}
        style={{ height: 38 }}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(v) => onChangeText(maskDateTime(v))}
          placeholder="DD/MM/AAAA HH:MM"
          placeholderTextColor="#5F6878"
          className={`flex-1 text-sm ${disabled ? "text-ink-subtle" : "text-ink"}`}
          style={{ minWidth: 0 }}
          maxLength={16}
          keyboardType="numeric"
          editable={!disabled}
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          {...(Platform.OS === "web" ? ({ inputMode: "numeric" } as object) : {})}
        />

        <TouchableOpacity
          onPress={openCalendar}
          className="pl-2"
          activeOpacity={disabled ? 1 : 0.7}
          disabled={disabled}
        >
          <Ionicons name="calendar-outline" size={18} color={disabled ? "#7A8393" : "#1C3D63"} />
        </TouchableOpacity>

        {Platform.OS === "web" && (
          <input
            ref={hiddenRef}
            type="datetime-local"
            value={isoValue}
            onChange={handleNativeChange}
            style={{
              position: "absolute",
              opacity: 0,
              width: 1,
              height: 1,
              border: "none",
              pointerEvents: "none",
            }}
            tabIndex={-1}
            aria-hidden="true"
          />
        )}
      </View>

      {error ? <Text className="text-xs text-danger mt-1">{error}</Text> : null}
    </View>
  );
}
