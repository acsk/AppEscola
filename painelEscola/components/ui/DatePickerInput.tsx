import React, { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { maskDate, displayToISO, isoToDisplay } from "../../utils/masks";

type Props = {
  label: string;
  /** Valor em DD/MM/AAAA */
  value: string;
  /** Chamado com o novo valor em DD/MM/AAAA */
  onChangeText: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function DatePickerInput({
  label,
  value,
  onChangeText,
  error,
  required,
  disabled = false,
}: Props) {
  // Ref para o input nativo oculto (somente web)
  const hiddenRef = useRef<any>(null);

  const openCalendar = () => {
    if (disabled || !hiddenRef.current) return;
    const el = hiddenRef.current as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // showPicker pode falhar fora de gesto do usuário em alguns browsers
    }
    el.click();
  };

  const handleNativeChange = (e: any) => {
    const iso = e.target.value; // yyyy-mm-dd
    if (iso) onChangeText(isoToDisplay(iso));
  };

  // Valor ISO para o input nativo (yyyy-mm-dd)
  const isoValue = displayToISO(value);

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>

      <View
        className={`flex-row items-center border rounded-xl px-4 ${
          disabled ? "bg-gray-100" : "bg-gray-50"
        } ${
          error ? "border-red-400" : "border-gray-200"
        }`}
        style={{ height: 44 }}
      >
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(maskDate(v))}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#9CA3AF"
          className={`flex-1 text-sm ${disabled ? "text-gray-400" : "text-gray-800"}`}
          maxLength={10}
          keyboardType="numeric"
          editable={!disabled}
        />

        {Platform.OS === "web" ? (
          <View className="relative" style={{ width: 40, height: 40 }}>
            <input
              ref={hiddenRef}
              type="date"
              value={isoValue}
              onChange={handleNativeChange}
              disabled={disabled}
              title="Abrir calendário"
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                width: "100%",
                height: "100%",
                cursor: disabled ? "not-allowed" : "pointer",
                zIndex: 2,
              }}
            />
            <View
              className="absolute inset-0 items-center justify-center"
              pointerEvents="none"
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={disabled ? "#D1D5DB" : "#7C3AED"}
              />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={openCalendar}
            className="pl-2"
            activeOpacity={disabled ? 1 : 0.7}
            disabled={disabled}
          >
            <Ionicons name="calendar-outline" size={18} color={disabled ? "#D1D5DB" : "#7C3AED"} />
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
