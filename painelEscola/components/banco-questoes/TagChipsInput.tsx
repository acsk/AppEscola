import React, { useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
      <Text className="text-xs font-medium text-gray-600 mb-1" nativeID={`tags-${label}`}>
        {label}
      </Text>
      <View className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 flex-row flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <View key={tag} className="flex-row items-center rounded-full bg-violet-50 border border-violet-200 pl-2 pr-1 py-0.5">
            <Text className="text-xs text-violet-700">{tag}</Text>
            <TouchableOpacity
              onPress={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remover tag ${tag}`}
              className="ml-1"
            >
              <Ionicons name="close" size={12} color="#6D28D9" />
            </TouchableOpacity>
          </View>
        ))}
        <TextInput
          value={text}
          onChangeText={(v) => (v.endsWith(",") ? commit(v.slice(0, -1)) : setText(v))}
          onSubmitEditing={() => commit(text)}
          blurOnSubmit={false}
          placeholder={value.length ? "" : "Digite e tecle Enter"}
          placeholderTextColor="#9CA3AF"
          aria-labelledby={`tags-${label}`}
          className="text-xs text-gray-800"
          style={{ minWidth: 120, flexGrow: 1, height: 28 }}
          maxLength={50}
        />
      </View>
      {matches.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-1.5">
          {matches.map((name) => (
            <TouchableOpacity
              key={name}
              onPress={() => commit(name)}
              className="rounded-full border border-gray-200 px-2 py-0.5"
            >
              <Text className="text-xs text-gray-600">+ {name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
