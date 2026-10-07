import type { ReactNode } from "react";
import type { PressableStateCallbackType, StyleProp, ViewStyle } from "react-native";

/** No web o Pressable também informa `hovered` (react-native-web); os tipos do RN não o declaram. */
type WebPressState = PressableStateCallbackType & { hovered?: boolean };

export const hoverStyle = (fn: (state: WebPressState) => Record<string, unknown>) =>
  fn as unknown as (state: PressableStateCallbackType) => StyleProp<ViewStyle>;

export const hoverChildren = (fn: (state: WebPressState) => ReactNode) =>
  fn as unknown as (state: PressableStateCallbackType) => ReactNode;
