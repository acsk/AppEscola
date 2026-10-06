import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TopicOption } from "../../types/questionBank";
import { foldText } from "../../utils/questionBankQuery";

type Props = {
  /** Com `subject_name`, mostra a disciplina de cada assunto (busca em todas as disciplinas). */
  topics: TopicOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  loading?: boolean;
  disabledHint?: string;
};

/** Seleção múltipla de assuntos com busca sem acento (filtra por nome do assunto ou da disciplina). */
export default function TopicMultiSelect({ topics, value, onChange, disabled, loading, disabledHint }: Props) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);

  const visible = useMemo(() => {
    const q = foldText(query);
    return q ? topics.filter((t) => foldText(t.name).includes(q) || foldText(t.subject_name ?? "").includes(q)) : topics;
  }, [query, topics]);

  const toggle = (id: number) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-ink-muted mb-1" nativeID="topics-label">
        Assuntos {value.length > 0 ? `(${value.length})` : ""}
      </Text>
      {disabled ? (
        <View className="rounded-ds-md border border-dashed border-border-strong px-3 py-2 min-h-control-md justify-center">
          <Text className="text-xs text-ink-subtle">{disabledHint ?? "Escolha a disciplina primeiro."}</Text>
        </View>
      ) : (
        <View className="rounded-ds-md border border-border bg-surface" aria-labelledby="topics-label">
          <View className="flex-row items-center px-3 border-b border-border" style={{ height: 38 }}>
            <Ionicons name="search-outline" size={14} color="var(--ds-ink-subtle)" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={topics.some((t) => t.subject_name) ? "Buscar assunto (a disciplina é preenchida sozinha)..." : "Filtrar assuntos..."}
              placeholderTextColor="var(--ds-ink-subtle)"
              aria-label="Filtrar assuntos"
              className="flex-1 ml-2 text-xs text-ink"
            />
          </View>
          {loading ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="var(--ds-brand)" />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 180 }}>
              {visible.length === 0 ? (
                <Text className="text-xs text-ink-subtle px-3 py-3">
                  {topics.length === 0 ? "Nenhum assunto cadastrado. Cadastre em Banco de questões › Taxonomia." : "Nenhum assunto encontrado."}
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
                        color={checked ? "var(--ds-brand)" : "var(--ds-ink-subtle)"}
                      />
                      <View className="ml-2 flex-1">
                        <Text className="text-xs text-ink">{topic.name}</Text>
                        {topic.subject_name ? <Text className="text-xs text-ink-subtle">{topic.subject_name}</Text> : null}
                      </View>
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
