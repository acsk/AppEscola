import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Plus } from "lucide-react-native";
import Button from "../ui/Button";
import DeleteIconButton from "../ui/DeleteIconButton";
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
};

/** Alternativas de questão objetiva: texto com formatação, gabarito (rádio), adicionar/remover. */
export default function OptionsEditor({ options, onChange, error, labelId = "alternativas-label" }: Props) {
  const setText = (key: string, text: string) =>
    onChange(options.map((o) => (o.key === key ? { ...o, option_text: text } : o)));

  return (
    <View className="mb-4">
      <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 2 }} nativeID={labelId}>
        Alternativas
      </Text>
      <Text className="text-xs text-ink-subtle" style={{ marginBottom: 8 }}>
        Marque a alternativa correta. Alternativas em branco são ignoradas.
      </Text>
      <View role="radiogroup" aria-labelledby={labelId} style={{ gap: 8 }}>
        {options.map((option, i) => (
          <View
            key={option.key}
            className={`flex-row items-start border rounded-ds-md px-2 ${option.is_correct ? "border-success bg-success-tint" : "border-border-strong bg-surface"}`}
            style={{ gap: 8, minHeight: 38 }}
          >
            <TouchableOpacity
              role="radio"
              aria-checked={option.is_correct}
              aria-label={`Alternativa ${LETTERS[i]} é a correta`}
              onPress={() => onChange(markCorrect(options, option.key))}
              className="items-center justify-center"
              style={{ width: 28, height: 36 }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: option.is_correct ? color.success : color["border-strong"],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {option.is_correct && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color.success }} />}
              </View>
            </TouchableOpacity>
            <Text className="text-sm font-semibold text-ink-muted" style={{ width: 16, lineHeight: 36 }}>
              {LETTERS[i]}
            </Text>
            <RichTextInput
              compact
              value={option.option_text}
              onChange={(v) => setText(option.key, v)}
              placeholder={`Texto da alternativa ${LETTERS[i]}`}
              aria-label={`Texto da alternativa ${LETTERS[i]}`}
            />
            {option.is_correct && (
              <Text className="text-xs font-medium text-success" style={{ marginRight: 4, lineHeight: 36 }}>
                Correta
              </Text>
            )}
            {options.length > 2 && (
              <View style={{ height: 36, justifyContent: "center" }}>
                <DeleteIconButton
                  label={`Remover alternativa ${LETTERS[i]}`}
                  onPress={() => onChange(options.filter((o) => o.key !== option.key))}
                />
              </View>
            )}
          </View>
        ))}
      </View>
      {error ? <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>{error}</Text> : null}
      {options.length < MAX_OPTIONS && (
        <View style={{ marginTop: 8 }}>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            label="Adicionar alternativa"
            onPress={() => onChange([...options, { key: newOptionKey(), option_text: "", is_correct: false }])}
          />
        </View>
      )}
    </View>
  );
}
