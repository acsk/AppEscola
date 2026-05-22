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
  compact?: boolean;
  flex?: number;
};

export default function EnrollmentProductCell({ item, compact = false, flex = 2 }: Props) {
  const kind = enrollmentProductKind(item);
  const badge = enrollmentProductBadgeLabel(item);
  const title = enrollmentProductTitle(item);
  const subtitle = enrollmentProductSubtitle(item);

  return (
    <View style={{ flex, paddingRight: 10 }}>
      {badge ? (
        <View className="flex-row items-center mb-0.5">
          <View
            className={`${compact ? "px-1 py-0" : "px-1.5 py-0.5"} rounded ${
              kind === "bundle" ? "bg-violet-100" : "bg-sky-100"
            }`}
          >
            <Text
              className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold uppercase tracking-wide ${
                kind === "bundle" ? "text-violet-700" : "text-sky-700"
              }`}
            >
              {badge}
            </Text>
          </View>
        </View>
      ) : null}
      <Text
        className={`${compact ? "text-xs" : "text-sm"} font-semibold text-gray-800`}
        numberOfLines={1}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          className={`${compact ? "text-[11px]" : "text-xs"} text-gray-500 mt-0.5`}
          numberOfLines={compact ? 1 : 2}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
