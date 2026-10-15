import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { ExternalLink, Plus, X } from "lucide-react-native";
import { OfficialBadge, reporterDetail } from "./QuestionMarks";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import RichText from "../ui/RichText";
import { fetchQuestionBankQuestion } from "../../services/questionBank";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { isoToDisplay } from "../../utils/masks";
import { color } from "../../constants/theme";
import type { QuestionBankQuestion } from "../../types/questionBank";

type Props = {
  /** Linha da lista: mostrada já, enquanto a questão completa (alternativas) carrega. */
  question: QuestionBankQuestion;
  onClose: () => void;
  onOpenFull: (id: number) => void;
  onEdit: (id: number) => void;
  onOpenExam: (examId: number) => void;
  onAddToSet: (id: number) => void;
};

const LETTERS = "ABCDEFGHIJ";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 16 }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, lineHeight: 18, width: 92 }}>
        {label}
      </Text>
      <Text className="text-ink" style={{ fontSize: 13, lineHeight: 18, flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: typeof X; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      aria-label={label}
      className="rounded-ds-sm items-center justify-center"
      style={{ width: 28, height: 28 }}
    >
      <Icon icon={icon} color={color["ink-subtle"]} />
    </TouchableOpacity>
  );
}

/** Pré-visualização lateral da questão (lista à esquerda, questão à direita). */
export default function QuestionPreviewPanel({ question, onClose, onOpenFull, onEdit, onOpenExam, onAddToSet }: Props) {
  const [full, setFull] = useState<QuestionBankQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFull(null);
    setError(null);
    fetchQuestionBankQuestion(question.id)
      .then((q) => !cancelled && setFull(q))
      .catch((err) => !cancelled && setError(getApiErrorMessage(err, "Não foi possível carregar a questão.")));
    return () => {
      cancelled = true;
    };
  }, [question.id]);

  const q = full ?? question;
  const official = !!q.exam;
  const path = q.subject ? [q.subject.name, q.topics.map((t) => t.name).join(", ")].filter(Boolean).join(" › ") : "Sem disciplina";
  const options = [...(full?.options ?? [])].sort((a, b) => a.order - b.order);
  const situation = [
    q.is_annulled ? "Anulada" : q.is_outdated ? "Desatualizada" : "Regular",
    q.revalidated_at ? `revalidada em ${isoToDisplay(q.revalidated_at.slice(0, 10))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      role="complementary"
      aria-label={`Pré-visualização da questão ${q.id}`}
      className="bg-surface border border-border rounded-ds-md"
      style={Platform.OS === "web" ? ({ position: "sticky", top: 16 } as object) : undefined}
    >
      <View className="flex-row items-center border-b border-border" style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
        <Text className="font-mono font-medium text-ink" style={{ fontSize: 14 }}>
          #{q.id}
        </Text>
        {official ? (
          <OfficialBadge label="Simulado oficial · bloqueada" title={`Questão do simulado oficial "${q.exam!.title}": edição bloqueada.`} />
        ) : (
          <Badge label="Avulsa" tone="neutral" />
        )}
        <View className="flex-row" style={{ marginLeft: "auto", gap: 2 }}>
          <IconButton icon={ExternalLink} label="Abrir em página inteira" onPress={() => onOpenFull(q.id)} />
          <IconButton icon={X} label="Fechar pré-visualização" onPress={onClose} />
        </View>
      </View>

      <View style={{ padding: 16 }}>
        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16, marginBottom: 8 }} numberOfLines={2}>
          {path}
        </Text>
        {q.question_text ? (
          <RichText value={q.question_text} className="text-ink" style={{ fontSize: 15, lineHeight: 24, marginBottom: 12 }} />
        ) : null}
        {q.image_url ? (
          <Image
            source={{ uri: q.image_url }}
            accessibilityLabel="Imagem do enunciado"
            resizeMode="contain"
            style={{ width: "100%", height: 180, marginBottom: 12 }}
          />
        ) : null}

        {!full && !error ? (
          <View className="py-4 items-center">
            <ActivityIndicator color={color.brand} />
          </View>
        ) : error ? (
          <Text className="text-sm text-danger" style={{ marginBottom: 8 }}>
            {error}
          </Text>
        ) : q.type === "essay" ? (
          <Text className="text-sm text-ink-muted">Questão dissertativa (sem alternativas).</Text>
        ) : (
          <View style={{ gap: 4 }} role="list">
            {options.map((option, i) => (
              <View
                key={option.id}
                role="listitem"
                className={`flex-row rounded-ds-md border ${option.is_correct ? "border-success bg-success-tint" : "border-border"}`}
                style={{ gap: 8, paddingVertical: 7, paddingHorizontal: 10, alignItems: "baseline" }}
              >
                <Text className={`font-mono font-semibold ${option.is_correct ? "text-success" : "text-ink-muted"}`} style={{ fontSize: 13, width: 14 }}>
                  {LETTERS[i] ?? i + 1}
                </Text>
                <RichText value={option.option_text} className="text-ink" style={{ fontSize: 14, lineHeight: 20, flex: 1 }} />
                {option.is_correct ? (
                  <Text className="text-success font-medium" style={{ fontSize: 12 }}>
                    Gabarito
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 16, gap: 8 }}>
          <Fact label="Origem" value={q.exam ? q.exam.title : q.source_exam_name || "Avulsa"} />
          <Fact label="Dificuldade" value={q.difficulty?.name ?? "Não classificada"} />
          <Fact
            label="Taxa de erro"
            value={q.answer_count ? `${q.error_rate ?? 0}% em ${q.answer_count} ${q.answer_count === 1 ? "resposta" : "respostas"}` : "Ainda sem respostas"}
          />
          <Fact label="Banca · ano" value={[q.board?.name, q.year].filter(Boolean).join(" · ") || "—"} />
          <Fact label="Situação" value={situation} />
          {(q.issue_reporters ?? []).length > 0 ? (
            <Fact
              label="Revisão"
              value={(q.issue_reporters ?? []).map((reporter) => [reporterDetail(reporter), reporter.note].filter(Boolean).join(" — ")).join("\n")}
            />
          ) : null}
        </View>
      </View>

      <View className="flex-row flex-wrap border-t border-border bg-surface-sunken" style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
        {official ? (
          <>
            <Button size="sm" variant="primary" label="Abrir simulado" onPress={() => onOpenExam(q.exam!.id)} />
            <Button size="sm" label="Classificar" onPress={() => onOpenFull(q.id)} />
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" icon={Plus} label="Adicionar a simulado" onPress={() => onAddToSet(q.id)} />
            <Button size="sm" label="Editar" onPress={() => onEdit(q.id)} />
          </>
        )}
      </View>
    </View>
  );
}
