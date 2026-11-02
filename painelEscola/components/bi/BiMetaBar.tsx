import React from "react";
import { Text, View } from "react-native";
import { color } from "../../constants/theme";
import { fmtUpdatedAt } from "./format";

type Props = {
  plan?: "basic" | "advanced";
  generatedAt?: string;
  /** Até quando as respostas estão consolidadas (tabela de fatos); ausente = cálculo ao vivo. */
  answersAsOf?: string | null;
  extra?: string;
};

const Sep = () => <View style={{ width: 1, height: 12, backgroundColor: color.border }} />;

/** Linha de status do BI: plano, horário do cálculo e fontes. */
export default function BiMetaBar({ plan, generatedAt, answersAsOf, extra }: Props) {
  return (
    <View className="flex-row items-center flex-wrap" style={{ gap: 12 }}>
      {plan ? (
        <View
          className="rounded-ds-sm"
          style={{ height: 20, paddingHorizontal: 6, justifyContent: "center", borderWidth: 1, borderColor: plan === "advanced" ? color.brand : color["border-strong"] }}
        >
          <Text className={`font-semibold ${plan === "advanced" ? "text-brand" : "text-ink-muted"}`} style={{ fontSize: 10, letterSpacing: 0.8 }}>
            {plan === "advanced" ? "BI AVANÇADO" : "BI BÁSICO"}
          </Text>
        </View>
      ) : null}
      {generatedAt ? (
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
          Calculado em <Text className="font-medium text-ink-muted">{fmtUpdatedAt(generatedAt)}</Text> · atualiza a cada 10 min
        </Text>
      ) : null}
      {answersAsOf ? (
        <>
          <Sep />
          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
            Respostas até <Text className="font-medium text-ink-muted">{fmtUpdatedAt(answersAsOf)}</Text>
          </Text>
        </>
      ) : null}
      {extra ? (
        <>
          <Sep />
          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
            {extra}
          </Text>
        </>
      ) : null}
    </View>
  );
}
