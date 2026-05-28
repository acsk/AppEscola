import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import { maskCPF } from "../../utils/masks";

export type StudentActionKey =
  | "edit"
  | "boletim"
  | "performance"
  | "approve"
  | "delete";

export type StudentActionItem = {
  id: number;
  name: string;
  enrollment_number?: string | null;
  email?: string | null;
  document?: string | null;
  status: string;
};

type ActionDef = {
  key: StudentActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "violet" | "emerald" | "red";
  group: "main" | "danger";
};

type Props = {
  visible: boolean;
  student: StudentActionItem | null;
  onClose: () => void;
  onSelect: (action: StudentActionKey) => void;
  /** Oculta "Editar" quando já está na tela de cadastro */
  hideEdit?: boolean;
  statusLabel?: (status: string) => string;
};

const toneStyles: Record<ActionDef["tone"], { bg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", icon: "#2563EB" },
  violet: { bg: "bg-violet-50", icon: "#7C3AED" },
  emerald: { bg: "bg-emerald-50", icon: "#059669" },
  red: { bg: "bg-red-50", icon: "#EF4444" },
};

export default function StudentActionsModal({
  visible,
  student,
  onClose,
  onSelect,
  hideEdit = false,
  statusLabel = (s) => s,
}: Props) {
  if (!student) return null;

  const actions: ActionDef[] = [
    ...(!hideEdit
      ? [
          {
            key: "edit" as const,
            label: "Editar aluno",
            description: "Cadastro, responsáveis e foto",
            icon: "pencil-outline" as const,
            tone: "violet" as const,
            group: "main" as const,
          },
        ]
      : []),
    {
      key: "boletim",
      label: "Boletim",
      description: "Avaliações presenciais publicadas",
      icon: "ribbon-outline",
      tone: "violet",
      group: "main",
    },
    {
      key: "performance",
      label: "Aproveitamento",
      description: "Desempenho em simulados",
      icon: "stats-chart-outline",
      tone: "blue",
      group: "main",
    },
    ...(student.status === "inactive"
      ? [
          {
            key: "approve" as const,
            label: "Aprovar cadastro",
            description: "Ativa o aluno no sistema",
            icon: "checkmark-circle-outline" as const,
            tone: "emerald" as const,
            group: "main" as const,
          },
        ]
      : []),
    {
      key: "delete",
      label: "Excluir aluno",
      description: "Remove o cadastro permanentemente",
      icon: "trash-outline",
      tone: "red",
      group: "danger",
    },
  ];

  const groups = [
    { key: "main", title: "Ações", items: actions.filter((a) => a.group === "main") },
    { key: "danger", title: "Zona de risco", items: actions.filter((a) => a.group === "danger") },
  ];

  return (
    <Modal visible={visible} title="Ações do aluno" onClose={onClose} size="md">
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 mb-3">
        <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
          {student.name}
        </Text>
        {student.enrollment_number ? (
          <Text className="text-xs font-mono font-semibold text-violet-600 mt-0.5">
            Matrícula {student.enrollment_number}
          </Text>
        ) : null}
        {student.document ? (
          <Text className="text-xs text-gray-500 mt-0.5">{maskCPF(student.document)}</Text>
        ) : null}
        {student.email ? (
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {student.email}
          </Text>
        ) : null}
        <View className="mt-2 self-start">
          <Badge slug={student.status} label={statusLabel(student.status)} />
        </View>
      </View>

      <View className="gap-2">
        {groups.map((group) => (
          <View key={group.key}>
            <Text className="text-xs uppercase font-bold text-gray-500 tracking-wide mb-1">
              {group.title}
            </Text>
            <View className="gap-1.5">
              {group.items.map((action) => {
                const style = toneStyles[action.tone];
                return (
                  <TouchableOpacity
                    key={action.key}
                    onPress={() => {
                      onSelect(action.key);
                      onClose();
                    }}
                    className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-red-100 bg-white"
                        : "border-gray-100 bg-white"
                    }`}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-lg items-center justify-center ${style.bg}`}>
                      <Ionicons name={action.icon} size={17} color={style.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900">{action.label}</Text>
                      {action.description ? (
                        <Text className="text-xs text-gray-500 mt-0.5">{action.description}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward-outline" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Modal>
  );
}
