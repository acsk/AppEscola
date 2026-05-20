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
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>

      <View
        className={`flex-row items-center border rounded-xl px-4 ${
          disabled ? "bg-gray-100" : "bg-gray-50"
        } ${error ? "border-red-400" : "border-gray-200"}`}
        style={{ height: 44 }}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(v) => onChangeText(maskDateTime(v))}
          placeholder="DD/MM/AAAA HH:MM"
          placeholderTextColor="#9CA3AF"
          className={`flex-1 text-sm ${disabled ? "text-gray-400" : "text-gray-800"}`}
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
          <Ionicons name="calendar-outline" size={18} color={disabled ? "#D1D5DB" : "#7C3AED"} />
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

      {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}
    </View>
  );
}
