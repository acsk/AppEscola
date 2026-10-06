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
  /** Linha divisória antes do item (separa a zona de risco). */
  separatorBefore?: boolean;
  disabled?: boolean;
};

type Props = {
  items: ActionsMenuItem[];
  /** Texto do botão para leitor de tela. */
  label?: string;
};

/** Botão "⋯" com menu suspenso (popover `surface` + `shadow-overlay`, raio 6px). Esc ou clique fora fecha. */
export default function ActionsMenu({ items, label = "Mais ações" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <View style={{ position: "relative", zIndex: open ? 50 : undefined }}>
      <Button iconOnly icon={Ellipsis} accessibilityLabel={label} onPress={() => setOpen((v) => !v)} />
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
              right: 0,
              top: 44,
              zIndex: 2,
              minWidth: 240,
              padding: 4,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: 6,
              ...(Platform.OS === "web" ? ({ boxShadow: shadow.overlay } as object) : {}),
            }}
          >
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
                  className={`flex-row items-center rounded-ds-md ${item.danger ? "bg-danger-tint" : ""}`}
                  style={{ gap: 8, height: 34, paddingHorizontal: 12, opacity: item.disabled ? 0.45 : 1 }}
                >
                  {item.icon ? <Icon icon={item.icon} color={item.danger ? color.danger : color["ink-muted"]} /> : null}
                  <Text className={`text-sm ${item.danger ? "font-semibold text-danger" : "text-ink"}`} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
