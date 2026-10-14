import React from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { Check, Plus, Trash2 } from "lucide-react-native";
import Button from "../ui/Button";
import RichTextInput from "../ui/RichTextInput";
import { color } from "../../constants/theme";
import { MAX_OPTIONS, type OptionDraft, markCorrect, newOptionKey } from "../../utils/questionContent";

const LETTERS = "ABCDEFGHIJ";

type Props = {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  error?: string;
  /** Id único do rótulo (vários editores na mesma tela, ex.: modal de semelhantes). */
  labelId?: string;
  disabled?: boolean;
};

/** Alternativas de questão objetiva (protótipo "TelaEditarQuestao"): texto com formatação, gabarito (rádio), adicionar/remover. */
export default function OptionsEditor({ options, onChange, error, labelId = "alternativas-label", disabled = false }: Props) {
  const setText = (key: string, text: string) =>
    onChange(options.map((o) => (o.key === key ? { ...o, option_text: text } : o)));

  return (
    <View className="mb-4">
      <View className="flex-row items-baseline justify-between flex-wrap" style={{ gap: 8, marginBottom: 6 }}>
        <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18 }} nativeID={labelId}>
          Alternativas
          <Text className="text-danger"> *</Text>
        </Text>
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
          Clique na alternativa correta · em branco são ignoradas
        </Text>
      </View>
      <View role="radiogroup" aria-labelledby={labelId} style={{ gap: 6 }}>
        {options.map((option, i) => (
          <View
            key={option.key}
            className={`flex-row items-start border rounded-ds-md ${option.is_correct ? "border-success bg-success-tint" : "border-border-strong bg-surface"}`}
            style={[
              { gap: 8, minHeight: 44, paddingLeft: 4, paddingRight: 6 },
              option.is_correct && Platform.OS === "web" ? ({ boxShadow: `inset 3px 0 0 ${color.success}` } as object) : null,
            ]}
          >
            <TouchableOpacity
              role="radio"
              aria-checked={option.is_correct}
              aria-label={`Alternativa ${LETTERS[i]} é a correta`}
              onPress={() => onChange(markCorrect(options, option.key))}
              disabled={disabled}
              className="flex-row items-center"
              style={{ gap: 8, height: 42, paddingLeft: 8 }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: option.is_correct ? color.success : color["border-strong"],
                  backgroundColor: color.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {option.is_correct && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color.success }} />}
              </View>
              <Text className={`font-mono font-semibold ${option.is_correct ? "text-success" : "text-ink-muted"}`} style={{ fontSize: 14, width: 16 }}>
                {LETTERS[i]}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
              <RichTextInput
                compact
                value={option.option_text}
                onChange={(v) => setText(option.key, v)}
                placeholder={`Texto da alternativa ${LETTERS[i]}`}
                aria-label={`Texto da alternativa ${LETTERS[i]}`}
                disabled={disabled}
              />
            </View>
            {option.is_correct && (
              <View className="flex-row items-center" style={{ gap: 4, height: 42 }}>
                <Check size={14} color={color.success} strokeWidth={2} />
                <Text className="font-medium text-success" style={{ fontSize: 12 }}>Correta</Text>
              </View>
            )}
            {options.length > 2 && (
              <View style={{ height: 42, justifyContent: "center" }}>
                <TouchableOpacity
                  role="button"
                  aria-label={`Remover alternativa ${LETTERS[i]}`}
                  onPress={() => onChange(options.filter((o) => o.key !== option.key))}
                  disabled={disabled}
                  className="items-center justify-center rounded-ds-sm"
                  style={{ width: 28, height: 28, opacity: disabled ? 0.45 : 1 }}
                >
                  <Trash2 size={16} color={color["ink-subtle"]} strokeWidth={1.5} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
      {error ? <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>{error}</Text> : null}
      {options.length < MAX_OPTIONS && (
        <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            label={`Adicionar alternativa ${LETTERS[options.length]}`}
            onPress={() => onChange([...options, { key: newOptionKey(), option_text: "", is_correct: false }])}
            disabled={disabled}
          />
        </View>
      )}
    </View>
  );
}
