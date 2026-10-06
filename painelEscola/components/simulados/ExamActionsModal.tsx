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
  | "open_delivery_reports"
  | "open_question_errors_report"
  | "delete";

type ActionDef = {
  key: ExamActionKey;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "violet" | "emerald" | "red";
  group: "main" | "danger";
};

type Props = {
  visible: boolean;
  exam: ExamListItem | null;
  onClose: () => void;
  onSelect: (action: ExamActionKey) => void;
  /** Se false, oculta editar/excluir (apenas visualização/relatórios). Default: true */
  canManage?: boolean;
};

const toneStyles: Record<ActionDef["tone"], { bg: string; icon: string }> = {
  blue: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  violet: { bg: "bg-brand-tint", icon: "var(--ds-brand)" },
  emerald: { bg: "bg-success-tint", icon: "var(--ds-success)" },
  red: { bg: "bg-danger", icon: "var(--ds-on-danger)" },
};

function fmtRespondedPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export default function ExamActionsModal({
  visible,
  exam,
  onClose,
  onSelect,
  canManage = true,
}: Props) {
  if (!exam) return null;

  const courseLabel = exam.courses?.length
    ? exam.courses.map((c) => c.name).join(", ")
    : exam.course?.name ?? "—";

  const actions: ActionDef[] = [
    {
      key: "preview",
      label: "Testar simulado",
      description: "Visualizar questões como o aluno",
      icon: "eye-outline",
      tone: "blue",
      group: "main",
    },
    ...(canManage
      ? ([
          {
            key: "edit",
            label: "Editar simulado",
            description: "Abrir cadastro e questões",
            icon: "pencil-outline",
            tone: "violet",
            group: "main",
          },
        ] as ActionDef[])
      : []),
    {
      key: "open_delivery_reports",
      label: "Relatórios de entregas (PDF)",
      description: "Quem entregou, pendentes e resultados",
      icon: "document-attach-outline",
      tone: "emerald",
      group: "main",
    },
    {
      key: "open_question_errors_report",
      label: "Questões com mais erros",
      description: "Ranking das questões com maior taxa de erro",
      icon: "analytics-outline",
      tone: "violet",
      group: "main",
    },
    ...(canManage
      ? ([
          {
            key: "delete",
            label: "Excluir simulado",
            description: "Remove o simulado permanentemente",
            icon: "trash-outline",
            tone: "red",
            group: "danger",
          },
        ] as ActionDef[])
      : []),
  ];

  const groups = [
    { key: "main", title: "Ações", items: actions.filter((a) => a.group === "main") },
    { key: "danger", title: "Zona de risco", items: actions.filter((a) => a.group === "danger") },
  ].filter((group) => group.items.length > 0);

  return (
    <Modal visible={visible} title="Ações do simulado" onClose={onClose} size="md">
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
          {exam.title}
        </Text>
        <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
          {courseLabel}
          {exam.subject?.name ? ` · ${exam.subject.name}` : ""}
        </Text>
        <View className="flex-row items-center gap-2 mt-2 flex-wrap">
          <Badge label={exam.status_label ?? exam.status} slug={exam.status} />
          <Text className="text-xs text-ink-muted">
            Entregues: {fmtRespondedPct(exam.responded_students_percentage)} (
            {exam.responded_students_count ?? 0}/{exam.eligible_students_count ?? 0})
          </Text>
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
                return (
                  <TouchableOpacity
                    key={action.key}
                    onPress={() => {
                      onSelect(action.key);
                      if (action.key !== "open_delivery_reports") {
                        onClose();
                      }
                    }}
                    className={`flex-row items-center gap-2.5 rounded-ds-md border px-3 py-2 ${
                      action.group === "danger"
                        ? "border-danger bg-danger-tint"
                        : "border-border bg-surface"
                    }`}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-ds-md items-center justify-center ${style.bg}`}>
                      <Ionicons name={action.icon} size={17} color={style.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${action.group === "danger" ? "text-danger" : "text-ink"}`}>{action.label}</Text>
                      {action.description ? (
                        <Text className="text-xs text-ink-muted mt-0.5">{action.description}</Text>
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

type ReportOption = {
  kind: ExamDeliveryPdfKind;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "emerald" | "amber";
};

const REPORT_GROUPS: { title: string; items: ReportOption[] }[] = [
  {
    title: "Entregas",
    items: [
      {
        kind: "delivered",
        label: "Quem entregou",
        description: "Todos os alunos que finalizaram a entrega",
        icon: "checkmark-done-outline",
        tone: "emerald",
      },
      {
        kind: "pending",
        label: "Quem não entregou",
        description: "Alunos elegíveis ainda sem entrega",
        icon: "hourglass-outline",
        tone: "amber",
      },
    ],
  },
  {
    title: "Resultados",
    items: [
      {
        kind: "completed",
        label: "Resultado completo",
        description: "Entregas com resultado liberado",
        icon: "ribbon-outline",
        tone: "emerald",
      },
      {
        kind: "pending_review",
        label: "Parcial — aguardando correção",
        description: "Entregas aguardando correção manual",
        icon: "create-outline",
        tone: "amber",
      },
      {
        kind: "awaiting_release",
        label: "Parcial — aguardando liberação",
        description: "Entregas corrigidas aguardando liberação",
        icon: "lock-closed-outline",
        tone: "amber",
      },
    ],
  },
];

type ReportsModalProps = {
  visible: boolean;
  exam: ExamListItem | null;
  exportingPdfKind?: ExamDeliveryPdfKind | null;
  onClose: () => void;
  onBack?: () => void;
  onSelect: (kind: ExamDeliveryPdfKind) => void;
};

export function ExamDeliveryReportsModal({
  visible,
  exam,
  exportingPdfKind = null,
  onClose,
  onBack,
  onSelect,
}: ReportsModalProps) {
  if (!exam) return null;

  const exportingAny = exportingPdfKind != null;
  const reportToneStyles = {
    emerald: { bg: "bg-success-tint", icon: "var(--ds-success)" },
    amber: { bg: "bg-warning-tint", icon: "var(--ds-warning)" },
  };

  return (
    <Modal
      visible={visible}
      title="Relatórios de entregas"
      onClose={() => {
        if (!exportingAny) onClose();
      }}
      size="md"
    >
      <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
          {exam.title}
        </Text>
        <Text className="text-xs text-ink-muted mt-1">
          Escolha o tipo de PDF. Cada opção gera um arquivo separado.
        </Text>
      </View>

      {onBack && !exportingAny ? (
        <TouchableOpacity
          onPress={onBack}
          className="flex-row items-center gap-1.5 mb-3 self-start"
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back-outline" size={16} color="var(--ds-ink-muted)" />
          <Text className="text-xs font-semibold text-ink-muted">Voltar às ações</Text>
        </TouchableOpacity>
      ) : null}

      <View className="gap-3">
        {REPORT_GROUPS.map((group) => (
          <View key={group.title}>
            <Text className="text-xs uppercase font-semibold text-ink-muted tracking-wide mb-1.5">
              {group.title}
            </Text>
            <View className="gap-1.5">
              {group.items.map((item) => {
                const style = reportToneStyles[item.tone];
                const exporting = exportingPdfKind === item.kind;
                const disabled = exportingAny;
                return (
                  <TouchableOpacity
                    key={item.kind}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(item.kind);
                    }}
                    disabled={disabled}
                    className="flex-row items-center gap-2.5 rounded-ds-md border border-border-strong bg-surface px-3 py-2 min-h-control-md justify-center"
                    style={{ opacity: disabled && !exporting ? 0.55 : 1 }}
                    activeOpacity={0.85}
                  >
                    <View className={`w-9 h-9 rounded-ds-md items-center justify-center ${style.bg}`}>
                      {exporting ? (
                        <ActivityIndicator size="small" color={style.icon} />
                      ) : (
                        <Ionicons name={item.icon} size={17} color={style.icon} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">
                        {exporting ? "Gerando PDF..." : item.label}
                      </Text>
                      <Text className="text-xs text-ink-muted mt-0.5">{item.description}</Text>
                    </View>
                    {!disabled ? (
                      <Ionicons name="download-outline" size={16} color="var(--ds-ink-subtle)" />
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
