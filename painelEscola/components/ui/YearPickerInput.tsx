import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import OverlayPortal from "./OverlayPortal";

const DEFAULT_MIN_YEAR = 1990;

type Props = {
  label: string;
  value: string;
  onChange: (year: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  modalTitle?: string;
  compact?: boolean;
};

function clampYear(year: number, minYear: number, maxYear: number) {
  return Math.min(maxYear, Math.max(minYear, year));
}

export default function YearPickerInput({
  label,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  minYear = DEFAULT_MIN_YEAR,
  maxYear = new Date().getFullYear(),
  modalTitle = "Selecionar ano",
  compact = false,
}: Props) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const parsedValue = value.trim() ? Number(value) : NaN;
  const selectedYear = Number.isFinite(parsedValue) ? parsedValue : null;

  const [decadeStart, setDecadeStart] = useState(() => {
    const base = selectedYear ?? maxYear;
    return Math.floor(clampYear(base, minYear, maxYear) / 10) * 10;
  });

  const decadeYears = useMemo(() => {
    const years: number[] = [];
    for (let year = decadeStart; year < decadeStart + 12; year += 1) {
      if (year >= minYear && year <= maxYear) {
        years.push(year);
      }
    }
    return years;
  }, [decadeStart, minYear, maxYear]);

  const openPicker = () => {
    if (disabled) return;
    const base = selectedYear ?? maxYear;
    setDecadeStart(Math.floor(clampYear(base, minYear, maxYear) / 10) * 10);
    setOpen(true);
  };

  const selectYear = (year: number) => {
    onChange(String(year));
    setOpen(false);
  };

  const clearYear = () => {
    onChange("");
  };

  const canGoPrevDecade = decadeStart - 10 >= minYear;
  const canGoNextDecade = decadeStart + 10 <= maxYear;

  const borderColor = error ? "var(--ds-danger)" : "var(--ds-border-strong)"; // `border-strong` em controles
  const modalWidth = Math.min(width - 32, 360);

  return (
    <View className={compact ? "mb-2" : "mb-4"}>
      <Text
        className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}
      >
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
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
          backgroundColor: disabled ? "var(--ds-surface-sunken)" : "var(--ds-surface)",
          width: "100%",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <TouchableOpacity
          onPress={openPicker}
          disabled={disabled}
          activeOpacity={0.85}
          style={{ flex: 1, justifyContent: "center" }}
        >
          <Text
            style={{
              fontSize: 14,
              color: selectedYear ? "var(--ds-ink)" : "var(--ds-ink-subtle)",
            }}
            numberOfLines={1}
          >
            {selectedYear ? String(selectedYear) : "Selecione o ano"}
          </Text>
        </TouchableOpacity>
        {selectedYear && !disabled && !required ? (
          <TouchableOpacity
            onPress={clearYear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginRight: 8 }}
          >
            <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={openPicker} disabled={disabled} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={18} color={disabled ? "var(--ds-border-strong)" : "var(--ds-brand)"} />
        </TouchableOpacity>
      </View>

      {error ? <Text className="text-xs text-danger mt-1">{error}</Text> : null}

      <OverlayPortal open={open} onClose={() => setOpen(false)} contentPadding={16}>
          <View
            style={{
              width: modalWidth,
              backgroundColor: "var(--ds-surface)",
              borderRadius: 4,
              overflow: "hidden",
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
                borderBottomColor: "var(--ds-surface-sunken)",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: "var(--ds-ink)" }}>{modalTitle}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={{ padding: 4, backgroundColor: "var(--ds-surface-sunken)", borderRadius: 4 }}
              >
                <Ionicons name="close" size={18} color="var(--ds-ink-muted)" />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: "var(--ds-surface-sunken)",
                borderBottomWidth: 1,
                borderBottomColor: "var(--ds-surface-sunken)",
              }}
            >
              <TouchableOpacity
                onPress={() => canGoPrevDecade && setDecadeStart((d) => d - 10)}
                disabled={!canGoPrevDecade}
                style={{ padding: 8, opacity: canGoPrevDecade ? 1 : 0.35 }}
              >
                <Ionicons name="chevron-back" size={20} color="var(--ds-ink-muted)" />
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "var(--ds-ink)" }}>
                {decadeStart} – {Math.min(decadeStart + 11, maxYear)}
              </Text>
              <TouchableOpacity
                onPress={() => canGoNextDecade && setDecadeStart((d) => d + 10)}
                disabled={!canGoNextDecade}
                style={{ padding: 8, opacity: canGoNextDecade ? 1 : 0.35 }}
              >
                <Ionicons name="chevron-forward" size={20} color="var(--ds-ink-muted)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 280 }}
              contentContainerStyle={{
                flexDirection: "row",
                flexWrap: "wrap",
                padding: 12,
                gap: 8,
                justifyContent: "center",
              }}
            >
              {decadeYears.map((year) => {
                const active = selectedYear === year;
                return (
                  <TouchableOpacity
                    key={year}
                    onPress={() => selectYear(year)}
                    style={{
                      width: "22%",
                      minWidth: 68,
                      paddingVertical: 12,
                      borderRadius: 4,
                      alignItems: "center",
                      backgroundColor: active ? "var(--ds-brand)" : "var(--ds-surface-sunken)",
                      borderWidth: 1,
                      borderColor: active ? "var(--ds-brand)" : "var(--ds-border)",
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: active ? "var(--ds-on-brand)" : "var(--ds-ink)",
                      }}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
      </OverlayPortal>
    </View>
  );
}
