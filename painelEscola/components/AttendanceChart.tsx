import React from "react";
import { View, Text } from "react-native";

type BarData = {
  day: string;
  present: number; // 0-100
  absent: number;  // 0-100
};

type AttendanceChartProps = {
  data: BarData[];
  highlightDay?: string;
};

export default function AttendanceChart({
  data,
  highlightDay,
}: AttendanceChartProps) {
  const maxHeight = 80;

  return (
    <View>
      {/* Y-axis labels */}
      <View className="flex-row mb-1">
        <View className="w-8" />
        <View className="flex-1 flex-row justify-between px-2">
          {["100", "75", "50", "25", "0"].slice(0, 1).map((v) => (
            <Text key={v} className="text-xs text-gray-400">{v}</Text>
          ))}
        </View>
      </View>

      {/* Bars */}
      <View className="flex-row items-end justify-around" style={{ height: maxHeight + 20 }}>
        {data.map((item) => {
          const isHighlighted = item.day === highlightDay;
          const presentH = (item.present / 100) * maxHeight;
          const absentH = (item.absent / 100) * maxHeight;

          return (
            <View key={item.day} className="items-center">
              {/* Highlight badge */}
              {isHighlighted && (
                <View className="bg-gray-800 rounded-md px-2 py-0.5 mb-1">
                  <Text className="text-white text-xs font-bold">
                    {item.present}%
                  </Text>
                  <Text className="text-gray-300 text-xs">Presente</Text>
                </View>
              )}

              {/* Bars side by side */}
              <View className="flex-row items-end gap-1" style={{ height: maxHeight }}>
                <View
                  style={{
                    width: 12,
                    height: presentH,
                    backgroundColor: "#FBBF24",
                    borderRadius: 4,
                  }}
                />
                <View
                  style={{
                    width: 12,
                    height: absentH,
                    backgroundColor: "#A5B4FC",
                    borderRadius: 4,
                  }}
                />
              </View>

              {/* Day label */}
              <Text className="text-xs text-gray-500 mt-1">{item.day}</Text>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View className="flex-row mt-3 gap-4">
        <View className="flex-row items-center">
          <View className="w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5" />
          <Text className="text-xs text-gray-500">Presente</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-2.5 h-2.5 rounded-full bg-indigo-300 mr-1.5" />
          <Text className="text-xs text-gray-500">Ausente</Text>
        </View>
      </View>
    </View>
  );
}
