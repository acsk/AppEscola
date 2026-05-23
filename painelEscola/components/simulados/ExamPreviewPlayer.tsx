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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ExamPreviewPlayerQuestion } from "../../types/simulados";
import { hasAnswerKey } from "./examPreviewUtils";

type Phase = "answering" | "results";

type Props = {
  questions: ExamPreviewPlayerQuestion[];
  loading?: boolean;
  /** Exibe gabarito e pontuação após finalizar o teste */
  gradeObjective?: boolean;
  emptyMessage?: string;
  header?: React.ReactNode;
};

const textAreaStyle = {
  width: "100%" as const,
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 14,
  color: "#1F2937",
  backgroundColor: "#F9FAFB",
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
      placeholderTextColor="#9CA3AF"
      multiline
      numberOfLines={rows}
      className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 min-h-[96px]"
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
}: Props) {
  const [phase, setPhase] = useState<Phase>("answering");
  const [selected, setSelected] = useState<Record<number, number | null>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

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

  if (loading) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View className="py-12 items-center gap-2">
        <Ionicons name="help-circle-outline" size={32} color="#D1D5DB" />
        <Text className="text-sm text-gray-400 text-center">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View>
      <View
        className="flex-row items-center gap-2 mb-4 px-4 py-3 rounded-xl"
        style={{ backgroundColor: phase === "results" ? "#ECFDF5" : "#EFF6FF" }}
      >
        <Ionicons
          name={phase === "results" ? "checkmark-circle-outline" : "flask-outline"}
          size={18}
          color={phase === "results" ? "#059669" : "#3B82F6"}
        />
        <Text
          className="text-sm font-medium flex-1"
          style={{ color: phase === "results" ? "#047857" : "#1D4ED8" }}
        >
          {phase === "results"
            ? "Resultado do teste (simulação local — nada é salvo)"
            : "Modo teste — responda como o aluno para validar o simulado"}
        </Text>
      </View>

      {header}

      {phase === "results" && canGrade && results && (
        <View className="mb-5 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
          <Text className="text-sm font-bold text-emerald-900">Objetivas (simulado)</Text>
          <Text className="text-2xl font-bold text-emerald-800 mt-1">
            {results.earned.toFixed(1)} / {results.maxObjective.toFixed(1)} pts
            {results.percentage != null ? ` (${results.percentage}%)` : ""}
          </Text>
          <Text className="text-xs text-emerald-700 mt-1">
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
            className="mb-5 rounded-2xl border border-gray-100 overflow-hidden"
          >
            <View
              className="flex-row items-center justify-between px-5 py-3"
              style={{
                backgroundColor:
                  showGabarito && qResult?.status === "correct"
                    ? "#ECFDF5"
                    : showGabarito && qResult?.status === "wrong"
                      ? "#FEF2F2"
                      : "#F5F3FF",
              }}
            >
              <View className="flex-row items-center gap-2 flex-1">
                <View
                  className="items-center justify-center rounded-lg"
                  style={{ width: 28, height: 28, backgroundColor: "#7C3AED" }}
                >
                  <Text className="text-xs font-bold text-white">{q.order}</Text>
                </View>
                <Text className="text-xs font-semibold text-violet-700">
                  {q.type === "essay"
                    ? "Discursiva"
                    : q.options.some((o) => o.triggers_text_input)
                      ? 'Objetiva c/ "Outro"'
                      : "Objetiva"}
                </Text>
                {showGabarito && qResult?.status === "correct" && (
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                )}
                {showGabarito && qResult?.status === "wrong" && (
                  <Ionicons name="close-circle" size={16} color="#DC2626" />
                )}
                {showGabarito && qResult?.status === "unanswered" && (
                  <Text className="text-[10px] text-amber-700 font-semibold">Sem resposta</Text>
                )}
              </View>
              <Text className="text-xs text-violet-600 font-semibold">
                {q.points} pt{q.points !== 1 ? "s" : ""}
              </Text>
            </View>

            <View className="px-5 py-4">
              <Text className="text-sm font-medium text-gray-800 mb-4 leading-relaxed">
                {q.question_text || "[Enunciado em imagem]"}
              </Text>

              {q.image_url ? (
                <View className="mb-4 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  {!brokenImages[q.id] ? (
                    <Image
                      source={{ uri: q.image_url }}
                      style={{ width: "100%", height: 220, backgroundColor: "#F3F4F6" }}
                      resizeMode="contain"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [q.id]: true }))
                      }
                    />
                  ) : (
                    <View className="h-[220px] items-center justify-center bg-gray-100">
                      <Ionicons name="image-outline" size={28} color="#9CA3AF" />
                      <Text className="text-xs text-gray-400 mt-2">
                        Não foi possível carregar a imagem
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {q.video_url ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(q.video_url!)}
                  className="flex-row items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100"
                  activeOpacity={0.85}
                >
                  <Ionicons name="play-circle-outline" size={18} color="#2563EB" />
                  <Text className="text-xs font-semibold text-blue-700">Abrir vídeo do enunciado</Text>
                </TouchableOpacity>
              ) : null}

              {q.type === "multiple_choice" &&
                q.options.map((opt) => {
                  const isSelected = optionId === opt.id;
                  const isCorrect = opt.is_correct === true;
                  const showCorrect = showGabarito && isCorrect;
                  const showWrong = showGabarito && isSelected && !isCorrect;

                  let borderClass = "border-gray-200 bg-white";
                  if (phase === "answering" && isSelected) {
                    borderClass = "border-violet-400 bg-violet-50";
                  } else if (showCorrect) {
                    borderClass = "border-emerald-400 bg-emerald-50";
                  } else if (showWrong) {
                    borderClass = "border-red-300 bg-red-50";
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
                      className={`flex-row items-center gap-3 mb-2.5 px-4 py-3 rounded-xl border ${borderClass}`}
                    >
                      <View
                        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                          isSelected || showCorrect
                            ? showWrong
                              ? "border-red-500"
                              : "border-violet-500"
                            : showCorrect
                              ? "border-emerald-500"
                              : "border-gray-300"
                        }`}
                      >
                        {(isSelected || showCorrect) && (
                          <View
                            className="rounded-full"
                            style={{
                              width: 10,
                              height: 10,
                              backgroundColor: showWrong
                                ? "#EF4444"
                                : showCorrect
                                  ? "#10B981"
                                  : "#7C3AED",
                            }}
                          />
                        )}
                      </View>
                      <Text
                        className={`text-sm flex-1 ${
                          showWrong
                            ? "text-red-800"
                            : showCorrect
                              ? "text-emerald-800 font-medium"
                              : isSelected
                                ? "text-violet-800 font-medium"
                                : "text-gray-700"
                        }`}
                      >
                        {opt.option_text}
                      </Text>
                      {showGabarito && isCorrect && (
                        <Text className="text-[10px] font-bold text-emerald-700">Gabarito</Text>
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
                    <Text className="text-xs font-semibold text-gray-500 mb-2">Especifique:</Text>
                    <AnswerTextArea
                      value={texts[q.id] ?? ""}
                      onChange={(v) => setTexts((prev) => ({ ...prev, [q.id]: v }))}
                      placeholder="Especifique..."
                      rows={3}
                    />
                  </View>
                )}

              {phase === "results" && q.explanation?.trim() ? (
                <View className="mt-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                  <Text className="text-[10px] font-bold text-violet-700 uppercase mb-1">
                    Explicação / gabarito
                  </Text>
                  <Text className="text-xs text-violet-900 leading-relaxed">{q.explanation}</Text>
                </View>
              ) : null}

              {phase === "results" && q.type === "essay" && (
                <View className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                  <Text className="text-xs text-amber-800">
                    Discursiva: na versão do aluno, aguardaria correção manual.
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <View className="mt-2 flex-row flex-wrap gap-3 justify-center">
        {phase === "answering" ? (
          <>
            <TouchableOpacity
              onPress={() => setPhase("results")}
              className="px-6 py-3 rounded-xl bg-violet-600 flex-row items-center gap-2"
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
              <Text className="text-sm font-bold text-white">Finalizar teste</Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-400 self-center">
              {answeredCount}/{questions.length} respondida{answeredCount !== 1 ? "s" : ""}
            </Text>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={resetTest}
              className="px-6 py-3 rounded-xl border border-violet-200 bg-violet-50 flex-row items-center gap-2"
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={18} color="#7C3AED" />
              <Text className="text-sm font-bold text-violet-700">Testar novamente</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPhase("answering")}
              className="px-5 py-3 rounded-xl border border-gray-200 bg-white"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-gray-700">Revisar respostas</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
