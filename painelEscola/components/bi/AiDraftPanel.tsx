import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Icon from "../ui/Icon";
import FormInput from "../ui/FormInput";
import { color } from "../../constants/theme";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  aiDraftText,
  fetchBiAiLatest,
  fetchBiAiStatus,
  generateBiAiDraft,
  updateBiAiDraft,
  type BiAiDraft,
  type BiAiStatus,
  type BiAiTarget,
  type BiFilters,
} from "../../services/biService";

type Props = {
  title: string;
  target: BiAiTarget;
  filters: BiFilters;
  /** Chamado ao validar, com o texto final (para usar no relatório, por exemplo). */
  onValidated?: (text: string, draft: BiAiDraft) => void;
  /** Ação de um insight (abrir a tela da área). */
  onOpenArea?: (area: string) => void;
};

const AREA_LABEL: Record<string, string> = {
  geral: "Visão geral",
  avaliacoes: "Simulados",
  disciplinas: "Disciplinas",
  turmas: "Turmas",
  engajamento: "Engajamento",
  intervencoes: "Acompanhamento",
};

const STATUS_LABEL: Record<BiAiStatus["reason"] & string, string> = {
  plan: "Recurso do plano avançado.",
  no_key: "Cadastre uma chave em Configurações → Integração com IA.",
  disabled: "A coordenação pode ligar em Critérios → Usar IA para rascunhos.",
};

/**
 * Rascunho da IA com governança: evidências por trecho, números fora dos dados sinalizados,
 * edição pela pessoa e validação obrigatória antes de usar o texto.
 */
export default function AiDraftPanel({ title, target, filters, onValidated, onOpenArea }: Props) {
  const [status, setStatus] = useState<BiAiStatus | null>(null);
  const [draft, setDraft] = useState<BiAiDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const targetKey = JSON.stringify(target);
  const filtersKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, d] = await Promise.all([fetchBiAiStatus(), fetchBiAiLatest(target, filters)]);
      setStatus(s);
      setDraft(d);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [targetKey, filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<BiAiDraft>) => {
    setBusy(true);
    setError("");
    try {
      const d = await fn();
      setDraft(d.status === "discarded" ? null : d);
      setEditing(false);
      if (d.status === "validated") onValidated?.(aiDraftText(d), d);
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível concluir a ação."));
    } finally {
      setBusy(false);
    }
  };

  const isInsights = target.kind === "school_insights";

  return (
    <View className="bg-surface border border-border rounded-ds-md" style={{ overflow: "hidden" }}>
      <View className="flex-row flex-wrap items-center border-b border-border" style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8 }}>
        <Icon icon={Sparkles} size={16} color={color["ink-muted"]} />
        <Text className="font-semibold text-ink-muted" style={{ fontSize: 11, letterSpacing: 0.6 }}>{title.toUpperCase()}</Text>
        {draft ? <Badge label={draft.status === "validated" ? `Validado${draft.validated_by ? ` · ${draft.validated_by}` : ""}` : "Rascunho da IA"} tone={draft.status === "validated" ? "success" : "neutral"} /> : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator color={color.brand} />
        ) : !status?.enabled && !draft ? (
          <Text className="text-ink-subtle" style={{ fontSize: 13 }}>{`IA desligada para esta escola. ${status?.reason ? STATUS_LABEL[status.reason] : ""}`}</Text>
        ) : !draft ? (
          <Text className="text-ink-muted" style={{ fontSize: 13 }}>
            {isInsights
              ? "Gere observações da escola a partir dos indicadores do período. Só números vão para a IA."
              : "Gere um rascunho a partir dos indicadores calculados. Só números vão para a IA; nenhum nome ou identificador."}
          </Text>
        ) : editing ? (
          <FormInput label="Texto revisado" value={text} onChangeText={setText} multiline />
        ) : isInsights ? (
          <View style={{ gap: 12 }}>
            {(draft.content.insights ?? []).map((i, k) => (
              <View key={k} className={k ? "border-t border-border" : ""} style={{ paddingTop: k ? 12 : 0, gap: 4 }}>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Text className="font-semibold text-ink" style={{ fontSize: 14 }}>{i.title}</Text>
                  <Badge label={AREA_LABEL[i.area] ?? i.area} tone="neutral" />
                </View>
                <Text className="text-ink" style={{ fontSize: 13, lineHeight: 20 }}>{i.text}</Text>
                <Evidence keys={i.evidence} facts={draft.facts} />
                {onOpenArea ? (
                  <Pressable accessibilityRole="link" onPress={() => onOpenArea(i.area)}>
                    <Text className="font-medium text-brand" style={{ fontSize: 12 }}>{`Abrir ${AREA_LABEL[i.area] ?? "tela"}`}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : draft.edited_text ? (
          <Text className="text-ink" style={{ fontSize: 14, lineHeight: 22 }}>{draft.edited_text}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {(draft.content.paragraphs ?? []).map((p, k) => (
              <View key={k} style={{ gap: 4 }}>
                <Text className="text-ink" style={{ fontSize: 14, lineHeight: 22 }}>{p.text}</Text>
                <Evidence keys={p.evidence} facts={draft.facts} />
              </View>
            ))}
          </View>
        )}

        {draft && draft.unverified.length ? (
          <Text className="text-warning" style={{ fontSize: 12 }}>
            {`Confira: ${draft.unverified.join(", ")} não aparece(m) nos dados enviados. Edite antes de validar.`}
          </Text>
        ) : null}
        {draft ? (
          <Text className="text-ink-subtle" style={{ fontSize: 11 }}>
            {`Gerado por ${draft.generated_by ?? "—"} em ${new Date(draft.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${draft.model ? ` · ${draft.model}` : ""} · período ${draft.period.from} a ${draft.period.to}`}
          </Text>
        ) : null}
        {error ? <Text className="text-danger" style={{ fontSize: 12 }}>{error}</Text> : null}
      </View>

      {!loading && (status?.enabled || draft) ? (
        <View className="flex-row flex-wrap bg-surface-sunken border-t border-border" style={{ padding: 12, gap: 8, justifyContent: "flex-end" }}>
          {editing ? (
            <>
              <Button label="Cancelar" onPress={() => setEditing(false)} />
              <Button variant="primary" label="Salvar texto" loading={busy} onPress={() => draft && act(() => updateBiAiDraft(draft.id, { text }))} />
            </>
          ) : (
            <>
              {draft ? <Button label="Descartar" onPress={() => act(() => updateBiAiDraft(draft.id, { status: "discarded" }))} /> : null}
              {draft && !isInsights ? (
                <Button
                  label="Editar"
                  onPress={() => {
                    setText(aiDraftText(draft));
                    setEditing(true);
                  }}
                />
              ) : null}
              {status?.enabled ? (
                <Button label={draft ? "Gerar de novo" : "Gerar rascunho"} loading={busy && !draft} onPress={() => act(() => generateBiAiDraft(target, filters))} />
              ) : null}
              {draft && draft.status !== "validated" ? (
                <Button variant="primary" label={isInsights ? "Marcar como revisado" : "Validar"} loading={busy} onPress={() => act(() => updateBiAiDraft(draft.id, { status: "validated" }))} />
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Etiquetas de evidência (chave = valor), como no mockup. */
function Evidence({ keys, facts }: { keys: string[]; facts: Record<string, unknown> }) {
  if (!keys.length) return <Text className="text-ink-subtle" style={{ fontSize: 11 }}>Sem evidência citada.</Text>;
  return (
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
      {keys.map((k) => (
        <Text key={k} className="font-mono text-ink-muted border border-border rounded-ds-sm" style={{ fontSize: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
          {`${k}=${String(facts[k] ?? "—").replace(".", ",")}`}
        </Text>
      ))}
    </View>
  );
}
