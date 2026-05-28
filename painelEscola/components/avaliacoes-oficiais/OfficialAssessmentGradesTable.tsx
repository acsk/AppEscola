import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GradeDraftRow } from "../../types/avaliacoesOficiais";
import {
  tableBodyRowClass,
  TABLE_CELL,
  TABLE_CELL_ENROLLMENT,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
} from "../ui/dataTableStyles";

type SubjectCol = { id: number; name: string };

type Props = {
  subjects: SubjectCol[];
  grades: GradeDraftRow[];
  isMobile: boolean;
  maxScore?: string;
  readOnly?: boolean;
  onLaunchIndividual?: (studentId: number) => void;
};

const COL_MATRICULA = { flex: 1, minWidth: 112 };
const COL_ALUNO = { flex: 2.5, minWidth: 180 };
const COL_SUBJECT = { flex: 1, minWidth: 96 };
const COL_TOTAL = { flex: 0.85, minWidth: 72 };
const COL_ACTION = { width: 52 };

function parseGrade(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function computeStudentTotal(
  studentId: number,
  subjectIds: number[],
  gradeMap: Map<string, GradeDraftRow>
): { text: string; tone: "muted" | "absent" | "ok"; sum: number | null } {
  if (subjectIds.length === 0) return { text: "—", tone: "muted", sum: null };

  const allAbsent = subjectIds.every((id) => gradeMap.get(`${studentId}-${id}`)?.is_absent);
  if (allAbsent) return { text: "Faltou", tone: "absent", sum: null };

  let sum = 0;
  let hasGrade = false;
  subjectIds.forEach((id) => {
    const row = gradeMap.get(`${studentId}-${id}`);
    if (!row || row.is_absent) return;
    const value = parseGrade(row.grade);
    if (value != null) {
      sum += value;
      hasGrade = true;
    }
  });

  if (!hasGrade) return { text: "—", tone: "muted", sum: null };
  const text = sum.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return { text, tone: "ok", sum };
}

function formatGradeCell(row: GradeDraftRow | undefined): { text: string; tone: "muted" | "absent" | "ok" } {
  if (!row) return { text: "—", tone: "muted" };
  if (row.is_absent) return { text: "Faltou", tone: "absent" };
  if (row.grade.trim()) return { text: row.grade.trim(), tone: "ok" };
  return { text: "—", tone: "muted" };
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function renderCell(
  flex: number,
  minWidth: number,
  content: string,
  options?: {
    header?: boolean;
    center?: boolean;
    color?: string;
    enrollment?: boolean;
    semibold?: boolean;
  }
) {
  const bodyClass = options?.header
    ? TABLE_HEADER_CELL
    : options?.enrollment
      ? TABLE_CELL_ENROLLMENT
      : options?.semibold
        ? TABLE_CELL_SEMIBOLD
        : TABLE_CELL;

  return (
    <View
      style={{
        flex,
        minWidth,
        paddingHorizontal: 12,
        justifyContent: "center",
        alignItems: options?.center ? "center" : "flex-start",
      }}
    >
      <Text
        numberOfLines={1}
        className={options?.header ? TABLE_HEADER_CELL : bodyClass}
        style={{
          textAlign: options?.center ? "center" : "left",
          width: "100%",
          color: options?.color,
        }}
      >
        {content}
      </Text>
    </View>
  );
}

export default function OfficialAssessmentGradesTable({
  subjects,
  grades,
  isMobile,
  maxScore,
  readOnly = false,
  onLaunchIndividual,
}: Props) {
  const showActions = !!onLaunchIndividual && !readOnly;
  const maxScoreNum = parseGrade(maxScore ?? "") ?? null;
  const [search, setSearch] = useState("");

  const students = useMemo(() => {
    const map = new Map<
      number,
      { student_id: number; student_name: string; enrollment_number: string | null }
    >();
    grades.forEach((g) => {
      if (!map.has(g.student_id)) {
        map.set(g.student_id, {
          student_id: g.student_id,
          student_name: g.student_name,
          enrollment_number: g.enrollment_number,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.student_name.localeCompare(b.student_name, "pt-BR", { sensitivity: "base" })
    );
  }, [grades]);

  const filteredStudents = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return students;
    return students.filter((s) => {
      const name = s.student_name.toLowerCase();
      const mat = (s.enrollment_number ?? "").toLowerCase();
      return name.includes(q) || mat.includes(q);
    });
  }, [students, search]);

  const gradeMap = useMemo(() => {
    const m = new Map<string, GradeDraftRow>();
    grades.forEach((g) => m.set(`${g.student_id}-${g.subject_id}`, g));
    return m;
  }, [grades]);

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [subjects]
  );

  const subjectIds = useMemo(() => sortedSubjects.map((s) => s.id), [sortedSubjects]);

  const tableScrollMinWidth = useMemo(
    () =>
      COL_ALUNO.minWidth +
      COL_MATRICULA.minWidth +
      sortedSubjects.length * COL_SUBJECT.minWidth +
      COL_TOTAL.minWidth +
      (showActions ? COL_ACTION.width : 0),
    [sortedSubjects.length, showActions]
  );

  if (subjects.length === 0) {
    return (
      <Text className="text-sm text-gray-500">
        Selecione ao menos uma disciplina para visualizar a grade de notas.
      </Text>
    );
  }

  if (students.length === 0) {
    return (
      <Text className="text-sm text-gray-500">Selecione uma turma para carregar os alunos.</Text>
    );
  }

  return (
    <View style={{ width: "100%" }}>
      <View
        className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 mb-3"
        style={{ height: 44, maxWidth: isMobile ? undefined : 360 }}
      >
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <input
          placeholder="Filtrar por aluno ou matrícula..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            color: "#374151",
            marginLeft: 8,
            backgroundColor: "transparent",
          }}
        />
        {search.trim() ? (
          <TouchableOpacity onPress={() => setSearch("")} activeOpacity={0.8}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {filteredStudents.length === 0 ? (
        <Text className="text-sm text-gray-500 py-4 text-center">
          Nenhum aluno encontrado para &quot;{search.trim()}&quot;.
        </Text>
      ) : (
        <ScrollView
          horizontal={isMobile}
          showsHorizontalScrollIndicator={isMobile}
          style={{ width: "100%" }}
          contentContainerStyle={{
            width: isMobile ? undefined : "100%",
            minWidth: isMobile ? tableScrollMinWidth : "100%",
          }}
        >
          <View
            className="border border-gray-200 rounded-xl overflow-hidden"
            style={{ width: "100%", minWidth: isMobile ? tableScrollMinWidth : undefined }}
          >
            <View className={TABLE_HEADER_ROW} style={{ width: "100%" }}>
              {renderCell(COL_MATRICULA.flex, COL_MATRICULA.minWidth, "Matrícula", { header: true })}
              {renderCell(COL_ALUNO.flex, COL_ALUNO.minWidth, "Aluno", { header: true })}
              {sortedSubjects.map((s) =>
                renderCell(COL_SUBJECT.flex, COL_SUBJECT.minWidth, s.name, {
                  header: true,
                  center: true,
                })
              )}
              {renderCell(COL_TOTAL.flex, COL_TOTAL.minWidth, "Total", {
                header: true,
                center: true,
              })}
              {showActions ? (
                <View
                  style={{
                    width: COL_ACTION.width,
                    minWidth: COL_ACTION.width,
                    paddingHorizontal: 8,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text className={TABLE_HEADER_CELL}>Ação</Text>
                </View>
              ) : null}
            </View>

            {filteredStudents.map((student, i) => (
              <View
                key={student.student_id}
                className={tableBodyRowClass(i)}
                style={{ width: "100%" }}
              >
                {renderCell(
                  COL_MATRICULA.flex,
                  COL_MATRICULA.minWidth,
                  student.enrollment_number ?? "—",
                  { enrollment: true }
                )}
                {renderCell(COL_ALUNO.flex, COL_ALUNO.minWidth, student.student_name, {
                  semibold: true,
                })}
                {sortedSubjects.map((s) => {
                  const cell = formatGradeCell(gradeMap.get(`${student.student_id}-${s.id}`));
                  const color =
                    cell.tone === "absent"
                      ? "#DC2626"
                      : cell.tone === "ok"
                        ? "#111827"
                        : "#9CA3AF";
                  return renderCell(COL_SUBJECT.flex, COL_SUBJECT.minWidth, cell.text, {
                    center: true,
                    color,
                  });
                })}
                {(() => {
                  const total = computeStudentTotal(student.student_id, subjectIds, gradeMap);
                  const overMax =
                    maxScoreNum != null && total.sum != null && total.sum > maxScoreNum;
                  const totalColor =
                    total.tone === "absent"
                      ? "#DC2626"
                      : overMax
                        ? "#DC2626"
                        : total.tone === "ok"
                          ? "#7C3AED"
                          : "#9CA3AF";
                  return renderCell(COL_TOTAL.flex, COL_TOTAL.minWidth, total.text, {
                    center: true,
                    color: totalColor,
                  });
                })()}
                {showActions ? (
                  <View
                    style={{
                      width: COL_ACTION.width,
                      minWidth: COL_ACTION.width,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => onLaunchIndividual!(student.student_id)}
                      className="p-1.5 rounded-lg bg-violet-50 border border-violet-200"
                      activeOpacity={0.85}
                      accessibilityLabel={`Lançar notas de ${student.student_name}`}
                    >
                      <Ionicons name="create-outline" size={16} color="#7C3AED" />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {search.trim() && filteredStudents.length > 0 ? (
        <Text className="text-xs text-gray-500 mt-2">
          Exibindo {filteredStudents.length} de {students.length} aluno
          {students.length !== 1 ? "s" : ""}
        </Text>
      ) : null}
    </View>
  );
}
