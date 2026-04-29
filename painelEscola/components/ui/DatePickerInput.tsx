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
};

export default function DatePickerInput({
  label,
  value,
  onChangeText,
  error,
  required,
}: Props) {
  // Ref para o input nativo oculto (somente web)
  const hiddenRef = useRef<any>(null);

  const openCalendar = () => {
    if (!hiddenRef.current) return;
    try {
      hiddenRef.current.showPicker?.();
    } catch {
      hiddenRef.current.click();
    }
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
        className={`flex-row items-center bg-gray-50 border rounded-xl px-4 ${
          error ? "border-red-400" : "border-gray-200"
        }`}
        style={{ height: 44 }}
      >
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(maskDate(v))}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-sm text-gray-800"
          maxLength={10}
          keyboardType="numeric"
        />

        <TouchableOpacity onPress={openCalendar} className="pl-2" activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
        </TouchableOpacity>

        {/* Input nativo oculto — usado apenas na web para abrir o seletor do SO */}
        {Platform.OS === "web" && (
          <input
            ref={hiddenRef}
            type="date"
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

      {error ? (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
