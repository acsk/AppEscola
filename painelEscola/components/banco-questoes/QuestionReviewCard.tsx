import React, { useState } from "react";
import { Text, View } from "react-native";
import { Check, RefreshCw } from "lucide-react-native";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { RevalidatedMark } from "./QuestionMarks";
import { color } from "../../constants/theme";
import type { QuestionReview, QuestionReviewStatus } from "../../types/questionAi";

const STATUS_LABEL: Record<QuestionReviewStatus, string> = {
  aprovada: "Aprovada pela IA",
  reprovada: "Reprovada",
  revisao_pendente: "Revisão pendente",
  aprovada_manual: "Aprovada manualmente",
};

const STATUS_COLOR: Record<QuestionReviewStatus, string> = {
  aprovada: color.success,
  reprovada: color.danger,
  revisao_pendente: color.warning,
  aprovada_manual: color.success,
};

/** Itens do histórico visíveis antes de "Ver histórico". */
const HISTORY_PREVIEW = 2;

const dateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

const historyLabel = (item: QuestionReview) =>
  item.status !== "aprovada_manual" && item.gabarito_original && item.gabarito_revisor && item.gabarito_original !== item.gabarito_revisor
    ? "Validação da IA: divergência no gabarito"
    : item.status === "aprovada_manual" ? STATUS_LABEL.aprovada_manual : `Validação da IA: ${STATUS_LABEL[item.status].toLowerCase()}`;

type Props = {
  review: QuestionReview | null;
  history?: QuestionReview[];
  /** Data da revalidação (questão liberada para resposta). */
  revalidatedAt?: string | null;
  busy?: boolean;
  onValidate?: () => void;
  onApprove?: () => void;
};

/** Cartão "Revisão pedagógica" da edição (protótipo "TelaEditarQuestao"): status, gabaritos, histórico e ações. */
export default function QuestionReviewCard({ review, history = [], revalidatedAt, busy = false, onValidate, onApprove }: Props) {
  const [showAll, setShowAll] = useState(false);
  const status = review?.status ?? null;
  const approved = !!review?.aprovada || status === "aprovada_manual";
  const items = showAll ? history : history.slice(0, HISTORY_PREVIEW);
  const matches = !!review?.gabarito_original && review.gabarito_original === review.gabarito_revisor;
  const diverges = !!review?.gabarito_original && !!review?.gabarito_revisor && !matches;
  const when = dateTime(review?.validated_at ?? revalidatedAt);

  return (
    <Panel
      title="Revisão pedagógica"
      footer={
        <View className="flex-row flex-wrap" style={{ gap: 8, flex: 1 }}>
          {onValidate ? <Button size="sm" icon={RefreshCw} label={review ? "Validar novamente" : "Validar com IA"} onPress={onValidate} loading={busy} disabled={busy} /> : null}
          {onApprove && !approved ? <Button size="sm" icon={Check} label="Aprovar manualmente" onPress={onApprove} disabled={busy} /> : null}
          {history.length > HISTORY_PREVIEW ? (
            <Button size="sm" variant="ghost" label={showAll ? "Ocultar histórico" : `Ver histórico (${history.length})`} onPress={() => setShowAll((v) => !v)} />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View className="flex-row items-start" style={{ gap: 12 }}>
          {revalidatedAt || approved ? (
            <RevalidatedMark iconOnly size={36} label="Revalidada" />
          ) : (
            <View aria-hidden className="rounded-ds-sm" style={{ width: 36, height: 36, backgroundColor: status ? STATUS_COLOR[status] : color["border-strong"] }} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-semibold" style={{ fontSize: 15, lineHeight: 22, color: revalidatedAt || approved ? color.success : status ? STATUS_COLOR[status] : color.ink }}>
              {revalidatedAt
                ? `Revalidada${status ? ` · ${STATUS_LABEL[status].toLowerCase()}` : ""}`
                : status ? STATUS_LABEL[status] : "Ainda não revisada"}
            </Text>
            <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
              {status
                ? when ? `em ${when.replace(" · ", " às ")}` : "Revisão registrada"
                : "A validação confere o gabarito e pede a outra IA que resolva sem ver a resposta."}
            </Text>
          </View>
        </View>

        {review ? (
          <View className="flex-row border border-border rounded-ds-md">
            <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>Gabarito da questão</Text>
              <Text className="font-mono font-semibold text-ink" style={{ fontSize: 15, lineHeight: 22 }}>{review.gabarito_original ?? "—"}</Text>
            </View>
            <View className="border-l border-border" style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>Gabarito do revisor</Text>
              <Text style={{ fontSize: 15, lineHeight: 22 }}>
                <Text className="font-mono font-semibold text-ink">{review.gabarito_revisor ?? "—"}</Text>
                {matches ? <Text className="text-success font-medium" style={{ fontSize: 12 }}>{"  "}confere</Text> : null}
                {diverges ? <Text className="text-danger font-medium" style={{ fontSize: 12 }}>{"  "}diverge</Text> : null}
              </Text>
            </View>
          </View>
        ) : null}

        {review && (review.problemas.length || review.explicacao) ? (
          <View style={{ gap: 4 }}>
            {review.problemas.map((problem, index) => (
              <Text key={`${problem.tipo}-${index}`} className={problem.gravidade === "alta" ? "text-danger" : "text-warning"} style={{ fontSize: 13, lineHeight: 18 }}>
                {problem.descricao}
              </Text>
            ))}
            {review.explicacao ? <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>{review.explicacao}</Text> : null}
          </View>
        ) : null}

        {items.length ? (
          <View>
            {items.map((item, i) => (
              <View key={item.id ?? `${item.validated_at}-${i}`} className="flex-row items-baseline" style={{ gap: 10, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, backgroundColor: i === 0 ? color.success : color["border-strong"], transform: [{ translateY: -1 }] }} />
                <Text className="text-ink-muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>{historyLabel(item)}</Text>
                <Text className="font-mono text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>{dateTime(item.validated_at)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Panel>
  );
}
