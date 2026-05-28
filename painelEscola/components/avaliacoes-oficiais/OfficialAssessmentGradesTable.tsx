import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GradeDraftRow } from "../../types/avaliacoesOficiais";

type SubjectCol = { id: number; name: string };

type Props = {
  subjects: SubjectCol[];
  grades: GradeDraftRow[];
  isMobile: boolean;
};

const COL_ALUNO = { flex: 2.5, minWidth: 180 };
const COL_MATRICULA = { flex: 1.1, minWidth: 120 };
const COL_SUBJECT = { flex: 1, minWidth: 96 };

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
  options?: { header?: boolean; center?: boolean; color?: string }
) {
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
        className={
          options?.header
            ? "text-[11px] font-bold text-gray-600 uppercase"
            : "text-xs font-semibold text-gray-800"
        }
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

export default function OfficialAssessmentGradesTable({ subjects, grades, isMobile }: Props) {
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

  const tableScrollMinWidth = useMemo(
    () =>
      COL_ALUNO.minWidth +
      COL_MATRICULA.minWidth +
      sortedSubjects.length * COL_SUBJECT.minWidth,
    [sortedSubjects.length]
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
            <View className="flex-row bg-gray-100 border-b border-gray-200 py-2" style={{ width: "100%" }}>
              {renderCell(COL_ALUNO.flex, COL_ALUNO.minWidth, "Aluno", { header: true })}
              {renderCell(COL_MATRICULA.flex, COL_MATRICULA.minWidth, "Matrícula", { header: true })}
              {sortedSubjects.map((s) =>
                renderCell(COL_SUBJECT.flex, COL_SUBJECT.minWidth, s.name, {
                  header: true,
                  center: true,
                })
              )}
            </View>

            {filteredStudents.map((student, i) => (
              <View
                key={student.student_id}
                className={`flex-row items-center border-b border-gray-200 py-2 ${
                  i % 2 === 1 ? "bg-slate-50/70" : "bg-white"
                }`}
                style={{ width: "100%" }}
              >
                {renderCell(COL_ALUNO.flex, COL_ALUNO.minWidth, student.student_name)}
                {renderCell(
                  COL_MATRICULA.flex,
                  COL_MATRICULA.minWidth,
                  student.enrollment_number ?? "—",
                  { color: "#4B5563" }
                )}
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
