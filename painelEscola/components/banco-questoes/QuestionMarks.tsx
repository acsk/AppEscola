import { Platform, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { color } from "../../constants/theme";

/**
 * Selo "Oficial": questão de simulado oficial, com edição bloqueada (protótipo "TelaBancoQuestoes").
 * Fundo `warning`, texto em `surface`, cadeado com traço mais forte para ler em 12px.
 */
export function OfficialBadge({ label = "Oficial", title }: { label?: string; title?: string }) {
  return (
    <View
      role="img"
      aria-label={title ?? "Questão de simulado oficial — edição bloqueada"}
      className="flex-row items-center rounded-ds-sm"
      style={{ alignSelf: "flex-start", gap: 4, height: 20, paddingLeft: 5, paddingRight: 6, backgroundColor: color.warning }}
    >
      <Lock size={12} color={color.surface} strokeWidth={2.2} />
      <Text className="font-semibold" style={{ fontSize: 11, lineHeight: 12, letterSpacing: 0.22, color: color.surface }}>
        {label}
      </Text>
    </View>
  );
}

export function formatReportedAt(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function reporterDetail(reporter: { name: string; enrollment_number?: string | null; reported_at?: string | null }): string {
  const when = formatReportedAt(reporter.reported_at);
  const enrollment = reporter.enrollment_number ? `matrícula ${reporter.enrollment_number}` : "";
  return [reporter.name, enrollment, when].filter(Boolean).join(" · ");
}

/** Aluno informou erro. A questão fica sem validação até o administrador revisar. */
export function StudentReviewMark({ label = "Sem validação", names = [] }: { label?: string; names?: string[] }) {
  const who = names.filter(Boolean);
  const aria = who.length
    ? `Marcada para revisão por ${who.join(", ")}`
    : "Questão sem validação: aluno informou erro";
  return (
    <View className="flex-row items-center" style={{ gap: 8, flex: 1, minWidth: 0 }} aria-label={aria}>
      <View
        aria-hidden
        className="rounded-ds-sm items-center justify-center"
        style={{ width: 24, height: 24, backgroundColor: color.warning }}
      >
        <Text className="font-mono" style={{ fontSize: 13, lineHeight: 14, fontWeight: "700", color: color.surface }}>
          !
        </Text>
      </View>
      <Text className="font-medium" style={{ fontSize: 13, color: color.warning, flexShrink: 1 }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Marca de revalidada em destaque: quadrado `success` com "R" e, opcionalmente, a palavra ao lado. */
export function RevalidatedMark({ label = "Revalidada", iconOnly = false, size = 24 }: { label?: string; iconOnly?: boolean; size?: number }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }} role={iconOnly ? "img" : undefined} aria-label={label} {...(iconOnly ? { title: label } : {})}>
      <View
        aria-hidden
        className="rounded-ds-sm items-center justify-center"
        style={[
          { width: size, height: size, backgroundColor: color.success },
          Platform.OS === "web" ? ({ boxShadow: `0 0 0 2px ${color["success-tint"]}` } as object) : { borderWidth: 2, borderColor: color["success-tint"] },
        ]}
      >
        <Text className="font-mono" style={{ fontSize: Math.round(size * 0.48), lineHeight: Math.round(size * 0.54), fontWeight: "700", color: color.surface }}>
          R
        </Text>
      </View>
      {iconOnly ? null : (
        <Text className="font-medium" style={{ fontSize: 13, color: color.success }} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
}
