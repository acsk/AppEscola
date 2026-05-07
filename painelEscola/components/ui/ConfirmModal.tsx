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

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.45)", padding: isMobile ? 16 : 24 }}
      >
        <View
          className="bg-white rounded-2xl p-6"
          style={{ width: "100%", maxWidth: 380 }}
        >
          <View className="items-center mb-5">
            <View className="w-14 h-14 bg-red-100 rounded-full items-center justify-center mb-3">
              <Ionicons name="trash-outline" size={26} color="#EF4444" />
            </View>
            <Text className="text-lg font-bold text-gray-800 text-center">
              {title}
            </Text>
            <Text className="text-sm text-gray-500 text-center mt-1.5">
              {message}
            </Text>
          </View>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-700">
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-red-500 items-center"
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Excluir</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </RNModal>
  );
}
