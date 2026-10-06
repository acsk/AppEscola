import React, { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  message: string;
  tone?: "success" | "warning";
  onUndo?: () => void;
  undoing?: boolean;
  onClose: () => void;
  /** Tempo até fechar sozinho (ms). */
  duration?: number;
};

/** Toast com ação "Desfazer" (o ToastBanner padrão não tem ação). */
export default function UndoToast({ visible, message, tone = "success", onUndo, undoing, onClose, duration = 10000 }: Props) {
  useEffect(() => {
    if (!visible || undoing) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [visible, undoing, onClose, duration]);

  if (!visible) return null;

  const isWarning = tone === "warning";

  return (
    <View
      aria-live="polite"
      role="status"
      style={{ position: "absolute", bottom: 24, left: 16, right: 16, alignItems: "center", zIndex: 60 }}
      pointerEvents="box-none"
    >
      <View
        className={`flex-row items-center rounded-2xl px-4 py-3 border ${isWarning ? "bg-amber-50 border-amber-200" : "bg-gray-900 border-gray-900"}`}
        style={{ maxWidth: 640, width: "100%", gap: 12 }}
      >
        <Ionicons
          name={isWarning ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={18}
          color={isWarning ? "#B45309" : "#A7F3D0"}
        />
        <Text className={`flex-1 text-sm ${isWarning ? "text-amber-800" : "text-white"}`}>{message}</Text>
        {onUndo && (
          <TouchableOpacity onPress={onUndo} disabled={undoing} className="px-2 py-1" aria-label="Desfazer alteração em massa">
            <Text className={`text-sm font-bold ${isWarning ? "text-amber-700" : "text-violet-300"}`}>
              {undoing ? "Desfazendo..." : "Desfazer"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose} aria-label="Fechar aviso">
          <Ionicons name="close" size={16} color={isWarning ? "#B45309" : "#D1D5DB"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
