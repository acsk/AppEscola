import React from "react";
import { Pressable, Text, View } from "react-native";
import { Check, Plus, Trash2 } from "lucide-react-native";
import Button from "../../ui/Button";
import { hoverChildren, hoverStyle } from "./webPress";
import { color } from "../../../constants/theme";
import { MAX_OPTIONS, markCorrect, newOptionKey, type OptionDraft } from "../../../utils/questionContent";

const LETTERS = "ABCDEFGHIJ";

type Props = {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  /** Gabarito veio do PDF (senão a marcação é sugestão da IA). */
  answerFromPdf: boolean;
  disabled?: boolean;
};

/** Alternativas da revisão: clicar na linha marca a correta; o texto é editado no próprio campo. */
export default function ReviewAlternatives({ options, onChange, answerFromPdf, disabled }: Props) {
  const setText = (key: string, option_text: string) =>
    onChange(options.map((o) => (o.key === key ? { ...o, option_text } : o)));

  return (
    <View>
      <View role="radiogroup" aria-label="Alternativa correta" style={{ gap: 6 }}>
        {options.map((option, i) => {
          const on = option.is_correct;
          const letter = LETTERS[i] ?? String(i + 1);
          return (
            <Pressable key={option.key} disabled={disabled} onPress={() => onChange(markCorrect(options, option.key))}
              role="radio" aria-checked={on} aria-label={`Marcar a alternativa ${letter} como correta`}
              style={hoverStyle(({ hovered }) => ({
                flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 12, paddingRight: 6,
                borderWidth: 1, borderRadius: 4,
                borderColor: on ? color.success : hovered ? color["ink-muted"] : color["border-strong"],
                backgroundColor: on ? color["success-tint"] : color.surface,
                boxShadow: on ? `inset 3px 0 0 ${color.success}` : undefined,
              }))}>
              {hoverChildren(({ hovered }) => (
                <>
                  <View style={{
                    width: 16, height: 16, borderRadius: 8, borderWidth: on ? 5 : 1.5,
                    borderColor: on ? color.success : color["border-strong"], backgroundColor: color.surface,
                  }} />
                  <Text className={`font-mono font-semibold ${on ? "text-success" : "text-ink-muted"}`} style={{ width: 20, fontSize: 14 }}>{letter}</Text>
                  <input
                    value={option.option_text}
                    disabled={disabled}
                    aria-label={`Texto da alternativa ${letter}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setText(option.key, event.target.value)}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "400 15px/20px var(--ds-font-sans, sans-serif)", color: "var(--ds-ink)" }}
                  />
                  {on ? (
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                      <Check size={14} color={color.success} strokeWidth={2} />
                      <Text className="text-xs font-medium text-success">Correta</Text>
                      {!answerFromPdf && <Text className="text-xs text-ink-subtle">· sugerida pela IA</Text>}
                    </View>
                  ) : null}
                  <Pressable disabled={disabled || options.length <= 2} accessibilityLabel={`Remover alternativa ${letter}`}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onChange(options.filter((o) => o.key !== option.key));
                    }}
                    style={hoverStyle(({ hovered: overDelete }) => ({
                      width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 2,
                      opacity: hovered || overDelete ? 1 : 0,
                      backgroundColor: overDelete ? color["danger-tint"] : "transparent",
                    }))}>
                    <Trash2 size={16} color={hovered ? color.danger : color["ink-subtle"]} />
                  </Pressable>
                </>
              ))}
            </Pressable>
          );
        })}
      </View>
      {options.length < MAX_OPTIONS && (
        <View className="mt-2 self-start">
          <Button size="sm" variant="ghost" icon={Plus} label={`Adicionar alternativa ${LETTERS[options.length]}`} disabled={disabled}
            onPress={() => onChange([...options, { key: newOptionKey(), option_text: "", is_correct: false }])} />
        </View>
      )}
      <Text className="text-xs text-ink-subtle mt-2">Removemos automaticamente os prefixos "(A)", "(B)"… que vieram do PDF.</Text>
    </View>
  );
}
