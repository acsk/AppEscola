import React, { useEffect } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { color, shadow } from "../../constants/theme";
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
        className="flex-row items-center bg-surface border border-border px-4 py-3"
        style={{
          maxWidth: 640,
          width: "100%",
          gap: 12,
          borderRadius: 6,
          ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay } as object) : { elevation: 8 }),
        }}
      >
        <Ionicons
          name={isWarning ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={18}
          color={isWarning ? color.warning : color.success}
        />
        <Text className="flex-1 text-sm text-ink">{message}</Text>
        {onUndo && (
          <TouchableOpacity onPress={onUndo} disabled={undoing} className="px-2 py-1" aria-label="Desfazer alteração em massa">
            <Text className="text-sm font-semibold text-brand">{undoing ? "Desfazendo..." : "Desfazer"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose} aria-label="Fechar aviso">
          <Ionicons name="close" size={16} color={color["ink-muted"]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
