import React from "react";
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const widths = { sm: 560, md: 760, lg: 980 };

export default function Modal({
  visible,
  title,
  onClose,
  children,
  footer,
  size = "md",
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
          className="bg-white rounded-2xl"
          style={{
            width: "100%",
            maxWidth: Math.min(width - horizontalPadding * 2, widths[size]),
            maxHeight: "88%",
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
            <Text className="text-base font-bold text-gray-800">{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-1 rounded-lg bg-gray-100"
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            className="px-6 py-5"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {/* Footer */}
          {footer && (
            <View
              className="justify-end px-6 py-4 border-t border-gray-100"
              style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </RNModal>
  );
}
