import React from "react";
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type MessageType = "error" | "success" | "warning" | "info";

type Props = {
  visible: boolean;
  type?: MessageType;
  title?: string;
  message: string;
  onClose: () => void;
};

const config: Record<MessageType, { icon: any; iconColor: string; bg: string; titleColor: string; msgColor: string; btnBg: string; btnText: string }> = {
  error: {
    icon: "alert-circle-outline",
    iconColor: "#EF4444",
    bg: "#FEF2F2",
    titleColor: "#991B1B",
    msgColor: "#7F1D1D",
    btnBg: "#EF4444",
    btnText: "Entendi",
  },
  success: {
    icon: "checkmark-circle-outline",
    iconColor: "#10B981",
    bg: "#ECFDF5",
    titleColor: "#065F46",
    msgColor: "#064E3B",
    btnBg: "#10B981",
    btnText: "OK",
  },
  warning: {
    icon: "warning-outline",
    iconColor: "#F59E0B",
    bg: "#FFFBEB",
    titleColor: "#92400E",
    msgColor: "#78350F",
    btnBg: "#F59E0B",
    btnText: "Entendi",
  },
  info: {
    icon: "information-circle-outline",
    iconColor: "#3B82F6",
    bg: "#EFF6FF",
    titleColor: "#1E40AF",
    msgColor: "#1E3A8A",
    btnBg: "#3B82F6",
    btnText: "OK",
  },
};

export default function MessageModal({
  visible,
  type = "error",
  title,
  message,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;
  const horizontalPadding = isMobile ? 16 : 40;
  const c = config[type];

  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          padding: horizontalPadding,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: Math.min(width - horizontalPadding * 2, 500),
            backgroundColor: "white",
            borderRadius: 24,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(17,24,39,0.08)",
            shadowColor: "#111827",
            shadowOpacity: 0.18,
            shadowRadius: 26,
            shadowOffset: { width: 0, height: 14 },
            elevation: 10,
          }}
        >
          <View
            style={{
              height: 104,
              backgroundColor: c.bg,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: c.iconColor + "18",
            }}
          >
            <View
              style={{
                width: 70,
                height: 70,
                borderRadius: 22,
                backgroundColor: "white",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: c.iconColor + "25",
                shadowColor: c.iconColor,
                shadowOpacity: 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 3,
              }}
            >
              <Ionicons name={c.icon} size={40} color={c.iconColor} />
            </View>
          </View>

          <View style={{ padding: isMobile ? 22 : 28 }}>
            {!!title && (
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: c.titleColor,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                {title}
              </Text>
            )}

            <Text
              style={{
                fontSize: 15,
                color: c.msgColor,
                textAlign: "center",
                lineHeight: 23,
                marginBottom: 24,
              }}
            >
              {message}
            </Text>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              style={{
                backgroundColor: c.btnBg,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                outlineStyle: "none" as any,
              }}
            >
              <Text style={{ color: "white", fontSize: 14, fontWeight: "800" }}>
                {c.btnText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </RNModal>
  );
}
