import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Calendar from "./Calendar";
import OverlayPortal from "./OverlayPortal";
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

  const borderColor = error ? "#B0261B" : "#7A8393"; // `border-strong` em controles
  const modalWidth = Math.min(width - 32, 340);

  return (
    <View className={compact ? "mb-2" : "mb-4"}>
      <Text
        className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}
      >
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor,
          borderRadius: 4,
          paddingHorizontal: 12,
          height: 38,
          backgroundColor: disabled ? "#F7F8FA" : "#FFFFFF",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(maskDate(v))}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#5F6878"
          className={`flex-1 text-sm ${disabled ? "text-ink-subtle" : "text-ink"}`}
          style={{ minWidth: 0 }}
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
            <Ionicons name="close-circle" size={16} color="#5F6878" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={openPicker} disabled={disabled} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={18} color={disabled ? "#7A8393" : "#1C3D63"} />
        </TouchableOpacity>
      </View>

      {error ? <Text className="text-xs text-danger mt-1">{error}</Text> : null}

      <OverlayPortal open={open} onClose={() => setOpen(false)} contentPadding={16}>
            <View
              style={{
                width: modalWidth,
                backgroundColor: "white",
                borderRadius: 4,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "#D9DDE3",
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
                  borderBottomColor: "#F7F8FA",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#111722" }}>
                  {modalTitle}
                </Text>
                <TouchableOpacity
                  onPress={() => setOpen(false)}
                  style={{ padding: 4, backgroundColor: "#F7F8FA", borderRadius: 4 }}
                >
                  <Ionicons name="close" size={18} color="#4B5463" />
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
      </OverlayPortal>
    </View>
  );
}
