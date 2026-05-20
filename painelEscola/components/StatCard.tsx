import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Variant = "purple" | "amber" | "sky" | "teal";

const variants: Record<
  Variant,
  { bg: string; text: string; subText: string; badgeBg: string }
> = {
  purple: {
    bg: "bg-violet-500",
    text: "text-white",
    subText: "text-violet-200",
    badgeBg: "bg-violet-400",
  },
  amber: {
    bg: "bg-amber-400",
    text: "text-amber-900",
    subText: "text-amber-700",
    badgeBg: "bg-amber-300",
  },
  sky: {
    bg: "bg-sky-400",
    text: "text-white",
    subText: "text-sky-100",
    badgeBg: "bg-sky-300",
  },
  teal: {
    bg: "bg-teal-400",
    text: "text-white",
    subText: "text-teal-100",
    badgeBg: "bg-teal-300",
  },
};

type StatCardProps = {
  title: string;
  value: string;
  percentage?: number | null;
  variant?: Variant;
};

export default function StatCard({
  title,
  value,
  percentage = null,
  variant = "purple",
}: StatCardProps) {
  const style = variants[variant];
  const showTrend = percentage !== null && percentage !== undefined;
  const isPositive = (percentage ?? 0) >= 0;
  const isWhiteText = variant === "purple" || variant === "sky" || variant === "teal";

  return (
    <View
      className={`flex-1 rounded-2xl p-5 justify-between mx-1.5`}
      style={{ minHeight: 120, backgroundColor: getHexColor(variant) }}
    >
      {/* Top row */}
      <View className="flex-row items-center justify-between mb-3">
        {showTrend ? (
          <View
            className="flex-row items-center px-2.5 py-1 rounded-full"
            style={{ backgroundColor: getBadgeBg(variant) }}
          >
            <Ionicons
              name={isPositive ? "arrow-up" : "arrow-down"}
              size={10}
              color={isWhiteText ? "white" : isPositive ? "#92400E" : "#B91C1C"}
            />
            <Text
              className="text-xs font-bold ml-0.5"
              style={{ color: isWhiteText ? "white" : isPositive ? "#92400E" : "#B91C1C" }}
            >
              {Math.abs(percentage ?? 0)}%
            </Text>
          </View>
        ) : (
          <View />
        )}
        <TouchableOpacity activeOpacity={0.7}>
          <Ionicons
            name="ellipsis-horizontal"
            size={18}
            color={isWhiteText ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.3)"}
          />
        </TouchableOpacity>
      </View>

      {/* Value */}
      <Text
        className="text-3xl font-bold"
        style={{ color: isWhiteText ? "white" : "#1C1917" }}
      >
        {value}
      </Text>
      <Text
        className="text-sm mt-1"
        style={{ color: isWhiteText ? "rgba(255,255,255,0.75)" : "#78716C" }}
      >
        {title}
      </Text>
    </View>
  );
}

function getHexColor(variant: Variant): string {
  const map: Record<Variant, string> = {
    purple: "#8B5CF6",
    amber: "#FBBF24",
    sky: "#38BDF8",
    teal: "#2DD4BF",
  };
  return map[variant];
}

function getBadgeBg(variant: Variant): string {
  const map: Record<Variant, string> = {
    purple: "rgba(109,40,217,0.5)",
    amber: "rgba(245,158,11,0.35)",
    sky: "rgba(14,165,233,0.4)",
    teal: "rgba(13,148,136,0.4)",
  };
  return map[variant];
}
