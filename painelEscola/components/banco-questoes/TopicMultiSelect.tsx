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
  /** Rótulo do campo (padrão "Assuntos"; ex.: "Disciplinas da prova"). */
  label?: string;
  /** Texto de busca (padrão conforme houver disciplina por item). */
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
};

/** Seleção múltipla de assuntos com busca sem acento (filtra por nome do assunto ou da disciplina). */
export default function TopicMultiSelect({
  topics, value, onChange, disabled, loading, disabledHint, label = "Assuntos", searchPlaceholder, required, error,
}: Props) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);

  // Selecionados primeiro na lista (sem busca), para o usuário não precisar rolar até eles.
  const visible = useMemo(() => {
    const q = foldText(query);
    const matches = q ? topics.filter((t) => foldText(t.name).includes(q) || foldText(t.subject_name ?? "").includes(q)) : topics;
    if (q) return matches;
    const chosen = new Set(value);
    return [...matches.filter((t) => chosen.has(t.id)), ...matches.filter((t) => !chosen.has(t.id))];
  }, [query, topics, value]);

  /** Assuntos marcados, na ordem em que foram escolhidos (chips acima da lista). */
  const selectedTopics = useMemo(() => {
    const byId = new Map(topics.map((t) => [t.id, t]));
    return value.map((id) => byId.get(id)).filter((t): t is TopicOption => !!t);
  }, [topics, value]);

  const toggle = (id: number) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-ink-muted mb-1" nativeID={`multi-${label}`}>
        {label}
        {required && <Text className="text-danger"> *</Text>} {value.length > 0 ? `(${value.length})` : ""}
      </Text>
      {!disabled && selectedTopics.length > 0 && (
        <View className="flex-row flex-wrap items-center gap-1.5 mb-1.5" aria-label="Assuntos selecionados">
          {selectedTopics.map((topic) => (
            <View key={topic.id} className="flex-row items-center rounded-full bg-brand-tint border border-border pl-2 pr-1 py-0.5">
              <Text className="text-xs text-brand">
                {topic.name}
                {topic.subject_name ? <Text className="text-ink-subtle"> · {topic.subject_name}</Text> : null}
              </Text>
              <TouchableOpacity onPress={() => toggle(topic.id)} aria-label={`Remover assunto ${topic.name}`} className="ml-1">
                <Ionicons name="close" size={12} color="var(--ds-brand-hover)" />
              </TouchableOpacity>
            </View>
          ))}
          {selectedTopics.length > 1 && (
            <TouchableOpacity onPress={() => onChange([])} aria-label="Remover todos os assuntos" className="px-1 py-0.5">
              <Text className="text-xs text-ink-muted underline">Limpar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {disabled ? (
        <View className="rounded-ds-md border border-dashed border-border-strong px-3 py-2 min-h-control-md justify-center">
          <Text className="text-xs text-ink-subtle">{disabledHint ?? "Escolha a disciplina primeiro."}</Text>
        </View>
      ) : (
        <View
          className={`rounded-ds-md border bg-surface ${error ? "border-danger" : "border-border"}`}
          aria-labelledby={`multi-${label}`}
        >
          <View className="flex-row items-center px-3 border-b border-border" style={{ height: 38 }}>
            <Ionicons name="search-outline" size={14} color="var(--ds-ink-subtle)" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder ?? (topics.some((t) => t.subject_name) ? "Buscar assunto (a disciplina é preenchida sozinha)..." : "Filtrar assuntos...")}
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
      {error ? <Text className="text-xs font-medium text-danger mt-1">{error}</Text> : null}
    </View>
  );
}
