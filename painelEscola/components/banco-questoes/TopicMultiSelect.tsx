import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SubjectTopic } from "../../types/questionBank";
import { foldText } from "../../utils/questionBankQuery";

type Props = {
  topics: SubjectTopic[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  loading?: boolean;
  disabledHint?: string;
};

/** Seleção múltipla de assuntos (já filtrados pela disciplina), com busca sem acento. */
export default function TopicMultiSelect({ topics, value, onChange, disabled, loading, disabledHint }: Props) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);

  const visible = useMemo(() => {
    const q = foldText(query);
    return q ? topics.filter((t) => foldText(t.name).includes(q)) : topics;
  }, [query, topics]);

  const toggle = (id: number) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-gray-600 mb-1" nativeID="topics-label">
        Assuntos {value.length > 0 ? `(${value.length})` : ""}
      </Text>
      {disabled ? (
        <View className="rounded-xl border border-dashed border-gray-200 px-3 py-3">
          <Text className="text-xs text-gray-400">{disabledHint ?? "Escolha a disciplina primeiro."}</Text>
        </View>
      ) : (
        <View className="rounded-xl border border-gray-200 bg-white" aria-labelledby="topics-label">
          <View className="flex-row items-center px-3 border-b border-gray-100" style={{ height: 38 }}>
            <Ionicons name="search-outline" size={14} color="#9CA3AF" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Filtrar assuntos..."
              placeholderTextColor="#9CA3AF"
              aria-label="Filtrar assuntos"
              className="flex-1 ml-2 text-xs text-gray-800"
            />
          </View>
          {loading ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 180 }}>
              {visible.length === 0 ? (
                <Text className="text-xs text-gray-400 px-3 py-3">
                  {topics.length === 0 ? "Esta disciplina ainda não tem assuntos." : "Nenhum assunto encontrado."}
                </Text>
              ) : (
                visible.map((topic) => {
                  const checked = selected.has(topic.id);
                  return (
                    <TouchableOpacity
                      key={topic.id}
                      role="checkbox"
                      aria-checked={checked}
                      onPress={() => toggle(topic.id)}
                      className="flex-row items-center px-3 py-2"
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={checked ? "checkbox" : "square-outline"}
                        size={16}
                        color={checked ? "#7C3AED" : "#9CA3AF"}
                      />
                      <Text className="text-xs text-gray-800 ml-2 flex-1">{topic.name}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
