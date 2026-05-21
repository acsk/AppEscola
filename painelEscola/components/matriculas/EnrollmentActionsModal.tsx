import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import type { EnrollmentSummary } from "../../types/matriculas";

export type EnrollmentActionKey = "view" | "detail" | "edit" | "delete";

type ActionItem = {
  key: EnrollmentActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "violet" | "red";
  group: "main" | "danger";
};

type Props = {
  visible: boolean;
  enrollment: EnrollmentSummary | null;
  onClose: () => void;
  onSelect: (action: EnrollmentActionKey) => void;
};

const toneStyles: Record<ActionItem["tone"], { bg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", icon: "#2563EB" },
  violet: { bg: "bg-violet-50", icon: "#7C3AED" },
  red: { bg: "bg-red-50", icon: "#EF4444" },
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  cancelled: "Cancelado",
  concluded: "Concluído",
};

function fmtMoney(v: string | null | undefined) {
  if (!v) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EnrollmentActionsModal({
  visible,
  enrollment,
  onClose,
  onSelect,
}: Props) {
  if (!enrollment) return null;

  const actions: ActionItem[] = [
    {
      key: "detail",
      label: "Abrir matrícula",
      description: "Ver cobranças, contrato e histórico",
      icon: "open-outline",
      tone: "blue",
      group: "main",
    },
    {
      key: "view",
      label: "Resumo rápido",
      description: "Dados principais sem sair da lista",
      icon: "eye-outline",
      tone: "blue",
      group: "main",
    },
    {
      key: "edit",
      label: "Editar matrícula",
      icon: "pencil-outline",
      tone: "violet",
      group: "main",
    },
    {
      key: "delete",
      label: "Excluir matrícula",
      description: "Remove a matrícula e cobranças locais",
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
    <Modal visible={visible} title="Ações da matrícula" onClose={onClose} size="md">
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 mb-3">
        <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
          {enrollment.student?.name ?? "Aluno"}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
          {enrollment.enrollment_number ?? "—"}
          {enrollment.school_class?.name ? ` · ${enrollment.school_class.name}` : ""}
        </Text>
        <View className="flex-row flex-wrap gap-2 mt-2">
          <View className="rounded-md bg-white border border-gray-100 px-2 py-1">
            <Text className="text-[10px] uppercase font-semibold text-gray-500">Mensalidade</Text>
            <Text className="text-[11px] font-bold text-gray-800">
              {fmtMoney(enrollment.monthly_amount)}
            </Text>
          </View>
          <View className="rounded-md bg-white border border-gray-100 px-2 py-1">
            <Text className="text-[10px] uppercase font-semibold text-gray-500">Status</Text>
            <Text className="text-[11px] font-bold text-gray-800">
              {STATUS_LABELS[enrollment.status] ?? enrollment.status}
            </Text>
          </View>
        </View>
      </View>

      <View className="gap-2">
        {groups.map((group) => (
          <View key={group.key}>
            <Text className="text-[10px] uppercase font-bold text-gray-500 tracking-wide mb-1">
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
                        <Text className="text-[11px] text-gray-500 mt-0.5">{action.description}</Text>
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
