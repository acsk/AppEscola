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

const widths = { sm: 400, md: 560, lg: 760 };

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

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.45)", padding: isMobile ? 12 : 24 }}
      >
        <View
          className="bg-white rounded-2xl"
          style={{ width: "100%", maxWidth: widths[size], maxHeight: "88%" }}
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
