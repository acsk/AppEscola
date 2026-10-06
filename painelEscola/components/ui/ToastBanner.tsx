import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CircleAlert, CircleCheck, X } from "lucide-react-native";
import Icon from "./Icon";
import { color, shadow } from "../../constants/theme";

type ToastType = "success" | "error";

type Props = {
  visible: boolean;
  type: ToastType;
  message: string;
  onClose: () => void;
};

export default function ToastBanner({
  visible,
  type,
  message,
  onClose,
}: Props) {
  const isWeb = Platform.OS === "web";
  const [mounted, setMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-18)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onClose, 4200);
    return () => clearTimeout(timer);
  }, [onClose, visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      translateY.setValue(-18);
      scale.setValue(0.96);

      if (isWeb) {
        opacity.setValue(1);
        translateY.setValue(0);
        scale.setValue(1);
        return;
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();

      return;
    }

    if (!mounted) return;

    if (isWeb) {
      setMounted(false);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => setMounted(false));
  }, [isWeb, mounted, opacity, scale, translateY, visible]);

  if (!mounted) return null;

  return (
    <Animated.View
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        alignSelf: "center",
        width: "100%",
        maxWidth: 560,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        ...(isWeb ? ({ boxShadow: shadow.overlay } as object) : { elevation: 8 }),
        zIndex: 999,
        opacity,
        transform: [{ translateY }, { scale }],
      }}
    >
      <Icon icon={type === "success" ? CircleCheck : CircleAlert} size={20} color={type === "success" ? color.success : color.danger} />
      <Text className="text-sm font-medium text-ink" style={{ flex: 1, lineHeight: 20 }}>
        {message}
      </Text>
      <TouchableOpacity onPress={onClose} aria-label="Fechar aviso" activeOpacity={0.7}>
        <Icon icon={X} color={color["ink-muted"]} />
      </TouchableOpacity>
    </Animated.View>
  );
}