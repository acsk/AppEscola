import React, { useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { color } from "../../constants/theme";
import { foldText } from "../../utils/questionBankQuery";
import { addTag } from "../../utils/questionClassification";

type Props = {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  /** Nomes existentes para sugestão. */
  suggestions?: string[];
};

/** Tags como chips: Enter ou vírgula adiciona; tag inexistente é criada ao salvar. */
export default function TagChipsInput({ label = "Tags", value, onChange, suggestions = [] }: Props) {
  const [text, setText] = useState("");

  const matches = useMemo(() => {
    const q = foldText(text);
    if (!q) return [];
    const current = new Set(value.map(foldText));
    return suggestions.filter((s) => foldText(s).includes(q) && !current.has(foldText(s))).slice(0, 6);
  }, [suggestions, text, value]);

  const commit = (raw: string) => {
    onChange(addTag(value, raw));
    setText("");
  };

  return (
    <View className="mb-3">
      <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }} nativeID={`tags-${label}`}>
        {label}
      </Text>
      <View className="rounded-ds-md border border-border-strong bg-surface flex-row flex-wrap items-center" style={{ gap: 6, minHeight: 40, paddingVertical: 4, paddingHorizontal: 8 }}>
        {value.map((tag) => (
          <View key={tag} className="flex-row items-center rounded-ds-sm bg-surface-sunken border border-border" style={{ gap: 4, height: 26, paddingLeft: 8, paddingRight: 4 }}>
            <Text className="text-ink-muted font-medium" style={{ fontSize: 13 }}>{tag}</Text>
            <TouchableOpacity
              onPress={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remover tag ${tag}`}
              style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}
            >
              <X size={12} color={color["ink-muted"]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ))}
        <TextInput
          value={text}
          onChangeText={(v) => (v.endsWith(",") ? commit(v.slice(0, -1)) : setText(v))}
          onSubmitEditing={() => commit(text)}
          blurOnSubmit={false}
          placeholder={value.length ? "Nova tag…" : "Digite e tecle Enter"}
          placeholderTextColor="var(--ds-ink-subtle)"
          aria-labelledby={`tags-${label}`}
          className="text-ink"
          style={[{ minWidth: 100, flexGrow: 1, height: 30, fontSize: 14 }, { outlineStyle: "none", boxShadow: "none" } as object]}
          maxLength={50}
        />
      </View>
      {matches.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-1.5">
          {matches.map((name) => (
            <TouchableOpacity
              key={name}
              onPress={() => commit(name)}
              className="rounded-ds-sm"
              style={{ height: 24, paddingHorizontal: 8, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: color["border-strong"] }}
            >
              <Text className="text-ink-muted" style={{ fontSize: 12 }}>+ {name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
