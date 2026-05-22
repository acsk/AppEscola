import React from "react";
import { View, Text } from "react-native";
import type { EnrollmentSummary } from "../../types/matriculas";
import {
  enrollmentProductBadgeLabel,
  enrollmentProductSubtitle,
  enrollmentProductTitle,
  enrollmentProductKind,
} from "../../utils/enrollmentDisplay";

type Props = {
  item: EnrollmentSummary;
};

export default function EnrollmentProductCell({ item }: Props) {
  const kind = enrollmentProductKind(item);
  const badge = enrollmentProductBadgeLabel(item);
  const title = enrollmentProductTitle(item);
  const subtitle = enrollmentProductSubtitle(item);

  return (
    <View style={{ flex: 2 }}>
      {badge ? (
        <View className="flex-row items-center mb-0.5">
          <View
            className={`px-1.5 py-0.5 rounded ${
              kind === "bundle" ? "bg-violet-100" : "bg-sky-100"
            }`}
          >
            <Text
              className={`text-[10px] font-bold uppercase tracking-wide ${
                kind === "bundle" ? "text-violet-700" : "text-sky-700"
              }`}
            >
              {badge}
            </Text>
          </View>
        </View>
      ) : null}
      <Text className="text-sm font-medium text-gray-800" numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
