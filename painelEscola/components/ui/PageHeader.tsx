import React from "react";
import { Text, View } from "react-native";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import ScreenBreadcrumb, { type BreadcrumbItem } from "./ScreenBreadcrumb";

type Props = {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  /** Ações principais da página, à direita (no máximo um `primary`). */
  actions?: React.ReactNode;
};

/** Cabeçalho de página: trilha, título (estilo `display`), descrição e ações. Fica sobre `bg`. */
export default function PageHeader({ title, description, breadcrumb, actions }: Props) {
  const { isMobile } = useResponsiveLayout();
  return (
    <View
      style={{
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "flex-end",
        justifyContent: "space-between",
        gap: isMobile ? 16 : 24,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        {breadcrumb && breadcrumb.length > 0 && <ScreenBreadcrumb items={breadcrumb} inline />}
        <Text
          role="heading"
          aria-level={1}
          className="font-semibold text-ink"
          style={{ fontSize: isMobile ? 24 : 28, lineHeight: isMobile ? 32 : 36, letterSpacing: -0.28, marginTop: breadcrumb?.length ? 8 : 0 }}
        >
          {title}
        </Text>
        {!!description && (
          <Text className="text-sm text-ink-muted" style={{ marginTop: 2, lineHeight: 22 }}>
            {description}
          </Text>
        )}
      </View>
      {actions ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions}</View> : null}
    </View>
  );
}
