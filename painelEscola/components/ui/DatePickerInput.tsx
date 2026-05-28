import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Calendar from "./Calendar";
import { maskDate, displayToISO } from "../../utils/masks";
import { parseDisplayDate, parseIsoDate } from "../../utils/calendar";

type Props = {
  label: string;
  /** Valor em DD/MM/AAAA */
  value: string;
  /** Chamado com o novo valor em DD/MM/AAAA */
  onChangeText: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  minDate?: Date;
  maxDate?: Date;
  modalTitle?: string;
};

export default function DatePickerInput({
  label,
  value,
  onChangeText,
  error,
  required,
  disabled = false,
  compact = false,
  minDate,
  maxDate,
  modalTitle = "Selecionar data",
}: Props) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const selectedDate = useMemo(() => {
    const fromDisplay = parseDisplayDate(value);
    if (fromDisplay) return fromDisplay;
    const iso = displayToISO(value);
    if (iso) return parseIsoDate(iso);
    return null;
  }, [value]);

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
  };

  const applyDate = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    onChangeText(`${dd}/${mm}/${yyyy}`);
    setOpen(false);
  };

  const clearDate = () => {
    if (required) return;
    onChangeText("");
    setOpen(false);
  };

  const borderColor = error ? "#EF4444" : "#E5E7EB";
  const modalWidth = Math.min(width - 32, 340);

  return (
    <View className={compact ? "mb-2" : "mb-4"}>
      <Text
        className={`font-semibold text-gray-700 ${compact ? "text-xs mb-1" : "text-sm mb-1.5"}`}
      >
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          paddingHorizontal: 14,
          height: 44,
          backgroundColor: disabled ? "#F3F4F6" : "#F9FAFB",
          opacity: disabled ? 0.7 : 1,
        }}
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

        {value && !disabled && !required ? (
          <TouchableOpacity
            onPress={clearDate}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginRight: 8 }}
          >
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={openPicker} disabled={disabled} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={18} color={disabled ? "#D1D5DB" : "#7C3AED"} />
        </TouchableOpacity>
      </View>

      {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
            <View
              style={{
                width: modalWidth,
                backgroundColor: "white",
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>
                  {modalTitle}
                </Text>
                <TouchableOpacity
                  onPress={() => setOpen(false)}
                  style={{ padding: 4, backgroundColor: "#F3F4F6", borderRadius: 8 }}
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 14 }}>
                <Calendar
                  value={selectedDate}
                  onChange={applyDate}
                  minDate={minDate}
                  maxDate={maxDate}
                  onClear={!required ? clearDate : undefined}
                />
              </View>
            </View>
        </View>
      </Modal>
    </View>
  );
}
