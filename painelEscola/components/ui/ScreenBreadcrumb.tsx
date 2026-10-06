import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export type BreadcrumbItem = {
  label: string;
  onPress?: () => void;
};

type Props = {
  items: BreadcrumbItem[];
  /** Dentro do PageHeader a margem inferior fica por conta dele. */
  inline?: boolean;
};

/** Trilha de localização separada por "/"; o último item é a página atual. */
export default function ScreenBreadcrumb({ items, inline = false }: Props) {
  if (items.length === 0) return null;

  return (
    <View
      role="navigation"
      aria-label="Trilha de navegação"
      className="flex-row items-center flex-wrap"
      style={{ gap: 8, marginBottom: inline ? 0 : 16 }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <Text className="text-border-strong" style={{ fontSize: 13, lineHeight: 18 }} aria-hidden>
                /
              </Text>
            ) : null}
            {isLast ? (
              <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18 }} aria-current="page">
                {item.label}
              </Text>
            ) : item.onPress ? (
              <TouchableOpacity onPress={item.onPress} role="link" activeOpacity={0.7}>
                <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, lineHeight: 18 }}>
                {item.label}
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
