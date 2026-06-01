import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
      style={{
        position: "absolute",
        top: 18,
        left: 16,
        right: 16,
        alignSelf: "center",
        width: "100%",
        maxWidth: 560,
        minHeight: 72,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: type === "success" ? "#A7F3D0" : "#FECACA",
        backgroundColor: type === "success" ? "#ECFDF5" : "#FEF2F2",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 14,
        elevation: 8,
        zIndex: 999,
        opacity,
        transform: [{ translateY }, { scale }],
      }}
    >
      <Ionicons
        name={type === "success" ? "checkmark-circle" : "alert-circle"}
        size={22}
        color={type === "success" ? "#047857" : "#B91C1C"}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: "600",
          color: type === "success" ? "#065F46" : "#991B1B",
        }}
      >
        {message}
      </Text>
      <TouchableOpacity onPress={onClose}>
        <Ionicons
          name="close"
          size={20}
          color={type === "success" ? "#047857" : "#B91C1C"}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}