import React from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import type { GuardianDetail, GuardianStudentLink } from "../../types/guardians";

const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

type Props = {
  visible: boolean;
  guardian: GuardianDetail | null;
  loading: boolean;
  onClose: () => void;
};

function StudentFlags({ student }: { student: GuardianStudentLink }) {
  const flags: string[] = [];
  if (student.pivot?.is_financial_responsible) flags.push("Financeiro");
  if (student.pivot?.is_pedagogical_responsible) flags.push("Pedagógico");
  if (student.pivot?.can_access_portal) flags.push("Portal");
  if (flags.length === 0) return null;
  return (
    <Text className="text-[10px] text-ink-muted mt-0.5">{flags.join(" · ")}</Text>
  );
}

export default function GuardianStudentsModal({
  visible,
  guardian,
  loading,
  onClose,
}: Props) {
  const students = guardian?.students ?? [];

  return (
    <Modal
      visible={visible}
      title="Alunos associados"
      onClose={onClose}
      size="md"
      headerContent={
        guardian ? (
          <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
            {guardian.name}
          </Text>
        ) : null
      }
    >
      {loading ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator size="large" color="var(--ds-brand)" />
        </View>
      ) : students.length === 0 ? (
        <View className="items-center py-12 px-4">
          <Ionicons name="school-outline" size={40} color="var(--ds-border)" />
          <Text className="text-ink-subtle text-sm mt-3 text-center">
            Nenhum aluno vinculado a este responsável
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator>
          {students.map((student, index) => (
            <View
              key={student.id}
              className={`px-1 py-3 ${
                index < students.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-sm font-semibold text-ink flex-1">
                  {student.name}
                </Text>
                {student.status ? (
                  <Badge
                    label={
                      STUDENT_STATUS_LABELS[student.status] ?? student.status
                    }
                    slug={student.status}
                  />
                ) : null}
              </View>
              {student.enrollment_number ? (
                <Text className="text-xs text-ink-muted mt-0.5">
                  Matrícula: {student.enrollment_number}
                </Text>
              ) : null}
              <StudentFlags student={student} />
            </View>
          ))}
        </ScrollView>
      )}
    </Modal>
  );
}
