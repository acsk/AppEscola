import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  title?: string;
  description?: string;
  /** Botões no cabeçalho do painel. */
  actions?: React.ReactNode;
  /** Barra de ações em `surface-sunken`, alinhada à direita. */
  footer?: React.ReactNode;
  /** Sem padding no corpo (ex.: tabela ocupando o painel). */
  flush?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Contêiner de conteúdo: borda `border`, raio 4px, sem sombra. Não aninhe painéis. */
export default function Panel({ title, description, actions, footer, flush = false, children, style }: Props) {
  return (
    <View className="bg-surface border border-border rounded-ds-md overflow-hidden" style={style}>
      {(title || actions) && (
        <View
          className="flex-row border-b border-border"
          style={{ alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingVertical: 16, paddingHorizontal: 24 }}
        >
          <View style={{ flexShrink: 1 }}>
            {!!title && (
              <Text role="heading" aria-level={2} className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 24 }}>
                {title}
              </Text>
            )}
            {!!description && (
              <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                {description}
              </Text>
            )}
          </View>
          {actions ? <View style={{ flexDirection: "row", gap: 8 }}>{actions}</View> : null}
        </View>
      )}
      <View style={flush ? undefined : { padding: 24 }}>{children}</View>
      {footer ? (
        <View
          className="flex-row border-t border-border bg-surface-sunken"
          style={{ justifyContent: "flex-end", gap: 8, paddingVertical: 12, paddingHorizontal: 24 }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
