import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ExamPreviewPlayerQuestion } from "../../types/simulados";
import { hasAnswerKey } from "./examPreviewUtils";
import ConfirmModal from "../ui/ConfirmModal";
import {
  exportExamContentPdf,
  type ExamContentPdfMeta,
} from "../../utils/examContentPdf";

type Phase = "answering" | "results";

type Props = {
  questions: ExamPreviewPlayerQuestion[];
  loading?: boolean;
  /** Exibe gabarito e pontuação após finalizar o teste */
  gradeObjective?: boolean;
  emptyMessage?: string;
  header?: React.ReactNode;
  /** Metadados do simulado para o PDF */
  examMeta?: ExamContentPdfMeta | null;
};

const textAreaStyle = {
  width: "100%" as const,
  border: "1px solid #D9DDE3",
  borderRadius: 4,
  padding: "10px 14px",
  fontSize: 14,
  color: "var(--ds-ink)",
  backgroundColor: "var(--ds-surface-sunken)",
  resize: "vertical" as const,
  fontFamily: "inherit",
  outline: "none",
};

function AnswerTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  if (Platform.OS === "web") {
    return (
      <textarea
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={textAreaStyle}
      />
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="var(--ds-ink-subtle)"
      multiline
      numberOfLines={rows}
      className="rounded-ds-md border border-border bg-surface-sunken px-4 py-3 text-sm text-ink min-h-[96px]"
      textAlignVertical="top"
    />
  );
}

export default function ExamPreviewPlayer({
  questions,
  loading = false,
  gradeObjective = true,
  emptyMessage = "Nenhuma questão para testar.",
  header,
  examMeta = null,
}: Props) {
  const [phase, setPhase] = useState<Phase>("answering");
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [confirmUnansweredVisible, setConfirmUnansweredVisible] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const canGrade = gradeObjective && hasAnswerKey(questions);

  const resetTest = useCallback(() => {
    setPhase("answering");
    setSelected({});
    setTexts({});
    setBrokenImages({});
  }, []);

  const results = useMemo(() => {
    if (!canGrade) return null;

    let earned = 0;
    let maxObjective = 0;
    const perQuestion: Record<
      number,
      { status: "correct" | "wrong" | "unanswered" | "essay"; earned: number }
    > = {};

    questions.forEach((q) => {
      if (q.type === "essay") {
        perQuestion[q.id] = { status: "essay", earned: 0 };
        return;
      }

      maxObjective += q.points;
      const optionId = selected[q.id];
      if (optionId == null) {
        perQuestion[q.id] = { status: "unanswered", earned: 0 };
        return;
      }

      const opt = q.options.find((o) => o.id === optionId);
      if (opt?.is_correct) {
        earned += q.points;
        perQuestion[q.id] = { status: "correct", earned: q.points };
      } else {
        perQuestion[q.id] = { status: "wrong", earned: 0 };
      }
    });

    const percentage =
      maxObjective > 0 ? Math.round((earned / maxObjective) * 1000) / 10 : null;

    return { earned, maxObjective, percentage, perQuestion };
  }, [canGrade, questions, selected]);

  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      if (q.type === "essay") return (texts[q.id] ?? "").trim().length > 0;
      if (selected[q.id] != null) return true;
      return false;
    }).length;
  }, [questions, selected, texts]);

  const unansweredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (q.type === "essay") return (texts[q.id] ?? "").trim().length === 0;
      return selected[q.id] == null;
    });
  }, [questions, selected, texts]);

  const finalizeTest = useCallback(() => {
    setConfirmUnansweredVisible(false);
    setPhase("results");
  }, []);

  const handleFinalizePress = useCallback(() => {
    if (unansweredQuestions.length > 0) {
      setConfirmUnansweredVisible(true);
      return;
    }
    finalizeTest();
  }, [finalizeTest, unansweredQuestions.length]);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    if (Platform.OS !== "web") {
      Alert.alert("Exportação disponível apenas na versão web.");
      return;
    }
    setExportingPdf(true);
    try {
      const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
      await exportExamContentPdf(
        {
          title: examMeta?.title || "Simulado",
          exam_type_label: examMeta?.exam_type_label,
          exam_type: examMeta?.exam_type,
          status_label: examMeta?.status_label,
          status: examMeta?.status,
          duration_minutes: examMeta?.duration_minutes,
          passing_score: examMeta?.passing_score,
          total_points: examMeta?.total_points ?? totalPoints,
          courses: examMeta?.courses,
          subject: examMeta?.subject,
        },
        questions,
      );
    } catch {
      Alert.alert("Não foi possível gerar o PDF do simulado.");
    } finally {
      setExportingPdf(false);
    }
  }, [examMeta, exportingPdf, questions]);

  if (loading) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color="var(--ds-brand)" size="large" />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View className="py-12 items-center gap-2">
        <Ionicons name="help-circle-outline" size={32} color="var(--ds-border-strong)" />
        <Text className="text-sm text-ink-subtle text-center">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View>
      <View
        className="flex-row items-center gap-2 mb-4 px-4 py-3 rounded-ds-md"
        style={{ backgroundColor: phase === "results" ? "var(--ds-success-tint)" : "var(--ds-brand-tint)" }}
      >
        <Ionicons
          name={phase === "results" ? "checkmark-circle-outline" : "flask-outline"}
          size={18}
          color={phase === "results" ? "var(--ds-success)" : "var(--ds-brand)"}
        />
        <Text
          className="text-sm font-medium flex-1"
          style={{ color: phase === "results" ? "var(--ds-success)" : "var(--ds-brand-hover)" }}
        >
          {phase === "results"
            ? "Resultado do teste (simulação local — nada é salvo)"
            : "Modo teste — responda como o aluno para validar o simulado"}
        </Text>
      </View>

      {header}

      {phase === "results" && canGrade && results && (
        <View className="mb-5 p-4 rounded-ds-md border border-success bg-success-tint">
          <Text className="text-sm font-semibold text-emerald-900">Objetivas (simulado)</Text>
          <Text className="text-2xl font-semibold text-success mt-1">
            {results.earned.toFixed(1)} / {results.maxObjective.toFixed(1)} pts
            {results.percentage != null ? ` (${results.percentage}%)` : ""}
          </Text>
          <Text className="text-xs text-success mt-1">
            Questões discursivas não entram na nota automática.
          </Text>
        </View>
      )}

      {questions.map((q) => {
        const optionId = selected[q.id];
        const qResult = results?.perQuestion[q.id];
        const showGabarito = phase === "results" && canGrade;

        return (
          <View
            key={q.id}
            className="mb-5 rounded-ds-md border border-border overflow-hidden"
          >
            <View
              className="flex-row items-center justify-between px-5 py-3"
              style={{
                backgroundColor:
                  showGabarito && qResult?.status === "correct"
                    ? "var(--ds-success-tint)"
                    : showGabarito && qResult?.status === "wrong"
                      ? "var(--ds-danger-tint)"
                      : "var(--ds-brand-tint)",
              }}
            >
              <View className="flex-row items-center gap-2 flex-1">
                <View
                  className="items-center justify-center rounded-ds-md"
                  style={{ width: 28, height: 28, backgroundColor: "var(--ds-brand)" }}
                >
                  <Text className="text-xs font-medium text-on-brand">{q.order}</Text>
                </View>
                <Text className="text-xs font-semibold text-brand">
                  {q.type === "essay"
                    ? "Discursiva"
                    : q.options.some((o) => o.triggers_text_input)
                      ? 'Objetiva c/ "Outro"'
                      : "Objetiva"}
                </Text>
                {showGabarito && qResult?.status === "correct" && (
                  <Ionicons name="checkmark-circle" size={16} color="var(--ds-success)" />
                )}
                {showGabarito && qResult?.status === "wrong" && (
                  <Ionicons name="close-circle" size={16} color="var(--ds-danger)" />
                )}
                {showGabarito && qResult?.status === "unanswered" && (
                  <Text className="text-[10px] text-warning font-semibold">
                    Não assinalou a opção
                  </Text>
                )}
              </View>
              <Text className="text-xs text-brand font-semibold">
                {q.points} pt{q.points !== 1 ? "s" : ""}
              </Text>
            </View>

            <View className="px-5 py-4">
              <Text className="text-sm font-medium text-ink mb-4 leading-relaxed">
                {q.question_text || "[Enunciado em imagem]"}
              </Text>

              {q.image_url ? (
                <View className="mb-4 rounded-ds-md overflow-hidden border border-border bg-surface-sunken">
                  {!brokenImages[q.id] ? (
                    <Image
                      source={{ uri: q.image_url }}
                      style={{ width: "100%", height: 220, backgroundColor: "var(--ds-surface-sunken)" }}
                      resizeMode="contain"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [q.id]: true }))
                      }
                    />
                  ) : (
                    <View className="h-[220px] items-center justify-center bg-surface-sunken">
                      <Ionicons name="image-outline" size={28} color="var(--ds-ink-subtle)" />
                      <Text className="text-xs text-ink-subtle mt-2">
                        Não foi possível carregar a imagem
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {q.video_url ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(q.video_url!)}
                  className="flex-row items-center gap-2 mb-4 px-3 py-2 rounded-ds-md bg-surface border border-border-strong min-h-control-md"
                  activeOpacity={0.85}
                >
                  <Ionicons name="play-circle-outline" size={18} color="var(--ds-ink)" />
                  <Text className="text-xs font-semibold text-ink">Abrir vídeo do enunciado</Text>
                </TouchableOpacity>
              ) : null}

              {q.type === "multiple_choice" &&
                q.options.map((opt) => {
                  const isSelected = optionId === opt.id;
                  const isCorrect = opt.is_correct === true;
                  const showCorrect = showGabarito && isCorrect;
                  const showWrong = showGabarito && isSelected && !isCorrect;

                  let borderClass = "border-border bg-surface";
                  if (phase === "answering" && isSelected) {
                    borderClass = "border-brand bg-brand-tint";
                  } else if (showCorrect) {
                    borderClass = "border-emerald-400 bg-success-tint";
                  } else if (showWrong) {
                    borderClass = "border-danger bg-danger-tint";
                  }

                  return (
                    <TouchableOpacity
                      key={opt.id}
                      disabled={phase === "results"}
                      onPress={() => {
                        const newId = isSelected ? null : opt.id;
                        setSelected((prev) => ({ ...prev, [q.id]: newId }));
                        if (isSelected || !opt.triggers_text_input) {
                          setTexts((prev) => ({ ...prev, [q.id]: "" }));
                        }
                      }}
                      activeOpacity={phase === "results" ? 1 : 0.75}
                      className={`flex-row items-center gap-3 mb-2.5 px-4 py-3 rounded-ds-md border ${borderClass}`}
                    >
                      <View
                        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                          isSelected || showCorrect
                            ? showWrong
                              ? "border-danger"
                              : "border-brand"
                            : showCorrect
                              ? "border-emerald-500"
                              : "border-border-strong"
                        }`}
                      >
                        {(isSelected || showCorrect) && (
                          <View
                            className="rounded-full"
                            style={{
                              width: 10,
                              height: 10,
                              backgroundColor: showWrong
                                ? "var(--ds-danger)"
                                : showCorrect
                                  ? "var(--ds-success)"
                                  : "var(--ds-brand)",
                            }}
                          />
                        )}
                      </View>
                      <Text
                        className={`text-sm flex-1 ${
                          showWrong
                            ? "text-danger"
                            : showCorrect
                              ? "text-success font-medium"
                              : isSelected
                                ? "text-brand font-medium"
                                : "text-ink"
                        }`}
                      >
                        {opt.option_text}
                      </Text>
                      {showGabarito && isCorrect && (
                        <Text className="text-[10px] font-semibold text-success">Gabarito</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}

              {q.type === "essay" && (
                <AnswerTextArea
                  value={texts[q.id] ?? ""}
                  onChange={(v) => setTexts((prev) => ({ ...prev, [q.id]: v }))}
                  placeholder="Escreva sua resposta aqui..."
                  rows={5}
                />
              )}

              {q.type === "multiple_choice" &&
                optionId != null &&
                q.options.find((o) => o.id === optionId)?.triggers_text_input && (
                  <View className="mt-2">
                    <Text className="text-xs font-semibold text-ink-muted mb-2">Especifique:</Text>
                    <AnswerTextArea
                      value={texts[q.id] ?? ""}
                      onChange={(v) => setTexts((prev) => ({ ...prev, [q.id]: v }))}
                      placeholder="Especifique..."
                      rows={3}
                    />
                  </View>
                )}

              {phase === "results" && qResult?.status === "unanswered" && (
                <View className="mt-3 rounded-ds-md border border-warning bg-warning-tint px-3 py-2">
                  <Text className="text-xs text-warning font-semibold">
                    O aluno não assinalou a opção.
                  </Text>
                </View>
              )}

              {phase === "results" && q.type === "essay" && !(texts[q.id] ?? "").trim() && (
                <View className="mt-3 rounded-ds-md border border-warning bg-warning-tint px-3 py-2">
                  <Text className="text-xs text-warning font-semibold">
                    O aluno não respondeu esta questão.
                  </Text>
                </View>
              )}

              {phase === "results" && q.explanation?.trim() ? (
                <View className="mt-4 rounded-ds-md border border-border bg-brand-tint px-3 py-3">
                  <Text className="text-[10px] font-semibold text-brand uppercase mb-1">
                    Explicação / gabarito
                  </Text>
                  <Text className="text-xs text-brand leading-relaxed">{q.explanation}</Text>
                </View>
              ) : null}

              {phase === "results" && q.type === "essay" && (texts[q.id] ?? "").trim() ? (
                <View className="mt-3 rounded-ds-md border border-warning bg-warning-tint px-3 py-2">
                  <Text className="text-xs text-warning">
                    Discursiva: na versão do aluno, aguardaria correção manual.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      <View className="mt-2 flex-row flex-wrap gap-3 justify-center items-center">
        {phase === "answering" ? (
          <>
            <TouchableOpacity
              onPress={handleFinalizePress}
              className="px-6 rounded-ds-md bg-brand flex-row items-center gap-2 py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="var(--ds-on-brand)" />
              <Text className="text-sm font-medium text-on-brand">Finalizar teste</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExportPdf}
              disabled={exportingPdf}
              className="px-5 py-2 rounded-ds-md border border-border-strong bg-surface flex-row items-center gap-2 min-h-control-md"
              activeOpacity={0.85}
              style={{ opacity: exportingPdf ? 0.7 : 1 }}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="var(--ds-ink)" />
              ) : (
                <Ionicons name="download-outline" size={18} color="var(--ds-ink)" />
              )}
              <Text className="text-sm font-semibold text-ink">
                {exportingPdf ? "Gerando PDF..." : "Gerar PDF"}
              </Text>
            </TouchableOpacity>
            <Text className="text-xs text-ink-subtle self-center">
              {answeredCount}/{questions.length} respondida{answeredCount !== 1 ? "s" : ""}
            </Text>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={resetTest}
              className="px-6 py-2 rounded-ds-md border border-border-strong bg-surface flex-row items-center gap-2 min-h-control-md"
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={18} color="var(--ds-ink)" />
              <Text className="text-sm font-semibold text-ink">Testar novamente</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPhase("answering")}
              className="px-5 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md justify-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-ink">Revisar respostas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExportPdf}
              disabled={exportingPdf}
              className="px-5 py-2 rounded-ds-md border border-border-strong bg-surface flex-row items-center gap-2 min-h-control-md"
              activeOpacity={0.85}
              style={{ opacity: exportingPdf ? 0.7 : 1 }}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="var(--ds-ink)" />
              ) : (
                <Ionicons name="download-outline" size={18} color="var(--ds-ink)" />
              )}
              <Text className="text-sm font-semibold text-ink">
                {exportingPdf ? "Gerando PDF..." : "Gerar PDF"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ConfirmModal
        visible={confirmUnansweredVisible}
        title="Há perguntas sem resposta"
        message={
          unansweredQuestions.length === 1
            ? `A questão ${unansweredQuestions[0]?.order} está sem resposta. Deseja entregar o simulado mesmo assim?`
            : `Há ${unansweredQuestions.length} perguntas sem resposta (questões ${unansweredQuestions
                .map((q) => q.order)
                .join(", ")}). Deseja entregar o simulado mesmo assim?`
        }
        confirmLabel="Entregar mesmo assim"
        cancelLabel="Voltar e responder"
        tone="primary"
        iconName="help-circle-outline"
        onConfirm={finalizeTest}
        onCancel={() => setConfirmUnansweredVisible(false)}
      />
    </View>
  );
}
