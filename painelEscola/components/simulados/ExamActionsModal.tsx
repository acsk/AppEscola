import React from "react";
import { ActivityIndicator, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import type { ExamListItem } from "../../types/simulados";
import type { ExamDeliveryPdfKind } from "../../utils/examDeliveryPdf";

export type ExamActionKey =
  | "preview"
  | "edit"
  | "export_delivery_pdf_pending"
  | "export_delivery_pdf_delivered"
  | "export_delivery_pdf_completed"
  | "export_delivery_pdf_pending_review"
  | "export_delivery_pdf_awaiting_release"
  | "delete";

type ActionDef = {
  key: ExamActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "violet" | "emerald" | "amber" | "red";
  group: "main" | "reports" | "danger";
  disabled?: boolean;
  exporting?: boolean;
};

type Props = {
  visible: boolean;
  exam: ExamListItem | null;
  exportingPdfKind?: ExamDeliveryPdfKind | null;
  onClose: () => void;
  onSelect: (action: ExamActionKey) => void;
};

const toneStyles: Record<ActionDef["tone"], { bg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", icon: "#3B82F6" },
  violet: { bg: "bg-violet-50", icon: "#7C3AED" },
  emerald: { bg: "bg-emerald-50", icon: "#059669" },
  amber: { bg: "bg-amber-50", icon: "#D97706" },
  red: { bg: "bg-red-50", icon: "#EF4444" },
};

const PDF_ACTION_KIND: Partial<Record<ExamActionKey, ExamDeliveryPdfKind>> = {
  export_delivery_pdf_pending: "pending",
  export_delivery_pdf_delivered: "delivered",
  export_delivery_pdf_completed: "completed",
  export_delivery_pdf_pending_review: "pending_review",
  export_delivery_pdf_awaiting_release: "awaiting_release",
};

function fmtRespondedPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export default function ExamActionsModal({
  visible,
  exam,
  exportingPdfKind = null,
  onClose,
  onSelect,
}: Props) {
  if (!exam) return null;

  const exportingAny = exportingPdfKind != null;
  const courseLabel = exam.courses?.length
    ? exam.courses.map((c) => c.name).join(", ")
    : exam.course?.name ?? "—";

  const isExporting = (kind: ExamDeliveryPdfKind) => exportingPdfKind === kind;

  const actions: ActionDef[] = [
    {
      key: "preview",
      label: "Testar simulado",
      description: "Visualizar questões como o aluno",
      icon: "eye-outline",
      tone: "blue",
      group: "main",
    },
    {
      key: "edit",
      label: "Editar simulado",
      description: "Abrir cadastro e questões",
      icon: "pencil-outline",
      tone: "violet",
      group: "main",
    },
    {
      key: "export_delivery_pdf_delivered",
      label: isExporting("delivered") ? "Gerando PDF..." : "PDF — quem entregou",
      description: "Todos os alunos que finalizaram a entrega",
      icon: "checkmark-done-outline",
      tone: "emerald",
      group: "reports",
      disabled: exportingAny,
      exporting: isExporting("delivered"),
    },
    {
      key: "export_delivery_pdf_pending",
      label: isExporting("pending") ? "Gerando PDF..." : "PDF — quem não entregou",
      description: "Alunos elegíveis ainda sem entrega",
      icon: "hourglass-outline",
      tone: "amber",
      group: "reports",
      disabled: exportingAny,
      exporting: isExporting("pending"),
    },
    {
      key: "export_delivery_pdf_completed",
      label: isExporting("completed") ? "Gerando PDF..." : "PDF — resultado completo",
      description: "Entregas com resultado liberado",
      icon: "ribbon-outline",
      tone: "emerald",
      group: "reports",
      disabled: exportingAny,
      exporting: isExporting("completed"),
    },
    {
      key: "export_delivery_pdf_pending_review",
      label: isExporting("pending_review")
        ? "Gerando PDF..."
        : "PDF — parcial (aguardando correção)",
      description: "Entregas aguardando correção manual",
      icon: "create-outline",
      tone: "amber",
      group: "reports",
      disabled: exportingAny,
      exporting: isExporting("pending_review"),
    },
    {
      key: "export_delivery_pdf_awaiting_release",
      label: isExporting("awaiting_release")
        ? "Gerando PDF..."
        : "PDF — parcial (aguardando liberação)",
      description: "Entregas corrigidas aguardando liberação",
      icon: "lock-closed-outline",
      tone: "amber",
      group: "reports",
      disabled: exportingAny,
      exporting: isExporting("awaiting_release"),
    },
    {
      key: "delete",
      label: "Excluir simulado",
      description: "Remove o simulado permanentemente",
      icon: "trash-outline",
      tone: "red",
      group: "danger",
    },
  ];

  const groups = [
    { key: "main", title: "Ações", items: actions.filter((a) => a.group === "main") },
    {
      key: "reports",
      title: "Relatórios de entregas (PDF)",
      items: actions.filter((a) => a.group === "reports"),
    },
    { key: "danger", title: "Zona de risco", items: actions.filter((a) => a.group === "danger") },
  ];

  return (
    <Modal visible={visible} title="Ações do simulado" onClose={onClose} size="md">
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 mb-3">
        <Text className="text-sm font-bold text-gray-900" numberOfLines={2}>
          {exam.title}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {courseLabel}
          {exam.subject?.name ? ` · ${exam.subject.name}` : ""}
        </Text>
        <View className="flex-row items-center gap-2 mt-2 flex-wrap">
          <Badge label={exam.status_label ?? exam.status} slug={exam.status} />
          <Text className="text-xs text-gray-500">
            Entregues: {fmtRespondedPct(exam.responded_students_percentage)} (
            {exam.responded_students_count ?? 0}/{exam.eligible_students_count ?? 0})
          </Text>
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
                const isPdfAction = Boolean(PDF_ACTION_KIND[action.key]);
                return (
                  <TouchableOpacity
                    key={action.key}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(action.key);
                      if (!isPdfAction) {
                        onClose();
                      }
                    }}
                    disabled={disabled}
                    className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-red-100 bg-white"
                        : "border-gray-100 bg-white"
                    }`}
                    style={{ opacity: disabled ? 0.6 : 1 }}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-lg items-center justify-center ${style.bg}`}>
                      {action.exporting ? (
                        <ActivityIndicator size="small" color={style.icon} />
                      ) : (
                        <Ionicons name={action.icon} size={17} color={style.icon} />
                      )}
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
