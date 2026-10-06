import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react-native";
import Icon from "./Icon";
import { color } from "../../constants/theme";
import { applyThemePreference, readThemePreference, type ThemePreference } from "../../constants/themeCss";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema escuro", icon: Moon },
  { value: "system", label: "Tema do sistema", icon: Monitor },
];

type Props = {
  /** Compacto (celular): um botão que alterna claro → escuro → sistema. */
  compact?: boolean;
};

/** Seletor de tema: claro, escuro ou o do sistema operacional (salvo no navegador). */
export default function ThemeToggle({ compact = false }: Props) {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    applyThemePreference(value);
  };

  if (compact) {
    const index = OPTIONS.findIndex((o) => o.value === preference);
    const current = OPTIONS[index];
    const next = OPTIONS[(index + 1) % OPTIONS.length];
    return (
      <TouchableOpacity
        onPress={() => choose(next.value)}
        aria-label={`${current.label}. Trocar para ${next.label.toLowerCase()}`}
        className="items-center justify-center rounded-ds-md"
        style={{ width: 38, height: 38 }}
        activeOpacity={0.7}
      >
        <Icon icon={current.icon} />
      </TouchableOpacity>
    );
  }

  return (
    <View role="radiogroup" aria-label="Tema" className="flex-row border border-border rounded-ds-md overflow-hidden">
      {OPTIONS.map((option, i) => {
        const selected = option.value === preference;
        return (
          <TouchableOpacity
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => choose(option.value)}
            className={`items-center justify-center ${selected ? "bg-surface-sunken" : "bg-surface"}`}
            style={{ width: 32, height: 30, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: color.border }}
            activeOpacity={0.7}
          >
            <Icon icon={option.icon} color={selected ? color.ink : color["ink-subtle"]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
