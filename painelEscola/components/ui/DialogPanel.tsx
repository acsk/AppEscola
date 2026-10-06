import React from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { shadow } from "../../constants/theme";

type Props = {
  title: string;
  /** Faixa de status de 3px no topo (tom semântico), opcional. */
  statusColor?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: number;
};

/** Caixa de diálogo curta (confirmação/mensagem): raio `radius-lg`, sombra de sobreposição, ações à direita. */
export default function DialogPanel({ title, statusColor, children, footer, maxWidth = 520 }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;
  const padding = isMobile ? 16 : 40;

  return (
    <View
      role="alertdialog"
      aria-modal
      aria-label={title}
      className="bg-surface rounded-ds-lg overflow-hidden"
      style={{
        width: "100%",
        maxWidth: Math.min(width - padding * 2, maxWidth),
        ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay } as object) : { elevation: 10 }),
      }}
    >
      {statusColor ? <View style={{ height: 3, backgroundColor: statusColor }} /> : null}
      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20, gap: 8 }}>
        <Text className="font-semibold text-ink" style={{ fontSize: 20, lineHeight: 28 }}>
          {title}
        </Text>
        {children}
      </View>
      <View
        className="border-t border-border bg-surface-sunken"
        style={{
          flexDirection: isMobile ? "column-reverse" : "row",
          justifyContent: "flex-end",
          gap: 8,
          paddingHorizontal: 24,
          paddingVertical: 12,
        }}
      >
        {footer}
      </View>
    </View>
  );
}
