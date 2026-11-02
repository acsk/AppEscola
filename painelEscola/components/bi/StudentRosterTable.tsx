import React from "react";
import { ScrollView, Text, View } from "react-native";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { fmtNumber } from "./format";
import type { BiStudentRow } from "../../services/biService";

type Props = {
  students: BiStudentRow[];
  goal: number;
  /** Mostra a coluna de turmas (lista geral; no detalhe da turma é redundante). */
  showClasses?: boolean;
  /** Ação principal da linha (ex.: abrir a evolução do aluno). */
  action: { label: string; onPress: (studentId: number) => void };
  ariaLabel: string;
};

const REASON_TONE = { below_goal: "danger", declining: "danger", low_attendance: "warning" } as const;

const sampled = (cell: { value: number | null; n: number }, goal: number) =>
  cell.value === null ? (cell.n ? `— (n=${cell.n})` : "—") : `${fmtNumber(cell.value, 0)}%${cell.value < goal ? " ▾" : ""}`;

/** Alunos com médias por modalidade, banco, frequência, evolução e motivos de atenção; "—" quando falta amostra. */
export default function StudentRosterTable({ students, goal, showClasses = false, action, ariaLabel }: Props) {
  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
      <View style={{ minWidth: showClasses ? 1120 : 980, width: "100%" }} role="table" aria-label={ariaLabel}>
        <View className="flex-row bg-surface-sunken border-b border-border" role="row" style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
          <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, flex: 1, minWidth: 160 }}>Aluno</Text>
          {showClasses ? <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width: 128 }}>Turma</Text> : null}
          {["Online", "Presencial", "Banco", "Frequência", "Evolução"].map((label) => (
            <Text key={label} role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width: 84, textAlign: "right" }}>{label}</Text>
          ))}
          <Text role="columnheader" className="font-medium text-ink-muted" style={{ fontSize: 12, width: 220 }}>Atenção</Text>
          <View style={{ width: 132 }} />
        </View>
        {students.map((s, i) => (
          <View
            key={s.student_id}
            role="row"
            className={`flex-row items-center ${i < students.length - 1 ? "border-b border-border" : ""}`}
            style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}
          >
            <Text className="text-ink" style={{ fontSize: 14, flex: 1, minWidth: 160 }} numberOfLines={1}>{s.name}</Text>
            {showClasses ? (
              <Text className="text-ink-muted" style={{ fontSize: 12, width: 128 }} numberOfLines={1}>{s.classes.join(", ") || "—"}</Text>
            ) : null}
            {[s.online, s.presencial, s.practice, s.attendance].map((cell, k) => (
              <Text key={k} className={`font-mono ${cell.value === null ? "text-ink-subtle" : "text-ink"}`} style={{ fontSize: 12, width: 84, textAlign: "right" }}>
                {sampled(cell, goal)}
              </Text>
            ))}
            <Text
              className={`font-mono ${s.evolution_pp === null ? "text-ink-subtle" : s.evolution_pp < 0 ? "text-danger" : "text-success"}`}
              style={{ fontSize: 12, width: 84, textAlign: "right" }}
            >
              {s.evolution_pp === null ? "—" : `${s.evolution_pp < 0 ? "▼ −" : "▲ +"}${fmtNumber(Math.abs(s.evolution_pp), 1)} pp`}
            </Text>
            <View style={{ width: 220, gap: 4 }}>
              {s.reasons.length ? (
                s.reasons.map((r) => <Badge key={r.code} label={r.label} tone={REASON_TONE[r.code]} dot />)
              ) : (
                <Text className="text-ink-subtle" style={{ fontSize: 12 }}>—</Text>
              )}
            </View>
            <View style={{ width: 132, alignItems: "flex-end" }}>
              <Button size="sm" label={action.label} onPress={() => action.onPress(s.student_id)} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
