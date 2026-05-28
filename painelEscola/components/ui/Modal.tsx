import React from "react";
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  maxHeight?: ViewStyle["maxHeight"];
  footerStyle?: ViewStyle;
  showScrollIndicator?: boolean;
  scrollViewClassName?: string;
  /** Menos padding no cabeçalho, corpo e rodapé */
  compact?: boolean;
};

function resolveShellMaxHeight(
  maxHeight: ViewStyle["maxHeight"],
  screenHeight: number
): number {
  if (typeof maxHeight === "number") return maxHeight;
  if (typeof maxHeight === "string" && maxHeight.endsWith("%")) {
    const pct = Number.parseFloat(maxHeight) / 100;
    if (Number.isFinite(pct)) return screenHeight * pct;
  }
  return screenHeight * 0.94;
}

const widths = { sm: 560, md: 760, lg: 980, xl: 1180 };

export default function Modal({
  visible,
  title,
  onClose,
  children,
  headerContent,
  footer,
  size = "md",
  maxHeight = "94%",
  footerStyle,
  showScrollIndicator = false,
  scrollViewClassName = "",
  compact = false,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 640;
  const horizontalPadding = isMobile ? 12 : width < 1024 ? 24 : 40;
  const shellMaxHeight = resolveShellMaxHeight(maxHeight, height);
  const headerBlockHeight = compact ? 44 : 52;
  const footerBlockHeight = footer ? (isMobile ? (compact ? 96 : 110) : compact ? 52 : 60) : 0;
  const bodyMaxHeight = Math.max(180, shellMaxHeight - headerBlockHeight - footerBlockHeight);
  const horizontalInset = compact ? (isMobile ? 14 : 18) : isMobile ? 16 : 24;
  const bodyPaddingY = compact ? 10 : 16;

  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="items-center justify-center"
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          padding: horizontalPadding,
        }}
      >
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            width: "100%",
            maxWidth: Math.min(width - horizontalPadding * 2, widths[size]),
            maxHeight: shellMaxHeight,
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <View
            className="border-b border-gray-100"
            style={{
              flexShrink: 0,
              paddingHorizontal: horizontalInset,
              paddingVertical: compact ? 10 : 12,
            }}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`font-bold text-gray-800 ${compact ? "text-sm" : "text-base"}`}
              >
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                className="p-1 rounded-lg bg-gray-100"
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {headerContent}
          </View>

          {/* Body */}
          <ScrollView
            className={scrollViewClassName}
            style={{
              maxHeight: bodyMaxHeight,
              flexGrow: 0,
              flexShrink: 1,
              paddingHorizontal: horizontalInset,
            }}
            contentContainerStyle={{
              paddingTop: bodyPaddingY,
              paddingBottom: bodyPaddingY,
            }}
            showsVerticalScrollIndicator={showScrollIndicator}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {children}
          </ScrollView>

          {/* Footer */}
          {footer && (
            <View
              className="border-t border-gray-100 bg-white"
              style={{
                flexShrink: 0,
                width: "100%",
                flexDirection: isMobile ? "column" : "row",
                alignItems: "stretch",
                gap: compact ? 8 : 10,
                paddingHorizontal: horizontalInset,
                paddingVertical: compact ? 10 : 12,
                ...footerStyle,
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </RNModal>
  );
}
