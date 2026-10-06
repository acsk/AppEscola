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
  violet: { bg: "bg-brand-tint", icon: "#1C3D63" },
  red: { bg: "bg-danger-tint", icon: "#B0261B" },
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
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
          {assessment.title}
        </Text>
        <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
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
            <Text className="text-xs uppercase font-semibold text-ink-muted tracking-wide mb-1">
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
                    className={`flex-row items-center gap-2.5 rounded-ds-md border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-danger bg-surface"
                        : "border-border bg-surface"
                    }`}
                    style={{ opacity: disabled ? 0.45 : 1 }}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-ds-md items-center justify-center ${style.bg}`}>
                      <Ionicons name={action.icon} size={17} color={style.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{action.label}</Text>
                      {action.description ? (
                        <Text className="text-xs text-ink-muted mt-0.5">{action.description}</Text>
                      ) : null}
                    </View>
                    {!disabled ? (
                      <Ionicons name="chevron-forward-outline" size={16} color="#5F6878" />
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
