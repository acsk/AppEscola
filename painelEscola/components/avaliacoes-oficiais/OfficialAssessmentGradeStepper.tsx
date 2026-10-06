import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GradeDraftRow } from "../../types/avaliacoesOficiais";

type SubjectCol = { id: number; name: string };

type StudentStep = {
  student_id: number;
  student_name: string;
  enrollment_number: string | null;
};

type Props = {
  subjects: SubjectCol[];
  grades: GradeDraftRow[];
  maxScore: string;
  readOnly: boolean;
  savingGrades?: boolean;
  canSaveGrades?: boolean;
  /** Apenas um aluno (lançamento individual); oculta navegação e barra da turma */
  focusStudentId?: number | null;
  onUpdateGrade: (studentId: number, subjectId: number, patch: Partial<GradeDraftRow>) => void;
  onSaveGrades?: () => void;
  hideSaveButton?: boolean;
};

function parseGrade(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function isStudentStepComplete(
  studentId: number,
  subjectIds: number[],
  gradeMap: Map<string, GradeDraftRow>
): boolean {
  return subjectIds.every((subjectId) => {
    const row = gradeMap.get(`${studentId}-${subjectId}`);
    if (!row) return false;
    if (row.is_absent) return true;
    return row.grade.trim() !== "";
  });
}

function studentIsAbsent(studentId: number, subjectIds: number[], gradeMap: Map<string, GradeDraftRow>): boolean {
  return subjectIds.every((subjectId) => !!gradeMap.get(`${studentId}-${subjectId}`)?.is_absent);
}

function sumStudentGrades(
  studentId: number,
  subjectIds: number[],
  gradeMap: Map<string, GradeDraftRow>
): number {
  let sum = 0;
  subjectIds.forEach((subjectId) => {
    const row = gradeMap.get(`${studentId}-${subjectId}`);
    if (!row || row.is_absent) return;
    const value = parseGrade(row.grade);
    if (value != null) sum += value;
  });
  return sum;
}

function PresenceButtons({
  isAbsent,
  disabled,
  onPresent,
  onAbsent,
  compact,
}: {
  isAbsent: boolean;
  disabled: boolean;
  onPresent: () => void;
  onAbsent: () => void;
  compact?: boolean;
}) {
  const py = compact ? "py-1.5" : "py-2.5";
  const iconSize = compact ? 16 : 18;
  return (
    <View className="flex-row gap-2">
      <TouchableOpacity
        onPress={onPresent}
        disabled={disabled}
        activeOpacity={0.85}
        className={`flex-1 flex-row items-center justify-center gap-1 ${py} rounded-ds-md border-2 ${
          !isAbsent ? "bg-success-tint border-emerald-500" : "bg-surface border-border"
        }`}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <Ionicons name="checkmark-circle" size={iconSize} color={!isAbsent ? "var(--ds-success)" : "var(--ds-ink-subtle)"} />
        <Text className={`text-xs font-semibold ${!isAbsent ? "text-success" : "text-ink-muted"}`}>
          Presente
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onAbsent}
        disabled={disabled}
        activeOpacity={0.85}
        className={`flex-1 flex-row items-center justify-center gap-1 ${py} rounded-ds-md border-2 ${
          isAbsent ? "bg-danger-tint border-danger" : "bg-surface border-border"
        }`}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <Ionicons name="close-circle" size={iconSize} color={isAbsent ? "var(--ds-danger)" : "var(--ds-ink-subtle)"} />
        <Text className={`text-xs font-semibold ${isAbsent ? "text-danger" : "text-ink-muted"}`}>Faltou</Text>
      </TouchableOpacity>
    </View>
  );
}

function SubjectGradeField({
  label,
  value,
  editable,
  onChangeText,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="flex-1 min-w-0">
      <Text className="text-[10px] font-semibold uppercase text-brand mb-1" numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="var(--ds-ink-subtle)"
        className="bg-surface border border-border rounded-ds-md px-3 text-sm font-semibold text-ink"
        style={{
          height: 40,
          opacity: editable ? 1 : 0.55,
        }}
      />
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
  focusStudentId = null,
  onUpdateGrade,
  onSaveGrades,
  hideSaveButton = false,
}: Props) {
  const singleMode = focusStudentId != null;
  const [stepIndex, setStepIndex] = useState(0);

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [subjects]
  );

  const subjectIds = useMemo(() => sortedSubjects.map((s) => s.id), [sortedSubjects]);

  const gradeMap = useMemo(() => {
    const m = new Map<string, GradeDraftRow>();
    grades.forEach((g) => m.set(`${g.student_id}-${g.subject_id}`, g));
    return m;
  }, [grades]);

  const steps = useMemo(() => {
    const studentMap = new Map<number, StudentStep>();
    grades.forEach((g) => {
      if (!studentMap.has(g.student_id)) {
        studentMap.set(g.student_id, {
          student_id: g.student_id,
          student_name: g.student_name,
          enrollment_number: g.enrollment_number,
        });
      }
    });
    const list = Array.from(studentMap.values()).sort((a, b) =>
      a.student_name.localeCompare(b.student_name, "pt-BR", { sensitivity: "base" })
    );
    if (focusStudentId != null) {
      return list.filter((s) => s.student_id === focusStudentId);
    }
    return list;
  }, [grades, focusStudentId]);

  const totalSteps = steps.length;
  const maxScoreNum = parseGrade(maxScore) ?? 10;

  useEffect(() => {
    setStepIndex(0);
  }, [totalSteps, steps.map((s) => s.student_id).join(",")]);

  useEffect(() => {
    if (stepIndex > totalSteps - 1) {
      setStepIndex(Math.max(0, totalSteps - 1));
    }
  }, [stepIndex, totalSteps]);

  const completedCount = useMemo(
    () => steps.filter((s) => isStudentStepComplete(s.student_id, subjectIds, gradeMap)).length,
    [steps, subjectIds, gradeMap]
  );

  const current = steps[stepIndex];
  const currentAbsent = current ? studentIsAbsent(current.student_id, subjectIds, gradeMap) : false;
  const currentTotal = current ? sumStudentGrades(current.student_id, subjectIds, gradeMap) : 0;
  const totalOverMax = currentTotal > maxScoreNum;
  const currentComplete = current
    ? isStudentStepComplete(current.student_id, subjectIds, gradeMap)
    : false;
  const progressPct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  const setStudentPresence = (studentId: number, absent: boolean) => {
    subjectIds.forEach((subjectId) => {
      onUpdateGrade(studentId, subjectId, absent ? { is_absent: true, grade: "" } : { is_absent: false });
    });
  };

  if (subjects.length === 0) {
    return (
      <Text className="text-sm text-ink-muted">
        Selecione ao menos uma disciplina na avaliação.
      </Text>
    );
  }

  if (totalSteps === 0) {
    return (
      <Text className="text-sm text-ink-muted">Selecione uma turma para carregar os alunos.</Text>
    );
  }

  return (
    <View>
      {!singleMode ? (
        <View className="rounded-ds-md bg-surface-sunken border border-border px-3 py-2 mb-3">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-semibold text-ink">
              Aluno {stepIndex + 1} de {totalSteps}
            </Text>
            <Text className="text-[11px] font-semibold text-brand">
              {completedCount}/{totalSteps} concluídos
            </Text>
          </View>
          <View className="h-1.5 rounded-full bg-border overflow-hidden">
            <View className="h-full rounded-full bg-brand" style={{ width: `${progressPct}%` }} />
          </View>
          <Text className="text-[10px] text-ink-muted mt-1">
            Todas as disciplinas na mesma tela • ordem alfabética
          </Text>
        </View>
      ) : null}

      {current ? (
        <>
          <View className="rounded-ds-md border-2 border-border bg-brand px-4 mb-3 py-2 min-h-control-md justify-center">
            <Text className="text-lg font-medium text-on-brand leading-tight" numberOfLines={2}>
              {current.student_name}
            </Text>
            {current.enrollment_number ? (
              <Text className="text-xs font-semibold text-brand-tint mt-0.5">
                Matrícula {current.enrollment_number}
              </Text>
            ) : null}
            {currentComplete ? (
              <View className="flex-row items-center gap-1 mt-1.5">
                <Ionicons name="checkmark-circle" size={14} color="var(--ds-success)" />
                <Text className="text-[11px] font-semibold text-emerald-100">
                  Lançamento completo
                </Text>
              </View>
            ) : null}
          </View>

          <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-2.5 mb-3">
            <View className="flex-row items-baseline justify-between gap-2 mb-2">
              <Text className="text-xs font-semibold text-ink">Presença na avaliação</Text>
              <View className="items-end">
                <Text className="text-[10px] font-semibold text-ink-muted uppercase">Nota total</Text>
                <Text
                  className={`text-sm font-semibold ${totalOverMax ? "text-danger" : "text-brand"}`}
                >
                  {currentAbsent ? "—" : currentTotal.toLocaleString("pt-BR")} / {maxScoreNum}
                </Text>
              </View>
            </View>
            <PresenceButtons
              isAbsent={currentAbsent}
              disabled={readOnly}
              compact
              onPresent={() => setStudentPresence(current.student_id, false)}
              onAbsent={() => setStudentPresence(current.student_id, true)}
            />
            {totalOverMax && !currentAbsent ? (
              <Text className="text-[11px] text-danger font-semibold mt-1.5">
                A soma das disciplinas não pode exceder {maxScoreNum}.
              </Text>
            ) : null}
            {!currentAbsent ? (
              <Text className="text-[10px] text-ink-muted mt-1.5">
                A nota máxima ({maxScoreNum}) vale para a soma de todas as disciplinas.
              </Text>
            ) : null}
          </View>

          <View className="flex-row gap-3 mb-3">
            {sortedSubjects.map((subject) => {
              const row = gradeMap.get(`${current.student_id}-${subject.id}`);
              return (
                <SubjectGradeField
                  key={subject.id}
                  label={subject.name}
                  value={row?.grade ?? ""}
                  editable={!currentAbsent && !readOnly}
                  onChangeText={(v) =>
                    onUpdateGrade(current.student_id, subject.id, { grade: v, is_absent: false })
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}

      {!singleMode && totalSteps > 1 ? (
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="flex-1 flex-row items-center justify-center gap-1 px-3 rounded-ds-md border border-border-strong bg-surface py-2 min-h-control-md"
            activeOpacity={0.85}
            style={{ opacity: stepIndex === 0 ? 0.45 : 1 }}
          >
            <Ionicons name="chevron-back" size={16} color="var(--ds-ink-muted)" />
            <Text className="text-xs font-semibold text-ink">Anterior</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStepIndex((i) => Math.min(totalSteps - 1, i + 1))}
            disabled={stepIndex >= totalSteps - 1}
            className="flex-1 flex-row items-center justify-center gap-1 px-3 rounded-ds-md bg-brand py-2 min-h-control-md"
            activeOpacity={0.85}
            style={{ opacity: stepIndex >= totalSteps - 1 ? 0.45 : 1 }}
          >
            <Text className="text-xs font-medium text-on-brand">Próximo</Text>
            <Ionicons name="chevron-forward" size={16} color="var(--ds-on-brand)" />
          </TouchableOpacity>
        </View>
      ) : null}

      {!hideSaveButton && onSaveGrades ? (
        <TouchableOpacity
          onPress={onSaveGrades}
          disabled={!canSaveGrades || savingGrades || readOnly}
          className="self-start mt-3 px-4 rounded-ds-md bg-brand flex-row items-center gap-2 py-2 min-h-control-md justify-center"
          activeOpacity={0.85}
          style={{ opacity: !canSaveGrades || savingGrades || readOnly ? 0.6 : 1 }}
        >
          {savingGrades ? <ActivityIndicator size="small" color="var(--ds-on-brand)" /> : null}
          <Ionicons name="save-outline" size={14} color="var(--ds-on-brand)" />
          <Text className="text-xs font-medium text-on-brand">
            {savingGrades ? "Salvando..." : "Salvar todas as notas"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
