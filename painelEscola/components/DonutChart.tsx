import React from "react";
import { View, Text } from "react-native";

export type DonutSegment = {
  label: string;
  count: number;
  percent: number;
  color: string;
};

type DonutChartProps = {
  total: number;
  segments: DonutSegment[];
};

export default function DonutChart({ total, segments }: DonutChartProps) {
  const primary = segments[0];
  const secondary = segments[1];
  const secondaryPercent = secondary?.percent ?? 0;

  return (
    <View className="items-center">
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 14,
          borderColor: primary?.color ?? "#8B5CF6",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {secondary && (
          <View
            style={{
              position: "absolute",
              top: -14,
              left: -14,
              width: 120,
              height: 120,
              borderRadius: 60,
              borderWidth: 14,
              borderColor: "transparent",
              borderTopColor: secondary.color,
              borderRightColor: secondary.color,
              transform: [{ rotate: `${(secondaryPercent / 100) * 180}deg` }],
            }}
          />
        )}
        <Text className="text-lg font-bold text-gray-800">
          {total.toLocaleString("pt-BR")}
        </Text>
        <Text className="text-xs text-gray-500">Total</Text>
      </View>

      <View className="flex-row mt-4 gap-6">
        {segments.map((seg) => (
          <View key={seg.label} className="items-center">
            <View className="flex-row items-center mb-1">
              <View
                className="w-2.5 h-2.5 rounded-full mr-1.5"
                style={{ backgroundColor: seg.color }}
              />
              <Text className="text-xs text-gray-500">{seg.label}</Text>
            </View>
            <Text className="text-base font-bold text-gray-800">
              {seg.count.toLocaleString("pt-BR")}
            </Text>
            <Text className="text-xs text-gray-500">{seg.percent}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
