import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { color } from "../../constants/theme";
import { foldText } from "../../utils/questionBankQuery";

export type TokenOption = { id: number; name: string; /** À direita na lista (ex.: "412 questões", nome da disciplina). */ meta?: string };

type Props = {
  label: string;
  required?: boolean;
  /** Texto discreto ao lado do rótulo, ex.: "(opcional)". */
  labelNote?: string;
  options: TokenOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  /** Placeholder quando já há itens escolhidos. */
  morePlaceholder?: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  hint?: string;
  error?: string;
  /** Atalhos "+ nome" abaixo do campo (ex.: assuntos mais comuns). */
  suggestions?: TokenOption[];
  loading?: boolean;
};

/**
 * Seleção múltipla em etiquetas (protótipos "TelaImportarPDF" e "TelaEditarQuestao"): etiquetas `brand-tint`
 * removíveis, busca no próprio campo e a lista logo abaixo, filtrada pelo que se digita.
 */
export default function TokenSelect({
  label, required, labelNote, options, value, onChange, placeholder = "Buscar…", morePlaceholder = "Adicionar outro…",
  disabled, disabledPlaceholder, hint, error, suggestions = [], loading,
}: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const chosen = value.map((id) => byId.get(id)).filter((o): o is TokenOption => !!o);
  const matches = useMemo(() => {
    const q = foldText(text);
    return options.filter((o) => !value.includes(o.id) && (!q || foldText(o.name).includes(q))).slice(0, 50);
  }, [options, text, value]);

  const add = (id: number) => {
    onChange([...value, id]);
    setText("");
    inputRef.current?.focus();
  };
  const remove = (id: number) => onChange(value.filter((v) => v !== id));
  const visibleSuggestions = suggestions.filter((s) => !value.includes(s.id)).slice(0, 4);

  return (
    <View style={{ gap: 6 }}>
      <Text className="text-ink font-medium" style={{ fontSize: 13 }}>
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
        {labelNote ? <Text className="text-ink-subtle font-normal"> {labelNote}</Text> : null}
      </Text>
      <TouchableOpacity
        activeOpacity={1}
        disabled={disabled}
        onPress={() => { setOpen(true); inputRef.current?.focus(); }}
        className={`flex-row flex-wrap items-center rounded-ds-md ${disabled ? "bg-surface-sunken" : "bg-surface"}`}
        style={{
          gap: 6, minHeight: 40, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1,
          borderStyle: disabled ? "dashed" : "solid", borderColor: error ? color.danger : open ? color.brand : color["border-strong"],
        }}
      >
        {chosen.map((o) => (
          <View key={o.id} className="flex-row items-center bg-brand-tint rounded-ds-sm" style={{ gap: 4, height: 26, paddingLeft: 8, paddingRight: 4 }}>
            <Text className="text-brand font-medium" style={{ fontSize: 13 }}>{o.name}</Text>
            {!disabled ? (
              <TouchableOpacity onPress={() => remove(o.id)} aria-label={`Remover ${o.name}`} style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
                <X size={12} color={color.brand} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <TextInput
          ref={inputRef}
          value={text}
          editable={!disabled}
          onChangeText={(v) => { setText(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === "Backspace" && !text && value.length) remove(value[value.length - 1]);
            if (e.nativeEvent.key === "Enter" && matches[0]) add(matches[0].id);
          }}
          placeholder={disabled ? disabledPlaceholder ?? placeholder : chosen.length ? morePlaceholder : placeholder}
          placeholderTextColor={color["ink-subtle"]}
          aria-label={label}
          className="text-ink"
          style={[{ flex: 1, minWidth: 140, fontSize: 14, height: 30 }, { outlineStyle: "none", boxShadow: "none" } as object]}
        />
      </TouchableOpacity>
      {open && !disabled ? (
        <View className="bg-surface border border-border rounded-ds-lg" style={{ padding: 4, maxHeight: 200 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {loading ? (
              <Text className="text-ink-subtle" style={{ fontSize: 13, padding: 8 }}>Carregando…</Text>
            ) : matches.length ? matches.map((o) => (
              <TouchableOpacity key={o.id} role="option" onPress={() => add(o.id)} className="flex-row items-center rounded-ds-md" style={{ height: 32, paddingHorizontal: 10, gap: 8 }}>
                <Text className="text-ink flex-1" style={{ fontSize: 14 }} numberOfLines={1}>{o.name}</Text>
                {o.meta ? <Text className="font-mono text-ink-subtle" style={{ fontSize: 12 }}>{o.meta}</Text> : null}
              </TouchableOpacity>
            )) : (
              <Text className="text-ink-subtle" style={{ fontSize: 13, padding: 8 }}>{text ? "Nada encontrado." : "Todos já foram escolhidos."}</Text>
            )}
          </ScrollView>
        </View>
      ) : null}
      {!disabled && visibleSuggestions.length ? (
        <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
          <Text className="text-ink-subtle" style={{ fontSize: 12 }}>Sugestões:</Text>
          {visibleSuggestions.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => add(s.id)} className="rounded-ds-sm" style={{ height: 24, paddingHorizontal: 8, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: color["border-strong"] }}>
              <Text className="text-ink-muted" style={{ fontSize: 12 }}>+ {s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {error ? <Text className="text-danger" style={{ fontSize: 12 }}>{error}</Text>
        : hint ? <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>{hint}</Text> : null}
    </View>
  );
}
