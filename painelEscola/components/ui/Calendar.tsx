import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  WEEKDAY_LABELS_SHORT,
  addMonths,
  buildMonthGrid,
  formatMonthYear,
  isDateDisabled,
  isSameDay,
  startOfDay,
} from "../../utils/calendar";

export type CalendarProps = {
  /** Data selecionada */
  value?: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Exibe rodapé com Limpar / Hoje */
  showFooter?: boolean;
  onClear?: () => void;
};

export default function Calendar({
  value = null,
  onChange,
  minDate,
  maxDate,
  showFooter = true,
  onClear,
}: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);

  const [viewDate, setViewDate] = useState(() => {
    const base = value ?? today;
    return startOfDay(base);
  });

  useEffect(() => {
    if (value) {
      setViewDate(startOfDay(value));
    }
  }, [value?.getTime()]);

  const viewYear = viewDate.getFullYear();
  const viewMonthIndex = viewDate.getMonth();
  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonthIndex),
    [viewYear, viewMonthIndex]
  );

  const selectDay = (date: Date) => {
    if (isDateDisabled(date, minDate, maxDate)) return;
    onChange(startOfDay(date));
  };

  return (
    <View style={{ width: "100%" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          paddingBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => setViewDate((d) => addMonths(d, -1))}
          style={{ padding: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#6B7280" />
        </TouchableOpacity>

        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
          {formatMonthYear(viewDate)}
        </Text>

        <TouchableOpacity
          onPress={() => setViewDate((d) => addMonths(d, 1))}
          style={{ padding: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        {WEEKDAY_LABELS_SHORT.map((label) => (
          <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#9CA3AF" }}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((cell) => {
          const { date, inCurrentMonth } = cell;
          const selected = value ? isSameDay(date, value) : false;
          const isToday = isSameDay(date, today);
          const disabled = isDateDisabled(date, minDate, maxDate);

          let backgroundColor = "transparent";
          let textColor = inCurrentMonth ? "#374151" : "#D1D5DB";
          let fontWeight: "400" | "600" | "700" = "600";

          if (disabled) {
            textColor = "#E5E7EB";
          } else if (selected) {
            backgroundColor = "#7C3AED";
            textColor = "#FFFFFF";
            fontWeight = "700";
          } else if (isToday) {
            backgroundColor = "#EDE9FE";
            textColor = "#6D28D9";
            fontWeight = "700";
          }

          return (
            <View
              key={date.toISOString()}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
            >
              <TouchableOpacity
                onPress={() => selectDay(date)}
                disabled={disabled}
                activeOpacity={0.75}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  backgroundColor,
                  borderWidth: isToday && !selected ? 1 : 0,
                  borderColor: "#C4B5FD",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight, color: textColor }}>
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {showFooter ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "#F3F4F6",
          }}
        >
          <TouchableOpacity
            onPress={onClear}
            disabled={!onClear}
            style={{ paddingVertical: 6, paddingHorizontal: 8, opacity: onClear ? 1 : 0.4 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>Limpar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!isDateDisabled(today, minDate, maxDate)) {
                onChange(today);
                setViewDate(today);
              }
            }}
            disabled={isDateDisabled(today, minDate, maxDate)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 8,
              opacity: isDateDisabled(today, minDate, maxDate) ? 0.4 : 1,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>Hoje</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
