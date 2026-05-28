import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type BreadcrumbItem = {
  label: string;
  onPress?: () => void;
};

type Props = {
  items: BreadcrumbItem[];
};

/**
 * Navegação hierárquica em subtelas (formulários, detalhes, passos).
 * Primeiro item: link com chevron-back violeta; último: texto cinza (página atual).
 */
export default function ScreenBreadcrumb({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <View className="flex-row items-center flex-wrap gap-2 mb-6">
      {items.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
            ) : null}
            {isLast ? (
              <Text className="text-sm text-gray-500">{item.label}</Text>
            ) : item.onPress ? (
              <TouchableOpacity
                onPress={item.onPress}
                className="flex-row items-center gap-1.5"
                activeOpacity={0.7}
              >
                {isFirst ? <Ionicons name="chevron-back" size={18} color="#7C3AED" /> : null}
                <Text className="text-sm font-medium text-violet-600">{item.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-sm font-medium text-violet-600">{item.label}</Text>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
