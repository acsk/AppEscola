import React from "react";
import { Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtNumber } from "./format";
import type { BiRecurringError } from "../../services/biService";

/** Uma questão com a taxa de erro e a distribuição das alternativas (correta e distrator principal sinalizados por texto). */
export function RecurringErrorItem({ item }: { item: BiRecurringError }) {
  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row" style={{ justifyContent: "space-between", gap: 12 }}>
        <Text className="font-mono text-ink-subtle" style={{ fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
          {`${item.code} · ${item.source_label}`}
        </Text>
        <Text className="font-mono font-semibold text-danger" style={{ fontSize: 11 }}>
          {`${fmtNumber(item.error_rate, 0)}% de erro`}
        </Text>
      </View>
      <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }}>
        {item.text || "Questão sem enunciado em texto (imagem)."}
      </Text>
      <View style={{ gap: 6 }}>
        {item.options.map((option) => {
          const distractor = item.main_distractor?.option_id === option.option_id;
          const note = option.is_correct ? " · correta" : distractor ? " · distrator principal" : "";
          return (
            <View
              key={option.option_id}
              className="flex-row items-center"
              style={{ gap: 10 }}
              aria-label={`Alternativa ${option.letter}${note}: ${fmtNumber(option.pct, 0)}% das respostas`}
            >
              <View
                className={option.is_correct ? "bg-success" : "border border-border-strong"}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" }}
              >
                <Text className={`font-semibold ${option.is_correct ? "text-surface" : "text-ink-muted"}`} style={{ fontSize: 11 }}>
                  {option.letter}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <Text className="text-ink" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                  {option.text}
                  <Text className="text-ink-muted">{note}</Text>
                </Text>
                <View className="bg-surface-sunken" style={{ height: 6, borderRadius: 2 }}>
                  <View
                    style={{
                      width: `${option.pct}%`,
                      height: 6,
                      borderRadius: 2,
                      backgroundColor: option.is_correct ? color["data-1"] : color["ink-subtle"],
                    }}
                  />
                </View>
              </View>
              <Text className="font-mono text-ink-muted" style={{ fontSize: 11, width: 40, textAlign: "right" }}>
                {`${fmtNumber(option.pct, 0)}%`}
              </Text>
            </View>
          );
        })}
        {item.other > 0 ? (
          <Text className="text-ink-subtle" style={{ fontSize: 11 }}>
            {`${item.other} resposta(s) sem alternativa registrada.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Resumo factual do erro mais recorrente (sem inferência): alternativa errada mais marcada e amostra. */
export function ErrorPatternNote({ item }: { item: BiRecurringError }) {
  const distractor = item.main_distractor;
  const option = item.options.find((o) => o.option_id === distractor?.option_id);
  if (!distractor || !option) return null;

  return (
    <View className="bg-surface-sunken border border-border rounded-ds-sm" style={{ padding: 14, gap: 8, borderLeftWidth: 3, borderLeftColor: color["border-strong"] }}>
      <Text className="text-ink" style={{ fontSize: 13, lineHeight: 19 }}>
        <Text className="font-semibold">Padrão de erro: </Text>
        {`${fmtNumber(distractor.pct, 0)}% marcaram a alternativa ${distractor.letter} ("${option.text}") em ${item.code}. Vale revisar o raciocínio que leva a ela antes de novas listas.`}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {[`n=${item.answers.toLocaleString("pt-BR")} respostas`, `${item.students.toLocaleString("pt-BR")} alunos`, "1ª tentativa"].map((tag) => (
          <Text key={tag} className="font-mono text-ink-muted border border-border rounded-ds-sm" style={{ fontSize: 11, paddingHorizontal: 6, paddingVertical: 2 }}>
            {tag}
          </Text>
        ))}
      </View>
    </View>
  );
}
