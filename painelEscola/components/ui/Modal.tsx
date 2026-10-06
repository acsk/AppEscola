import React, { useEffect, useRef } from "react";
import {
  Modal as RNModal,
  Platform,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  ViewStyle,
} from "react-native";
import { createPortal } from "react-dom";
import { X } from "lucide-react-native";
import Icon from "./Icon";
import { color, shadow } from "../../constants/theme";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  maxHeight?: ViewStyle["maxHeight"];
  footerStyle?: ViewStyle;
  showScrollIndicator?: boolean;
  scrollViewClassName?: string;
  /** Menos padding no cabeçalho, corpo e rodapé */
  compact?: boolean;
};

function resolveShellMaxHeight(
  maxHeight: ViewStyle["maxHeight"],
  screenHeight: number
): number {
  if (typeof maxHeight === "number") return maxHeight;
  if (typeof maxHeight === "string" && maxHeight.endsWith("%")) {
    const pct = Number.parseFloat(maxHeight) / 100;
    if (Number.isFinite(pct)) return screenHeight * pct;
  }
  return screenHeight * 0.94;
}

const widths = { sm: 504, md: 684, lg: 882, xl: 1062 };

export default function Modal({
  visible,
  title,
  onClose,
  children,
  headerContent,
  footer,
  size = "md",
  maxHeight = "94%",
  footerStyle,
  showScrollIndicator = false,
  scrollViewClassName = "",
  compact = false,
}: Props) {
  const isWeb = Platform.OS === "web";
  const { width, height } = useWindowDimensions();
  const isMobile = width < 640;
  const viewportPaddingX = isMobile ? 12 : width < 1024 ? 24 : 40;
  const viewportPaddingY = isMobile ? 12 : width < 1024 ? 20 : 28;
  const shellMaxHeight = resolveShellMaxHeight(maxHeight, height) * 0.9;
  const panelMaxHeight = Math.max(240, Math.min(shellMaxHeight, height - viewportPaddingY * 2));
  const headerBlockHeight = compact ? 44 : 52;
  const footerBlockHeight = footer ? (isMobile ? (compact ? 96 : 110) : compact ? 52 : 60) : 0;
  const bodyMaxHeight = Math.max(160, panelMaxHeight - headerBlockHeight - footerBlockHeight);
  const horizontalInset = compact ? (isMobile ? 14 : 18) : isMobile ? 16 : 24;
  const bodyPaddingY = compact ? 10 : 16;

  const closeRef = useRef<View>(null);
  // onClose costuma ser uma função inline (nova a cada render): via ref, o efeito abaixo
  // não roda de novo ao digitar — senão o foco voltava para o "X" a cada tecla.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Web: Esc fecha; o foco vai para o botão de fechar só ao abrir.
  useEffect(() => {
    if (!isWeb || !visible || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = setTimeout(() => (closeRef.current as unknown as HTMLElement | null)?.focus?.(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isWeb, visible]);

  // Evita scroll do body/layout enquanto o modal cobre a tela no web.
  useEffect(() => {
    if (!isWeb || !visible || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isWeb, visible]);

  if (!visible) return null;

  const content = (
    <View
      className="items-center justify-center"
      style={{
        flex: 1,
        backgroundColor: "rgba(17,23,34,0.45)",
        paddingHorizontal: viewportPaddingX,
        paddingVertical: viewportPaddingY,
      }}
    >
      <View
        className="bg-surface rounded-ds-lg overflow-hidden"
        role="dialog"
        aria-modal
        aria-label={title}
        style={{
          ...(isWeb ? ({ boxShadow: shadow.overlay } as object) : {}),
          width: "100%",
          maxWidth: Math.min(width - viewportPaddingX * 2, widths[size]),
          maxHeight: panelMaxHeight,
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <View
          className="border-b border-border"
          style={{
            flexShrink: 0,
            paddingHorizontal: horizontalInset,
            paddingTop: compact ? 14 : 16,
            paddingBottom: compact ? 14 : 16,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text
              className="font-semibold text-ink flex-1"
              style={compact ? { fontSize: 16, lineHeight: 24 } : { fontSize: 20, lineHeight: 28 }}
            >
              {title}
            </Text>
            <TouchableOpacity
              ref={closeRef}
              onPress={onClose}
              aria-label="Fechar"
              className="items-center justify-center rounded-ds-md"
              style={{ width: 32, height: 32 }}
              activeOpacity={0.7}
            >
              <Icon icon={X} color={color["ink-muted"]} />
            </TouchableOpacity>
          </View>
          {headerContent}
        </View>

        {/* Body */}
        <ScrollView
          className={`app-scrollbar ${scrollViewClassName}`.trim()}
          style={{
            maxHeight: bodyMaxHeight,
            flexGrow: 0,
            flexShrink: 1,
            paddingHorizontal: horizontalInset,
          }}
          contentContainerStyle={{
            paddingTop: bodyPaddingY,
            paddingBottom: bodyPaddingY,
          }}
          showsVerticalScrollIndicator={showScrollIndicator}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {children}
        </ScrollView>

        {/* Footer */}
        {footer && (
          <View
            className="border-t border-border bg-surface-sunken"
            style={{
              flexShrink: 0,
              width: "100%",
              flexDirection: isMobile ? "column" : "row",
              alignItems: "stretch",
              justifyContent: "flex-end",
              gap: compact ? 8 : 10,
              paddingHorizontal: horizontalInset,
              paddingVertical: compact ? 10 : 12,
              ...footerStyle,
            }}
          >
            {footer}
          </View>
        )}
      </View>
    </View>
  );

  if (isWeb) {
    // Portal no body: position:fixed dentro de overflow/transform do layout
    // (sidebar + ScrollView) fica preso e cortado no container.
    if (typeof document === "undefined") return null;

    return createPortal(
      <View
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 10000,
          width: "100vw",
          height: "100vh",
        }}
      >
        {content}
      </View>,
      document.body
    );
  }

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {content}
    </RNModal>
  );
}
