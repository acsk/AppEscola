import React, { useMemo, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChange: (nextISODate: string) => void;
  disabled?: boolean;
};

const toDateAtMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

const toISODate = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateLabel = (isoDate: string) => {
  const date = toDateAtMidnight(isoDate);
  return date.toLocaleDateString("pt-BR");
};

const formatWeekdayLabel = (isoDate: string) => {
  const date = toDateAtMidnight(isoDate);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
};

const addDays = (isoDate: string, amount: number) => {
  const date = toDateAtMidnight(isoDate);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
};

const todayISO = () => {
  const now = new Date();
  return toISODate(now);
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount, 1);
  return next;
};

const monthTitle = (date: Date) =>
  date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const getCalendarDays = (visibleMonth: Date) => {
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export default function AttendanceDateBar({
  value,
  onChange,
  disabled = false,
}: Props) {
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => toDateAtMidnight(value));
  const maxDate = todayISO();
  const isNextDisabled = disabled || value >= maxDate;

  const displayDate = useMemo(() => formatDateLabel(value), [value]);
  const weekdayLabel = useMemo(() => formatWeekdayLabel(value), [value]);
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const today = useMemo(() => toDateAtMidnight(maxDate), [maxDate]);
  const canGoNextMonth = addMonths(visibleMonth, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);

  const openCalendar = () => {
    if (disabled) return;
    setVisibleMonth(toDateAtMidnight(value));
    setCalendarVisible(true);
  };

  const selectDate = (date: Date) => {
    const next = toISODate(date);
    if (next > maxDate) return;
    onChange(next);
    setCalendarVisible(false);
  };

  return (
    <View>
      <View className="rounded-2xl border border-gray-200 bg-white px-3 py-1.5">
        <View className="flex-row items-center gap-1">
          <TouchableOpacity
            onPress={() => onChange(addDays(value, -1))}
            disabled={disabled}
            activeOpacity={0.8}
            className="h-11 w-11 rounded-xl items-center justify-center"
            accessibilityLabel="Dia anterior"
          >
            <Ionicons name="chevron-back" size={20} color={disabled ? "#D1D5DB" : "#6B7280"} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openCalendar}
            disabled={disabled}
            activeOpacity={0.8}
            className="flex-1 min-w-[180px] h-12 px-3 rounded-xl items-center justify-center"
            accessibilityLabel="Selecionar data da frequência"
          >
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="calendar-outline" size={18} color={disabled ? "#D1D5DB" : "#7C3AED"} />
              <Text className={`text-xl font-bold ${disabled ? "text-gray-400" : "text-gray-800"}`}>
                {displayDate}
              </Text>
            </View>
            <Text
              className={`text-xs mt-0.5 capitalize ${disabled ? "text-gray-300" : "text-gray-500"}`}
              numberOfLines={1}
            >
              {weekdayLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              const next = addDays(value, 1);
              if (next > maxDate) return;
              onChange(next);
            }}
            disabled={isNextDisabled}
            activeOpacity={0.8}
            className="h-11 w-11 rounded-xl items-center justify-center"
            accessibilityLabel="Próximo dia"
          >
            <Ionicons name="chevron-forward" size={20} color={isNextDisabled ? "#D1D5DB" : "#6B7280"} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View
          className="flex-1 items-center justify-center px-4"
          style={{ backgroundColor: "rgba(15,23,42,0.36)" }}
        >
          <View
            className="rounded-2xl bg-white p-5"
            style={{
              width: "100%",
              maxWidth: 480,
              shadowColor: "#000",
              shadowOpacity: 0.16,
              shadowRadius: 18,
              elevation: 8,
            }}
          >
            <View className="flex-row items-center justify-between mb-5">
              <TouchableOpacity
                onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                className="h-11 w-11 rounded-xl items-center justify-center bg-gray-50"
                activeOpacity={0.75}
                accessibilityLabel="Mês anterior"
              >
                <Ionicons name="chevron-back" size={21} color="#374151" />
              </TouchableOpacity>

              <View className="items-center">
                <Text className="text-lg font-bold text-gray-900 capitalize">{monthTitle(visibleMonth)}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">Escolha a data da frequência</Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (canGoNextMonth) setVisibleMonth(addMonths(visibleMonth, 1));
                }}
                disabled={!canGoNextMonth}
                className="h-11 w-11 rounded-xl items-center justify-center bg-gray-50"
                activeOpacity={0.75}
                accessibilityLabel="Próximo mês"
              >
                <Ionicons name="chevron-forward" size={21} color={canGoNextMonth ? "#374151" : "#D1D5DB"} />
              </TouchableOpacity>
            </View>

            <View className="flex-row mb-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <Text key={day} className="flex-1 text-center text-xs font-semibold text-gray-500">
                  {day}
                </Text>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {calendarDays.map((date) => {
                const iso = toISODate(date);
                const isSelected = iso === value;
                const isToday = iso === maxDate;
                const isFuture = iso > maxDate;
                const isMuted = !sameMonth(date, visibleMonth);

                return (
                  <TouchableOpacity
                    key={iso}
                    onPress={() => selectDate(date)}
                    disabled={isFuture}
                    activeOpacity={0.75}
                    className="items-center justify-center"
                    style={{ width: `${100 / 7}%`, height: 52 }}
                    accessibilityLabel={`Selecionar ${formatDateLabel(iso)}`}
                  >
                    <View
                      className={`h-11 w-11 rounded-xl items-center justify-center ${
                        isSelected
                          ? "bg-violet-600"
                          : isToday
                            ? "border border-violet-300 bg-violet-50"
                            : "bg-transparent"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          isSelected
                            ? "text-white"
                            : isFuture
                              ? "text-gray-300"
                              : isMuted
                                ? "text-gray-400"
                                : "text-gray-800"
                        }`}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="flex-row items-center justify-between mt-5 pt-4 border-t border-gray-100">
              <TouchableOpacity
                onPress={() => setCalendarVisible(false)}
                className="h-11 px-4 rounded-xl items-center justify-center bg-gray-100"
                activeOpacity={0.75}
              >
                <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => selectDate(today)}
                className="h-11 px-4 rounded-xl items-center justify-center bg-violet-600"
                activeOpacity={0.8}
              >
                <Text className="text-sm font-semibold text-white">Hoje</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
