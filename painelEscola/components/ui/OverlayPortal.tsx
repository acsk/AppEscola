import React, { useEffect, type ReactNode } from "react";
import { Modal, Platform, View, type ViewStyle } from "react-native";
import { createPortal } from "react-dom";

const WEB_OVERLAY_Z_INDEX = 20000;

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Padding externo do overlay (ex.: pickers de data/ano). */
  contentPadding?: number;
};

/**
 * Overlay acima de modais do formulário no web (portal no body + z-index alto).
 * No native usa RN Modal.
 */
export default function OverlayPortal({
  open,
  onClose,
  children,
  contentPadding = 0,
}: Props) {
  // Web: Esc fecha o overlay.
  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    // Captura + stopImmediatePropagation: um seletor aberto sobre um Modal fecha sozinho, sem fechar o Modal.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const shellStyle: ViewStyle = {
    flex: 1,
    backgroundColor: "rgba(17,23,34,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: contentPadding,
    ...(Platform.OS === "web"
      ? {
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: WEB_OVERLAY_Z_INDEX,
        }
      : {}),
  };

  const content = <View style={shellStyle}>{children}</View>;

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}
