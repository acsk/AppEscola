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

/** Aluno pediu revisão. Some depois que a equipe salva a questão. */
export function StudentReviewMark({ label = "Revisão" }: { label?: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }} aria-label="Aluno pediu revisão">
      <View
        aria-hidden
        className="rounded-ds-sm items-center justify-center"
        style={{ width: 24, height: 24, backgroundColor: color.warning }}
      >
        <Text className="font-mono" style={{ fontSize: 13, lineHeight: 14, fontWeight: "700", color: color.surface }}>
          !
        </Text>
      </View>
      <Text className="font-medium" style={{ fontSize: 13, color: color.warning }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Marca de revalidada em destaque: quadrado `success` com "R" e a palavra ao lado. */
export function RevalidatedMark({ label = "Revalidada" }: { label?: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }} aria-label={label}>
      <View
        aria-hidden
        className="rounded-ds-sm items-center justify-center"
        style={[
          { width: 24, height: 24, backgroundColor: color.success },
          Platform.OS === "web" ? ({ boxShadow: `0 0 0 2px ${color["success-tint"]}` } as object) : { borderWidth: 2, borderColor: color["success-tint"] },
        ]}
      >
        <Text className="font-mono" style={{ fontSize: 13, lineHeight: 14, fontWeight: "700", color: color.surface }}>
          R
        </Text>
      </View>
      <Text className="font-medium" style={{ fontSize: 13, color: color.success }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
