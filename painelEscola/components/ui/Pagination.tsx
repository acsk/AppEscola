import React from "react";
import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  currentPage: number;
  lastPage: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({
  currentPage,
  lastPage,
  total,
  perPage,
  onPageChange,
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;
  const start = (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);

  return (
    <View
      className="items-center justify-between py-3"
      style={{ flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0 }}
    >
      <Text className="text-sm text-gray-500">
        Exibindo{" "}
        <Text className="font-semibold text-gray-700">
          {start}–{end}
        </Text>{" "}
        de{" "}
        <Text className="font-semibold text-gray-700">{total}</Text>
      </Text>

      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`w-8 h-8 rounded-lg items-center justify-center ${
            currentPage <= 1 ? "bg-gray-100" : "bg-violet-100"
          }`}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={15}
            color={currentPage <= 1 ? "#9CA3AF" : "#7C3AED"}
          />
        </TouchableOpacity>

        <View className="px-3 h-8 bg-violet-600 rounded-lg items-center justify-center min-w-[32px]">
          <Text className="text-white text-sm font-bold">{currentPage}</Text>
        </View>

        <TouchableOpacity
          onPress={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= lastPage}
          className={`w-8 h-8 rounded-lg items-center justify-center ${
            currentPage >= lastPage ? "bg-gray-100" : "bg-violet-100"
          }`}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-forward"
            size={15}
            color={currentPage >= lastPage ? "#9CA3AF" : "#7C3AED"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
