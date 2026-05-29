import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import type { OfficialAssessmentListItem } from "../../types/avaliacoesOficiais";

export type OfficialAssessmentActionKey = "open" | "delete";

type ActionDef = {
  key: OfficialAssessmentActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "violet" | "red";
  group: "main" | "danger";
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  assessment: OfficialAssessmentListItem | null;
  kindLabel: (kind: string) => string;
  statusLabel: (status: string) => string;
  onClose: () => void;
  onSelect: (action: OfficialAssessmentActionKey) => void;
};

const toneStyles: Record<ActionDef["tone"], { bg: string; icon: string }> = {
  violet: { bg: "bg-violet-50", icon: "#7C3AED" },
  red: { bg: "bg-red-50", icon: "#EF4444" },
};

export default function OfficialAssessmentActionsModal({
  visible,
  assessment,
  kindLabel,
  statusLabel,
  onClose,
  onSelect,
}: Props) {
  if (!assessment) return null;

  const isPublished = assessment.status === "published";
  const actions: ActionDef[] = [
    {
      key: "open",
      label: isPublished ? "Ver avaliação" : "Abrir / lançar notas",
      description: assessment.school_class?.name ?? undefined,
      icon: isPublished ? "eye-outline" : "create-outline",
      tone: "violet",
      group: "main",
    },
    {
      key: "delete",
      label: "Excluir avaliação",
      description: isPublished
        ? "Avaliações publicadas não podem ser removidas"
        : "Remove o rascunho e as notas lançadas",
      icon: "trash-outline",
      tone: "red",
      group: "danger",
      disabled: isPublished,
    },
  ];

  const groups = [
    { key: "main", title: "Ações", items: actions.filter((a) => a.group === "main") },
    { key: "danger", title: "Zona de risco", items: actions.filter((a) => a.group === "danger") },
  ];

  return (
    <Modal visible={visible} title="Ações da avaliação" onClose={onClose} size="md">
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 mb-3">
        <Text className="text-sm font-bold text-gray-900" numberOfLines={2}>
          {assessment.title}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {assessment.school_class?.name ?? "—"} · {kindLabel(assessment.kind)}
        </Text>
        <View className="mt-2 self-start">
          <Badge
            slug={assessment.status}
            label={statusLabel(assessment.status)}
          />
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
                const disabled = action.disabled;
                return (
                  <TouchableOpacity
                    key={action.key}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(action.key);
                      onClose();
                    }}
                    disabled={disabled}
                    className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-red-100 bg-white"
                        : "border-gray-100 bg-white"
                    }`}
                    style={{ opacity: disabled ? 0.45 : 1 }}
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
                    {!disabled ? (
                      <Ionicons name="chevron-forward-outline" size={16} color="#9CA3AF" />
                    ) : null}
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
