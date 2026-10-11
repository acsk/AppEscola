import React, { useEffect, useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { Ellipsis, type LucideIcon } from "lucide-react-native";
import Button from "./Button";
import Icon from "./Icon";
import { color, shadow } from "../../constants/theme";

export type ActionsMenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  /** Excluir/remover: destacado em vermelho (padrão do painel). */
  danger?: boolean;
  /** Ação de IA: ícone e texto no ocre do tema. */
  ai?: boolean;
  /** Linha divisória antes do item (separa a zona de risco). */
  separatorBefore?: boolean;
  disabled?: boolean;
  /** Segunda linha em `ink-subtle` (ex.: "1 pág. · Totais e distribuição"). */
  description?: string;
};

type Props = {
  items: ActionsMenuItem[];
  /** Texto do botão para leitor de tela. */
  label?: string;
  /** Gatilho próprio no lugar do botão "⋯" (ex.: "Exportar PDF ▾"). */
  renderTrigger?: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  /** Rótulo de seção no topo do menu (estilo `overline`). */
  heading?: string;
  /** Lado em que o menu se alinha ao gatilho. */
  align?: "left" | "right";
  minWidth?: number;
};

/** Botão "⋯" com menu suspenso (popover `surface` + `shadow-overlay`, raio 6px). Esc ou clique fora fecha. */
export default function ActionsMenu({ items, label = "Mais ações", renderTrigger, heading, align = "right", minWidth = 240 }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <View style={{ position: "relative", zIndex: open ? 50 : undefined }}>
      {renderTrigger ? (
        renderTrigger({ open, toggle: () => setOpen((v) => !v) })
      ) : (
        <Button iconOnly icon={Ellipsis} accessibilityLabel={label} onPress={() => setOpen((v) => !v)} />
      )}
      {open && (
        <>
          {/* Fundo invisível: clique fora fecha o menu. */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(false)}
            aria-hidden
            style={{ position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
          />
          <View
            role="menu"
            style={{
              position: "absolute",
              ...(align === "right" ? { right: 0 } : { left: 0 }),
              top: "100%",
              marginTop: 6,
              zIndex: 2,
              minWidth,
              padding: 4,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: 6,
              ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay } as object) : {}),
            }}
          >
            {heading ? (
              <Text
                className="font-semibold text-ink-subtle"
                style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.88, textTransform: "uppercase", paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 }}
              >
                {heading}
              </Text>
            ) : null}
            {items.map((item) => (
              <View key={item.key}>
                {item.separatorBefore && <View style={{ height: 1, backgroundColor: color.border, marginVertical: 4 }} />}
                <TouchableOpacity
                  role="menuitem"
                  disabled={item.disabled}
                  onPress={() => {
                    setOpen(false);
                    item.onPress();
                  }}
                  className={`flex-row items-center rounded-ds-md ${item.danger ? "bg-danger-tint" : item.ai ? "bg-accent-tint" : ""}`}
                  style={{
                    gap: item.description ? 10 : 8,
                    minHeight: 34,
                    paddingVertical: item.description ? 8 : 0,
                    paddingHorizontal: 12,
                    opacity: item.disabled ? 0.45 : 1,
                  }}
                >
                  {item.icon ? <Icon icon={item.icon} color={item.danger ? color.danger : item.ai ? color.accent : color["ink-muted"]} /> : null}
                  <View style={{ flexShrink: 1 }}>
                    <Text
                      className={`text-sm ${item.danger ? "font-semibold text-danger" : item.ai ? "font-semibold text-accent" : item.description ? "font-medium text-ink" : "text-ink"}`}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
