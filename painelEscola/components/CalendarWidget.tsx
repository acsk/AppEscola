import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

type CalendarWidgetProps = {
  eventDays?: number[];
  initialYear?: number;
  initialMonth?: number;
};

export default function CalendarWidget({
  eventDays = [],
  initialYear,
  initialMonth,
}: CalendarWidgetProps) {
  const today = new Date();
  const [year, setYear] = useState(initialYear ?? today.getFullYear());
  const [month, setMonth] = useState(
    initialMonth !== undefined ? initialMonth - 1 : today.getMonth()
  );
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const eventDaySet = new Set(eventDays);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Highlight week row of selectedDay
  const selectedCellIndex = firstDay + selectedDay - 1;
  const selectedWeekStart = Math.floor(selectedCellIndex / 7) * 7;

  return (
    <View>
      {/* Month navigation */}
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity onPress={prevMonth} activeOpacity={0.7}>
          <Ionicons name="chevron-back-circle-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
        <Text className="text-sm font-semibold text-gray-800">
          {MONTHS[month]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} activeOpacity={0.7}>
          <Ionicons name="chevron-forward-circle-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View className="flex-row mb-1">
        {DAYS.map((d) => (
          <View key={d} style={{ flex: 1 }} className="items-center">
            <Text className="text-xs font-medium text-gray-400">{d}</Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      {Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) => (
        <View
          key={week}
          className="flex-row mb-0.5"
          style={{
            backgroundColor:
              week === Math.floor(selectedCellIndex / 7)
                ? "#F5F3FF"
                : "transparent",
            borderRadius: 8,
          }}
        >
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            const isToday =
              day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear();
            const isSelected = day === selectedDay;
            const hasEvent = day !== null && eventDaySet.has(day);
            return (
              <TouchableOpacity
                key={i}
                style={{ flex: 1 }}
                className="items-center py-1"
                activeOpacity={0.7}
                onPress={() => day && setSelectedDay(day)}
              >
                <View
                  className={`w-7 h-7 items-center justify-center rounded-full ${
                    isSelected
                      ? "bg-violet-600"
                      : isToday
                      ? "bg-violet-100"
                      : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      isSelected
                        ? "text-white"
                        : isToday
                        ? "text-violet-600"
                        : day
                        ? "text-gray-700"
                        : "text-transparent"
                    }`}
                  >
                    {day ?? ""}
                  </Text>
                  {hasEvent && !isSelected && (
                    <View
                      className="absolute bottom-0 w-1 h-1 rounded-full bg-amber-400"
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
