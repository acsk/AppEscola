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
};

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
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;
  const horizontalPadding = isMobile ? 12 : width < 1024 ? 24 : 40;

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
            maxHeight,
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <View className="px-6 py-3 border-b border-gray-100" style={{ flexShrink: 0 }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-gray-800">{title}</Text>
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
            className={`${isMobile ? "px-4" : "px-6"} ${scrollViewClassName}`}
            style={{ flexGrow: 1, flexShrink: 1 }}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={showScrollIndicator}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {/* Footer */}
          {footer && (
            <View
              className="px-6 py-3 border-t border-gray-100 bg-white"
              style={{
                flexShrink: 0,
                width: "100%",
                flexDirection: isMobile ? "column" : "row",
                alignItems: "stretch",
                gap: 10,
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
