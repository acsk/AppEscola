import React from "react";
import { View, Text } from "react-native";

type DonutChartProps = {
  boysCount: number;
  girlsCount: number;
  boysPercent: number;
  girlsPercent: number;
};

export default function DonutChart({
  boysCount,
  girlsCount,
  boysPercent,
  girlsPercent,
}: DonutChartProps) {
  const total = boysCount + girlsCount;

  return (
    <View className="items-center">
      {/* Ring visual */}
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 14,
          borderColor: "#8B5CF6",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Inner partial ring overlay for girls (amber) */}
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
            borderTopColor: "#FBBF24",
            borderRightColor: "#FBBF24",
            transform: [{ rotate: `${(girlsPercent / 100) * 180}deg` }],
          }}
        />
        <Text className="text-lg font-bold text-gray-800">
          {total.toLocaleString("pt-BR")}
        </Text>
        <Text className="text-xs text-gray-500">Total</Text>
      </View>

      {/* Legend */}
      <View className="flex-row mt-4 gap-6">
        <View className="items-center">
          <View className="flex-row items-center mb-1">
            <View className="w-2.5 h-2.5 rounded-full bg-violet-500 mr-1.5" />
            <Text className="text-xs text-gray-500">Homens</Text>
          </View>
          <Text className="text-base font-bold text-gray-800">
            {boysCount.toLocaleString("pt-BR")}
          </Text>
          <Text className="text-xs text-gray-500">{boysPercent}%</Text>
        </View>
        <View className="items-center">
          <View className="flex-row items-center mb-1">
            <View className="w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5" />
            <Text className="text-xs text-gray-500">Mulheres</Text>
          </View>
          <Text className="text-base font-bold text-gray-800">
            {girlsCount.toLocaleString("pt-BR")}
          </Text>
          <Text className="text-xs text-gray-500">{girlsPercent}%</Text>
        </View>
      </View>
    </View>
  );
}
