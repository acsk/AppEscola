import React from "react";
import { Text } from "react-native";
import type { MessageModalProps, MessageModalType } from "../../types/components";
import { color } from "../../constants/theme";
import OverlayPortal from "./OverlayPortal";
import DialogPanel from "./DialogPanel";
import Button from "./Button";

/** Tom do aviso: faixa de status no topo + rótulo do botão. A palavra do título carrega o sentido, não só a cor. */
const config: Record<MessageModalType, { status: string; btnText: string }> = {
  error: { status: color.danger, btnText: "Entendi" },
  success: { status: color.success, btnText: "OK" },
  warning: { status: color.warning, btnText: "Entendi" },
  info: { status: color.brand, btnText: "OK" },
};

export default function MessageModal({ visible, type = "error", title, message, onClose }: MessageModalProps) {
  const c = config[type];
  return (
    <OverlayPortal open={visible} onClose={onClose} contentPadding={16}>
      <DialogPanel
        title={title}
        statusColor={c.status}
        maxWidth={500}
        footer={<Button variant="primary" label={c.btnText} onPress={onClose} />}
      >
        <Text className="text-sm text-ink-muted" style={{ lineHeight: 22 }}>
          {message}
        </Text>
      </DialogPanel>
    </OverlayPortal>
  );
}
