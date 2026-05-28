import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import type { GradeDraftRow } from "../../types/avaliacoesOficiais";

type SubjectCol = { id: number; name: string };

type Props = {
  subjects: SubjectCol[];
  grades: GradeDraftRow[];
  isMobile: boolean;
};

function formatGradeCell(row: GradeDraftRow | undefined): { text: string; tone: "muted" | "absent" | "ok" } {
  if (!row) return { text: "—", tone: "muted" };
  if (row.is_absent) return { text: "Faltou", tone: "absent" };
  if (row.grade.trim()) return { text: row.grade.trim(), tone: "ok" };
  return { text: "—", tone: "muted" };
}

export default function OfficialAssessmentGradesTable({ subjects, grades, isMobile }: Props) {
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

  const gradeMap = useMemo(() => {
    const m = new Map<string, GradeDraftRow>();
    grades.forEach((g) => m.set(`${g.student_id}-${g.subject_id}`, g));
    return m;
  }, [grades]);

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [subjects]
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

  const nameFlex = isMobile ? 1.4 : 1.5;
  const matFlex = isMobile ? 0.9 : 0.85;
  const subjectFlex = 0.65;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={!isMobile} style={{ width: "100%" }}>
      <View style={{ minWidth: isMobile ? 520 : "100%", width: "100%" }}>
        <View className="flex-row bg-gray-100 border border-gray-200 rounded-t-xl px-3 py-2">
          <Text
            className="text-[11px] font-bold text-gray-600 uppercase"
            style={{ flex: nameFlex, paddingRight: 8 }}
          >
            Aluno
          </Text>
          <Text
            className="text-[11px] font-bold text-gray-600 uppercase"
            style={{ flex: matFlex, paddingRight: 8 }}
          >
            Matrícula
          </Text>
          {sortedSubjects.map((s) => (
            <Text
              key={s.id}
              className="text-[11px] font-bold text-gray-600 uppercase"
              style={{ flex: subjectFlex, textAlign: "center", paddingHorizontal: 4 }}
              numberOfLines={1}
            >
              {s.name}
            </Text>
          ))}
        </View>

        {students.map((student, i) => (
          <View
            key={student.student_id}
            className={`flex-row items-center px-3 py-2 border-x border-b border-gray-200 ${
              i === students.length - 1 ? "rounded-b-xl" : ""
            } ${i % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}
          >
            <Text
              className="text-xs font-semibold text-gray-800"
              style={{ flex: nameFlex, paddingRight: 8 }}
              numberOfLines={1}
            >
              {student.student_name}
            </Text>
            <Text
              className="text-xs text-gray-600"
              style={{ flex: matFlex, paddingRight: 8 }}
              numberOfLines={1}
            >
              {student.enrollment_number ?? "—"}
            </Text>
            {sortedSubjects.map((s) => {
              const cell = formatGradeCell(gradeMap.get(`${student.student_id}-${s.id}`));
              const color =
                cell.tone === "absent"
                  ? "#DC2626"
                  : cell.tone === "ok"
                    ? "#111827"
                    : "#9CA3AF";
              return (
                <Text
                  key={s.id}
                  className="text-xs font-semibold"
                  style={{ flex: subjectFlex, textAlign: "center", color }}
                  numberOfLines={1}
                >
                  {cell.text}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
