import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FormInput from "../ui/FormInput";
import type { GradeDraftRow } from "../../types/avaliacoesOficiais";

type SubjectCol = { id: number; name: string };

type GradeStep = {
  student_id: number;
  subject_id: number;
  student_name: string;
  subject_name: string;
  enrollment_number: string | null;
};

type Props = {
  subjects: SubjectCol[];
  grades: GradeDraftRow[];
  maxScore: string;
  readOnly: boolean;
  savingGrades?: boolean;
  canSaveGrades?: boolean;
  loadingReportStudentId?: number | null;
  onUpdateGrade: (studentId: number, subjectId: number, patch: Partial<GradeDraftRow>) => void;
  onOpenReportCard?: (studentId: number) => void;
  onSaveGrades?: () => void;
  /** Ocultar botão salvar (rodapé da modal cuida do save) */
  hideSaveButton?: boolean;
};

function isRowComplete(row: GradeDraftRow | undefined): boolean {
  if (!row) return false;
  if (row.is_absent) return true;
  return row.grade.trim() !== "";
}

function PresenceButtons({
  isAbsent,
  disabled,
  onPresent,
  onAbsent,
}: {
  isAbsent: boolean;
  disabled: boolean;
  onPresent: () => void;
  onAbsent: () => void;
}) {
  return (
    <View className="flex-row gap-2 mt-1">
      <TouchableOpacity
        onPress={onPresent}
        disabled={disabled}
        activeOpacity={0.85}
        className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 ${
          !isAbsent ? "bg-emerald-50 border-emerald-500" : "bg-white border-gray-200"
        }`}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <Ionicons name="checkmark-circle" size={18} color={!isAbsent ? "#059669" : "#9CA3AF"} />
        <Text className={`text-sm font-bold ${!isAbsent ? "text-emerald-700" : "text-gray-500"}`}>
          Presente
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onAbsent}
        disabled={disabled}
        activeOpacity={0.85}
        className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 ${
          isAbsent ? "bg-red-50 border-red-500" : "bg-white border-gray-200"
        }`}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <Ionicons name="close-circle" size={18} color={isAbsent ? "#DC2626" : "#9CA3AF"} />
        <Text className={`text-sm font-bold ${isAbsent ? "text-red-700" : "text-gray-500"}`}>
          Faltou
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function OfficialAssessmentGradeStepper({
  subjects,
  grades,
  maxScore,
  readOnly,
  savingGrades = false,
  canSaveGrades = true,
  loadingReportStudentId = null,
  onUpdateGrade,
  onOpenReportCard,
  onSaveGrades,
  hideSaveButton = false,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const gradeMap = useMemo(() => {
    const m = new Map<string, GradeDraftRow>();
    grades.forEach((g) => m.set(`${g.student_id}-${g.subject_id}`, g));
    return m;
  }, [grades]);

  const steps = useMemo(() => {
    const sortedSubjects = [...subjects].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
    const studentMap = new Map<number, { student_name: string; enrollment_number: string | null }>();
    grades.forEach((g) => {
      if (!studentMap.has(g.student_id)) {
        studentMap.set(g.student_id, {
          student_name: g.student_name,
          enrollment_number: g.enrollment_number,
        });
      }
    });
    const sortedStudents = Array.from(studentMap.entries()).sort((a, b) =>
      a[1].student_name.localeCompare(b[1].student_name, "pt-BR", { sensitivity: "base" })
    );

    const list: GradeStep[] = [];
    sortedSubjects.forEach((subject) => {
      sortedStudents.forEach(([studentId, student]) => {
        list.push({
          student_id: studentId,
          subject_id: subject.id,
          student_name: student.student_name,
          subject_name: subject.name,
          enrollment_number: student.enrollment_number,
        });
      });
    });
    return list;
  }, [subjects, grades]);

  const totalSteps = steps.length;

  useEffect(() => {
    setStepIndex(0);
  }, [totalSteps, steps.map((s) => `${s.student_id}-${s.subject_id}`).join(",")]);

  useEffect(() => {
    if (stepIndex > totalSteps - 1) {
      setStepIndex(Math.max(0, totalSteps - 1));
    }
  }, [stepIndex, totalSteps]);

  const completedCount = useMemo(
    () => steps.filter((s) => isRowComplete(gradeMap.get(`${s.student_id}-${s.subject_id}`))).length,
    [steps, gradeMap]
  );

  const current = steps[stepIndex];
  const currentRow = current ? gradeMap.get(`${current.student_id}-${current.subject_id}`) : undefined;
  const progressPct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  if (subjects.length === 0) {
    return (
      <Text className="text-sm text-gray-500">
        Selecione ao menos uma disciplina na avaliação.
      </Text>
    );
  }

  if (totalSteps === 0) {
    return (
      <Text className="text-sm text-gray-500">Selecione uma turma para carregar os alunos.</Text>
    );
  }

  const currentComplete = isRowComplete(currentRow);

  return (
    <View>
      <View className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-semibold text-gray-800">
            Passo {stepIndex + 1} de {totalSteps}
          </Text>
          <Text className="text-xs font-semibold text-violet-700">
            {completedCount}/{totalSteps} lançados
          </Text>
        </View>
        <View className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <View className="h-full rounded-full bg-violet-600" style={{ width: `${progressPct}%` }} />
        </View>
        <Text className="text-xs text-gray-500 mt-2">
          Por disciplina, alunos em ordem alfabética
        </Text>
      </View>

      {current ? (
        <>
          <View className="rounded-xl border border-violet-200 bg-violet-50 p-3 mb-3">
            <Text className="text-xs font-bold uppercase text-violet-700">Disciplina</Text>
            <Text className="text-base font-bold text-violet-900 mt-0.5">{current.subject_name}</Text>
          </View>

          <View className="rounded-2xl border border-gray-200 bg-white p-4 mb-4">
            <Text className="text-lg font-bold text-gray-900" numberOfLines={2}>
              {current.student_name}
            </Text>
            {current.enrollment_number ? (
              <Text className="text-xs font-semibold text-gray-500 mt-1">
                Matrícula {current.enrollment_number}
              </Text>
            ) : null}
            {onOpenReportCard ? (
              <TouchableOpacity
                onPress={() => onOpenReportCard(current.student_id)}
                disabled={loadingReportStudentId === current.student_id}
                className="self-start mt-2 flex-row items-center gap-1"
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={14} color="#7C3AED" />
                <Text className="text-xs font-semibold text-violet-700">
                  {loadingReportStudentId === current.student_id
                    ? "Carregando boletim..."
                    : "Ver boletim do aluno"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {currentComplete ? (
              <View className="flex-row items-center gap-1 mt-2">
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text className="text-xs font-semibold text-emerald-700">Lançamento deste passo completo</Text>
              </View>
            ) : null}
          </View>

          <View className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-4">
            <FormInput
              label={`Nota (máx. ${maxScore || "10"})`}
              value={currentRow?.grade ?? ""}
              onChangeText={(v) =>
                onUpdateGrade(current.student_id, current.subject_id, { grade: v })
              }
              editable={!currentRow?.is_absent && !readOnly}
              keyboardType="numeric"
              dense
            />
            <Text className="text-xs font-semibold text-gray-600 mb-1 mt-2">Presença</Text>
            <PresenceButtons
              isAbsent={!!currentRow?.is_absent}
              disabled={readOnly}
              onPresent={() =>
                onUpdateGrade(current.student_id, current.subject_id, { is_absent: false })
              }
              onAbsent={() =>
                onUpdateGrade(current.student_id, current.subject_id, {
                  is_absent: true,
                  grade: "",
                })
              }
            />
          </View>
        </>
      ) : null}

      <View className="flex-row flex-wrap gap-2 mb-2">
        <TouchableOpacity
          onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={stepIndex === 0}
          className="flex-1 min-w-[120px] flex-row items-center justify-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
          activeOpacity={0.85}
          style={{ opacity: stepIndex === 0 ? 0.45 : 1 }}
        >
          <Ionicons name="chevron-back" size={18} color="#4B5563" />
          <Text className="text-sm font-semibold text-gray-700">Anterior</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setStepIndex((i) => Math.min(totalSteps - 1, i + 1))}
          disabled={stepIndex >= totalSteps - 1}
          className="flex-1 min-w-[120px] flex-row items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-violet-600"
          activeOpacity={0.85}
          style={{ opacity: stepIndex >= totalSteps - 1 ? 0.45 : 1 }}
        >
          <Text className="text-sm font-bold text-white">Próximo</Text>
          <Ionicons name="chevron-forward" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {!hideSaveButton && onSaveGrades ? (
        <TouchableOpacity
          onPress={onSaveGrades}
          disabled={!canSaveGrades || savingGrades || readOnly}
          className="self-start px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
          activeOpacity={0.85}
          style={{ opacity: !canSaveGrades || savingGrades || readOnly ? 0.6 : 1 }}
        >
          {savingGrades ? <ActivityIndicator size="small" color="white" /> : null}
          <Ionicons name="save-outline" size={16} color="white" />
          <Text className="text-sm font-bold text-white">
            {savingGrades ? "Salvando notas..." : "Salvar todas as notas"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
