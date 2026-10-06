import React from "react";
import { Text, View } from "react-native";
import type { ConfirmModalProps } from "../../types/components";
import OverlayPortal from "./OverlayPortal";
import DialogPanel from "./DialogPanel";
import Button from "./Button";

/**
 * Confirmação antes de uma ação. `tone="danger"` usa o botão destrutivo vermelho cheio.
 * `iconName` é mantido por compatibilidade, mas o design system não usa ícone decorativo no diálogo.
 */
export default function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmDisabled,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  tone = "danger",
  children,
}: ConfirmModalProps) {
  return (
    <OverlayPortal open={visible} onClose={loading ? () => {} : onCancel} contentPadding={16}>
      <DialogPanel
        title={title}
        maxWidth={children ? 560 : 520}
        footer={
          <>
            <Button variant="secondary" label={cancelLabel} onPress={onCancel} disabled={loading} />
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              label={confirmLabel}
              onPress={onConfirm}
              loading={loading}
              disabled={confirmDisabled}
            />
          </>
        }
      >
        <Text className="text-sm text-ink-muted" style={{ lineHeight: 22 }}>
          {message}
        </Text>
        {children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
      </DialogPanel>
    </OverlayPortal>
  );
}
