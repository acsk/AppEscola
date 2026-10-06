import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import OverlayPortal from "./OverlayPortal";
import DialogPanel from "./DialogPanel";
import { color } from "../../constants/theme";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Tempo típico (s), para a dica "costuma levar até…". */
  expectedSeconds?: number;
  /** Mensagens por tempo decorrido (s): a última com `after` ≤ decorrido é exibida. */
  stages?: { after: number; label: string }[];
};

const mmss = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/**
 * Diálogo de progresso para operações longas (ex.: IA): spinner, cronômetro e etapa atual.
 * Não fecha pelo usuário — some quando a operação termina (`visible=false`).
 */
export default function ProgressDialog({ visible, title, message, expectedSeconds, stages = [] }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  const stage = [...stages].reverse().find((s) => elapsed >= s.after)?.label;
  const overdue = expectedSeconds !== undefined && elapsed > expectedSeconds;

  return (
    <OverlayPortal open={visible} onClose={() => {}} contentPadding={16}>
      <DialogPanel
        title={title}
        statusColor={color.brand}
        maxWidth={460}
        footer={
          <Text className="text-xs text-ink-subtle" style={{ flex: 1 }}>
            Não feche esta janela. Você poderá revisar tudo antes de incluir.
          </Text>
        }
      >
        <View className="flex-row items-center" style={{ gap: 16, paddingVertical: 4 }} aria-live="polite">
          <ActivityIndicator color={color.brand} size="large" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              className="font-mono font-semibold text-ink"
              style={{ fontSize: 28, lineHeight: 34 }}
              accessibilityLabel={`Tempo decorrido ${Math.floor(elapsed / 60)} minutos e ${elapsed % 60} segundos`}
            >
              {mmss(elapsed)}
            </Text>
            {stage ? <Text className="text-sm text-ink">{stage}</Text> : null}
          </View>
        </View>
        {message ? <Text className="text-sm text-ink-muted">{message}</Text> : null}
        {expectedSeconds !== undefined ? (
          <Text className={`text-xs ${overdue ? "text-warning" : "text-ink-subtle"}`}>
            {overdue
              ? "Está demorando mais que o normal. A IA ainda está trabalhando; aguarde mais um pouco."
              : `Costuma levar até ${expectedSeconds >= 60 ? `${Math.round(expectedSeconds / 60)} min` : `${expectedSeconds} s`}.`}
          </Text>
        ) : null}
      </DialogPanel>
    </OverlayPortal>
  );
}
