import React from "react";
import { Platform, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Check, Plus, X } from "lucide-react-native";
import SearchableSelect, { type SearchableOption } from "./SearchableSelect";
import Icon from "./Icon";
import { color } from "../../constants/theme";

type ChipShellProps = {
  label: string;
  /** Valor escolhido: o chip fica ativo ("Disciplina: Português") e ganha o "×". */
  valueLabel?: string | null;
  onPress: () => void;
  onClear?: () => void;
  disabled?: boolean;
};

/** Visual do chip de filtro: tracejado e "+" quando vazio; `brand-tint` com valor e "×" quando ativo. */
export function FilterChipShell({ label, valueLabel, onPress, onClear, disabled }: ChipShellProps) {
  const active = !!valueLabel;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role="button"
      aria-label={active ? `${label}: ${valueLabel}. Alterar filtro` : `Filtrar por ${label.toLowerCase()}`}
      style={(state) => {
        const hovered = Platform.OS === "web" && (state as { hovered?: boolean }).hovered;
        return {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          height: 32,
          maxWidth: 280,
          paddingLeft: 9,
          paddingRight: active && onClear ? 5 : 9,
          borderWidth: 1,
          borderStyle: active || hovered ? "solid" : "dashed",
          borderColor: active ? color.brand : color["border-strong"],
          backgroundColor: active ? color["brand-tint"] : color.surface,
          borderRadius: 4,
          opacity: disabled ? 0.45 : 1,
        };
      }}
    >
      {!active && <Icon icon={Plus} size={16} color={color["ink-muted"]} />}
      <Text
        numberOfLines={1}
        className="font-medium"
        style={{ fontSize: 13, flexShrink: 1, color: active ? color.brand : color["ink-muted"] }}
      >
        {active ? `${label}: ` : label}
        {active ? <Text className="font-semibold">{valueLabel}</Text> : null}
      </Text>
      {active && onClear ? (
        <TouchableOpacity
          onPress={onClear}
          aria-label={`Remover filtro ${label.toLowerCase()}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: 2 }}
        >
          <X size={12} color={color.brand} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}

type Props = {
  label: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  modalTitle?: string;
  disabled?: boolean;
  onSearch?: (query: string) => Promise<SearchableOption[]>;
  selectedOption?: SearchableOption;
};

/** Filtro em chip que abre o seletor com busca (`SearchableSelect`). Valor vazio = sem filtro. */
export default function FilterChip({ label, options, value, onChange, modalTitle, disabled, onSearch, selectedOption }: Props) {
  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      modalTitle={modalTitle ?? `Filtrar por ${label.toLowerCase()}`}
      disabled={disabled}
      onSearch={onSearch}
      selectedOption={selectedOption}
      renderTrigger={({ open, label: selectedLabel, hasValue }) => (
        <FilterChipShell
          label={label}
          valueLabel={hasValue && value ? selectedLabel : null}
          onPress={open}
          onClear={() => onChange("")}
          disabled={disabled}
        />
      )}
    />
  );
}

type ToggleProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Filtro liga/desliga com caixinha (ex.: "Mais erros"). Ligado: borda `ink-muted`, texto `ink`. */
export function ToggleChip({ label, checked, onPress, accessibilityLabel }: ToggleProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      role="checkbox"
      aria-checked={checked}
      aria-label={accessibilityLabel ?? label}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 32,
        paddingHorizontal: 9,
        borderWidth: 1,
        borderColor: checked ? color["ink-muted"] : color.border,
        backgroundColor: color.surface,
        borderRadius: 4,
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderWidth: 1,
          borderRadius: 2,
          borderColor: checked ? color.brand : color["border-strong"],
          backgroundColor: checked ? color.brand : color.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Check size={10} color={color["on-brand"]} strokeWidth={3} /> : null}
      </View>
      <Text className={checked ? "font-medium text-ink" : "text-ink-muted"} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Divisor vertical entre grupos de chips. */
export function ChipDivider() {
  return <View style={{ width: 1, height: 20, backgroundColor: color.border, marginHorizontal: 4 }} />;
}
