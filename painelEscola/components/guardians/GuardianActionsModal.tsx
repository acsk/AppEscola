import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import { maskCPF } from "../../utils/masks";
import type { GuardianListItem } from "../../types/guardians";

export type GuardianActionKey = "view_students" | "edit" | "delete";

type ActionItem = {
  key: GuardianActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "violet" | "red";
  group: "main" | "danger";
};

type Props = {
  visible: boolean;
  guardian: GuardianListItem | null;
  onClose: () => void;
  onSelect: (action: GuardianActionKey) => void;
};

const toneStyles: Record<ActionItem["tone"], { bg: string; icon: string }> = {
  blue: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  violet: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  red: { bg: "bg-danger", icon: "var(--ds-on-danger)" },
};

export default function GuardianActionsModal({
  visible,
  guardian,
  onClose,
  onSelect,
}: Props) {
  if (!guardian) return null;

  const count = guardian.students_count ?? 0;
  const actions: ActionItem[] = [
    {
      key: "view_students",
      label: "Ver alunos associados",
      description:
        count === 0
          ? "Nenhum aluno vinculado"
          : `${count} aluno${count === 1 ? "" : "s"} vinculado${count === 1 ? "" : "s"}`,
      icon: "school-outline",
      tone: "blue",
      group: "main",
    },
    {
      key: "edit",
      label: "Editar responsável",
      description: "Alterar nome, contato e parentesco",
      icon: "pencil-outline",
      tone: "violet",
      group: "main",
    },
    {
      key: "delete",
      label: "Excluir responsável",
      description: "Remover cadastro do sistema",
      icon: "trash-outline",
      tone: "red",
      group: "danger",
    },
  ];

  const groups = [
    { key: "main", title: "Opções", items: actions.filter((a) => a.group === "main") },
    {
      key: "danger",
      title: "Zona de risco",
      items: actions.filter((a) => a.group === "danger"),
    },
  ];

  return (
    <Modal visible={visible} title="Ações" onClose={onClose} size="sm">
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
          {guardian.name}
        </Text>
        {guardian.document ? (
          <Text className="text-xs text-ink-muted mt-0.5">
            {maskCPF(guardian.document)}
          </Text>
        ) : null}
        {guardian.email ? (
          <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
            {guardian.email}
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        {groups.map((group) => (
          <View key={group.key}>
            <Text className="text-[10px] uppercase font-semibold text-ink-muted tracking-wide mb-1">
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
                    className={`flex-row items-center gap-2.5 rounded-ds-md border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-danger bg-danger-tint"
                        : "border-border bg-surface"
                    }`}
                    activeOpacity={0.85}
                  >
                    <View
                      className={`w-9 h-9 rounded-ds-md items-center justify-center ${style.bg}`}
                    >
                      <Ionicons name={action.icon} size={17} color={style.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${action.group === "danger" ? "text-danger" : "text-ink"}`} numberOfLines={1}>
                        {action.label}
                      </Text>
                      {action.description ? (
                        <Text className="text-[11px] text-ink-muted mt-0.5" numberOfLines={2}>
                          {action.description}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward-outline" size={16} color="var(--ds-ink-subtle)" />
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
