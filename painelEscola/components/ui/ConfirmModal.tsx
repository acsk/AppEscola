import React from "react";
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ConfirmModalProps } from "../../types/components";

export default function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmDisabled,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  iconName = "trash-outline",
  tone = "danger",
  children,
}: ConfirmModalProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;
  const horizontalPadding = isMobile ? 16 : width < 1024 ? 24 : 40;
  const isDanger = tone === "danger";
  const iconBg = isDanger ? "bg-red-100" : "bg-violet-100";
  const iconColor = isDanger ? "#EF4444" : "#7C3AED";
  const confirmBg = isDanger ? "bg-red-500" : "bg-violet-600";

  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
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
          className="bg-white rounded-2xl p-6"
          style={{
            width: "100%",
            maxWidth: Math.min(width - horizontalPadding * 2, children ? 560 : 520),
          }}
        >
          <View className="items-center mb-5">
            <View className={`w-14 h-14 ${iconBg} rounded-full items-center justify-center mb-3`}>
              <Ionicons name={iconName} size={26} color={iconColor} />
            </View>
            <Text className="text-lg font-bold text-gray-800 text-center">
              {title}
            </Text>
            <Text className="text-sm text-gray-500 text-center mt-1.5">
              {message}
            </Text>
          </View>

          {children ? <View className="w-full mb-5">{children}</View> : null}

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-700">
                {cancelLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading || confirmDisabled}
              className={`flex-1 py-3 rounded-xl ${confirmBg} items-center ${loading || confirmDisabled ? "opacity-50" : ""}`}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </RNModal>
  );
}
