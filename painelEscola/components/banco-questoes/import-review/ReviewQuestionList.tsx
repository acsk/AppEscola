import React, { useEffect, useRef } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { CircleCheck, Circle, TriangleAlert } from "lucide-react-native";
import { color } from "../../../constants/theme";
import { ISSUE_LABEL, questionSnippet, type IssueCode, type ReviewStatus } from "../../../utils/importReview";

export type ReviewFilter = "todas" | "pend" | "ok";

export type ReviewListItem = {
  key: string;
  number: number;
  subjectName: string;
  questionText: string;
  issues: IssueCode[];
  status: ReviewStatus;
};

type Props = {
  items: ReviewListItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
  /** Avisos acima da lista (páginas não lidas pela IA etc.). */
  notice?: React.ReactNode;
};

const STATUS_ICON = {
  ok: { Icon: CircleCheck, color: color.success, label: "Revisada" },
  warn: { Icon: TriangleAlert, color: color.warning, label: "Com pendências" },
  check: { Icon: Circle, color: color["ink-subtle"], label: "Para conferir" },
} as const;

/** Coluna de questões da revisão: filtros, grupos por disciplina e status de cada questão. */
export default function ReviewQuestionList({ items, activeKey, onSelect, filter, onFilter, notice }: Props) {
  const scrollRef = useRef<ScrollView | null>(null);
  // Posição de cada questão: y do grupo + y dentro do grupo (onLayout é relativo ao pai).
  const groupY = useRef(new Map<number, number>());
  const itemY = useRef(new Map<string, { group: number; y: number }>());
  const reviewed = items.filter((item) => item.status === "ok").length;
  const shown = items.filter((item) => filter === "todas" || (filter === "pend" ? item.status !== "ok" : item.status === "ok"));

  // Disciplinas em sequência formam um grupo (a ordem do PDF é mantida).
  const groups: { name: string; items: ReviewListItem[] }[] = [];
  for (const item of shown) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.subjectName) last.items.push(item);
    else groups.push({ name: item.subjectName, items: [item] });
  }

  // A questão atual fica visível ao navegar por Anterior/Próxima ou J/K.
  useEffect(() => {
    const at = itemY.current.get(activeKey);
    const y = at ? (groupY.current.get(at.group) ?? 0) + at.y : undefined;
    if (y !== undefined) (scrollRef.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void })?.scrollTo?.({ y: Math.max(0, y - 120), animated: true });
  }, [activeKey]);

  const chips: [ReviewFilter, string, number][] = [
    ["todas", "Todas", items.length],
    ["pend", "A revisar", items.length - reviewed],
    ["ok", "Revisadas", reviewed],
  ];

  return (
    <View className="flex-1 bg-surface" style={{ minHeight: 0 }} aria-label="Questões">
      <View className="flex-row border-b border-border p-3" style={{ gap: 2 }} role="group" aria-label="Filtrar questões">
        {chips.map(([id, label, count]) => {
          const on = filter === id;
          return (
            <TouchableOpacity key={id} onPress={() => onFilter(id)} aria-pressed={on}
              className={`flex-1 flex-row items-center justify-center rounded-ds-md px-1.5 ${on ? "bg-brand-tint" : ""}`}
              style={{ height: 30, gap: 5 }}>
              <Text className={`text-xs font-medium ${on ? "text-brand" : "text-ink-muted"}`} numberOfLines={1}>{label}</Text>
              <Text className={`font-mono ${on ? "text-brand" : "text-ink-muted"}`} style={{ fontSize: 11 }}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {notice}
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 8 }}>
        {groups.length === 0 && (
          <Text className="text-sm text-ink-subtle text-center py-8">Nenhuma questão neste filtro.</Text>
        )}
        {groups.map((group, gi) => (
          <View key={`${group.name}-${gi}`} onLayout={(e) => groupY.current.set(gi, e.nativeEvent.layout.y)}>
            <Text className="text-ink-subtle font-semibold uppercase px-2 pt-3 pb-1" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.9 }}>
              {group.name}
            </Text>
            {group.items.map((item) => {
              const current = item.key === activeKey;
              const st = STATUS_ICON[item.status];
              const detail = item.status === "ok" ? "Revisada"
                : item.status === "warn" ? item.issues.map((code) => ISSUE_LABEL[code]).join(" · ")
                : "Pronta para conferir";
              return (
                <TouchableOpacity key={item.key} onPress={() => onSelect(item.key)} aria-current={current ? "true" : undefined}
                  onLayout={(e) => itemY.current.set(item.key, { group: gi, y: e.nativeEvent.layout.y })}
                  className={`flex-row items-center rounded-ds-md px-2 ${current ? "bg-brand-tint" : ""}`}
                  style={{ paddingVertical: 7, gap: 8, position: "relative" }}>
                  {current && <View style={{ position: "absolute", left: -8, top: 6, bottom: 6, width: 3, backgroundColor: "var(--ds-accent)" }} />}
                  <Text className="font-mono font-medium text-ink" style={{ width: 28, fontSize: 13 }}>{String(item.number).padStart(2, "0")}</Text>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="text-[13px] leading-[18px] text-ink" numberOfLines={1}>{questionSnippet(item.questionText)}</Text>
                    <Text className={item.status === "warn" ? "text-warning" : "text-ink-subtle"} style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>
                      {detail}
                    </Text>
                  </View>
                  <View aria-label={st.label}><st.Icon size={16} color={st.color} strokeWidth={1.75} /></View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View className="border-t border-border p-3 flex-row flex-wrap items-center" style={{ gap: 4 }}>
        <Kbd>J</Kbd><Text className="text-ink-subtle" style={{ fontSize: 11 }}>/</Text><Kbd>K</Kbd>
        <Text className="text-ink-subtle" style={{ fontSize: 11 }}>navegar ·</Text>
        <Kbd>⌘</Kbd><Kbd>↵</Kbd><Text className="text-ink-subtle" style={{ fontSize: 11 }}>confirmar questão</Text>
      </View>
    </View>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono font-medium text-ink-muted bg-surface border border-border-strong rounded-ds-sm"
      style={{ fontSize: 10, lineHeight: 10, paddingHorizontal: 4, paddingVertical: 2, borderBottomWidth: 2 }}>
      {children}
    </Text>
  );
}
