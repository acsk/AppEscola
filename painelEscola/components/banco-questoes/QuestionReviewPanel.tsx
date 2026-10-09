import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Check, RefreshCw, Sparkles } from "lucide-react-native";
import Button from "../ui/Button";
import type { QuestionReview, QuestionReviewStatus } from "../../types/questionAi";

const STATUS_LABEL: Record<QuestionReviewStatus, string> = {
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  revisao_pendente: "Revisão pendente",
  aprovada_manual: "Aprovada manualmente",
};

const STATUS_CLASS: Record<QuestionReviewStatus, string> = {
  aprovada: "text-success",
  reprovada: "text-danger",
  revisao_pendente: "text-warning",
  aprovada_manual: "text-success",
};

type Props = {
  review: QuestionReview | null;
  history?: QuestionReview[];
  busy?: boolean;
  canCorrect?: boolean;
  onValidate?: () => void;
  onCorrect?: () => void;
  onApprove?: () => void;
};

/** Resultado da revisão pedagógica: gabaritos, problemas e ações. */
export default function QuestionReviewPanel({ review, history = [], busy = false, canCorrect = true, onValidate, onCorrect, onApprove }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const status = review?.status ?? null;

  return (
    <View className="border border-border rounded-ds-md bg-surface-sunken" style={{ padding: 12, gap: 8, marginBottom: 12 }}>
      <Text className="text-sm font-semibold text-ink">Revisão pedagógica</Text>
      {review && status ? (
        <View style={{ gap: 4 }}>
          <Text className={`text-sm font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</Text>
          <Text className="text-xs text-ink-muted">
            Gabarito da questão: {review.gabarito_original ?? "—"} · Gabarito do revisor: {review.gabarito_revisor ?? "—"}
          </Text>
          {review.explicacao ? <Text className="text-xs text-ink-muted">{review.explicacao}</Text> : null}
          {review.problemas.map((problem, index) => (
            <Text key={`${problem.tipo}-${index}`} className={problem.gravidade === "alta" ? "text-xs text-danger" : "text-xs text-warning"}>
              {problem.descricao}
            </Text>
          ))}
          {review.attempts ? (
            <Text className="text-xs text-ink-subtle">Tentativas de correção: {review.attempts}</Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-xs text-ink-muted">
          A questão ainda não foi revisada. A validação confere o gabarito localmente e pede a outra IA que resolva sem ver a resposta.
        </Text>
      )}
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {onValidate ? <Button variant="ai" icon={RefreshCw} label="Validar novamente" onPress={onValidate} loading={busy} disabled={busy} /> : null}
        {onCorrect && canCorrect ? <Button variant="ai" icon={Sparkles} label="Corrigir com IA" onPress={onCorrect} disabled={busy || !review || review.aprovada} /> : null}
        {onApprove ? <Button icon={Check} label="Aprovar manualmente" onPress={onApprove} disabled={busy || review?.status === "aprovada" || review?.status === "aprovada_manual"} /> : null}
      </View>
      {history.length > 1 ? (
        <View>
          <TouchableOpacity onPress={() => setShowHistory((open) => !open)} accessibilityRole="button">
            <Text className="text-xs font-medium text-brand">{showHistory ? "Ocultar histórico" : `Histórico (${history.length})`}</Text>
          </TouchableOpacity>
          {showHistory ? history.map((item) => (
            <Text key={item.id ?? item.validated_at} className="text-xs text-ink-muted">
              {STATUS_LABEL[item.status]} · gabarito {item.gabarito_original ?? "—"} / revisor {item.gabarito_revisor ?? "—"}
              {item.validated_at ? ` · ${new Date(item.validated_at).toLocaleString("pt-BR")}` : ""}
            </Text>
          )) : null}
        </View>
      ) : null}
    </View>
  );
}
