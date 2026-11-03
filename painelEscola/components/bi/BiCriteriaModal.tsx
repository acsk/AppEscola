import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import { color } from "../../constants/theme";
import { getApiResponseMessage } from "../../utils/apiErrors";
import { fetchBiCriteria, saveBiCriteria, type BiCriteria, type BiCriteriaPayload } from "../../services/biService";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Chamado depois de salvar, para a tela recalcular com os novos critérios. */
  onSaved: () => void;
  /** Abre o cadastro de assuntos prioritários por concurso. */
  onOpenPriorities?: () => void;
};

const FIELDS: { key: keyof BiCriteria; label: string; hint: string }[] = [
  { key: "goal_pct", label: "Meta de aproveitamento (%)", hint: "Abaixo disto o resultado ganha ▾ e o aluno pode entrar em atenção." },
  { key: "evolution_threshold_pp", label: "Variação mínima de evolução (pp)", hint: "A partir daqui o aluno conta como em evolução ou em queda." },
  { key: "attendance_alert_below", label: "Frequência mínima (%)", hint: "Abaixo disto, com ao menos 4 chamadas, sinaliza frequência baixa." },
  { key: "dedication_days_per_week", label: "Dedicação alta (dias ativos/semana)", hint: "Limiar da matriz de perfis." },
  { key: "profile_min_assessments", label: "Avaliações mínimas para perfil", hint: "Abaixo disto o aluno fica sem classificação." },
  { key: "profile_min_questions", label: "Questões mínimas para perfil", hint: "Respostas no banco no período." },
];

const toText = (v: number) => String(v).replace(".", ",");
const toNumber = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

/** Critérios pedagógicos da escola: valem para todas as telas da Inteligência Educacional. */
export default function BiCriteriaModal({ visible, onClose, onSaved, onOpenPriorities }: Props) {
  const [payload, setPayload] = useState<BiCriteriaPayload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError("");
    fetchBiCriteria()
      .then((p) => {
        setPayload(p);
        setAiEnabled(p.ai.enabled);
        setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, toText(p.criteria[f.key])])));
      })
      .catch((err) => setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os critérios.")));
  }, [visible]);

  const invalid = (key: keyof BiCriteria) => {
    const limit = payload?.limits[key];
    const value = toNumber(draft[key] ?? "");
    if (!limit || Number.isNaN(value)) return "Informe um número.";
    if (value < limit.min || value > limit.max) return `Entre ${limit.min} e ${limit.max}.`;
    if (limit.integer && !Number.isInteger(value)) return "Use um número inteiro.";
    return "";
  };
  const hasErrors = !payload || FIELDS.some((f) => invalid(f.key));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveBiCriteria({
        ...Object.fromEntries(FIELDS.map((f) => [f.key, toNumber(draft[f.key])])),
        ...(payload?.ai.available ? { ai_enabled: aiEnabled } : {}),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível salvar os critérios."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title="Critérios da escola"
      size="md"
      compact
      onClose={onClose}
      footer={
        <View className="flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <Button label="Cancelar" onPress={onClose} />
          <Button variant="primary" label="Salvar critérios" onPress={save} loading={saving} disabled={hasErrors} />
        </View>
      }
    >
      {!payload && !error ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
            Valem para todas as telas da Inteligência Educacional desta escola. Os indicadores são recalculados com os novos valores.
          </Text>
          {FIELDS.map((f) => (
            <View key={f.key}>
              <FormInput
                label={f.label}
                value={draft[f.key] ?? ""}
                onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                valueFormat={payload?.limits[f.key].integer ? "integer" : "decimal"}
                decimalPlaces={1}
                error={payload ? invalid(f.key) || undefined : undefined}
              />
              <Text className="text-ink-subtle" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>{f.hint}</Text>
            </View>
          ))}
          {payload ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: aiEnabled, disabled: !payload.ai.available }}
              disabled={!payload.ai.available}
              onPress={() => setAiEnabled((v) => !v)}
              className="flex-row border-t border-border"
              style={{ gap: 10, paddingTop: 12, marginTop: 4, alignItems: "flex-start", opacity: payload.ai.available ? 1 : 0.6 }}
            >
              <View style={{ width: 18, height: 18, borderRadius: 3, marginTop: 1, borderWidth: 1, borderColor: color["border-strong"], backgroundColor: aiEnabled ? color.brand : color.surface }} />
              <View style={{ flex: 1 }}>
                <Text className="text-ink font-medium" style={{ fontSize: 13 }}>Usar IA para rascunhos</Text>
                <Text className="text-ink-subtle" style={{ fontSize: 11, lineHeight: 16 }}>
                  {payload.ai.available
                    ? "Diagnóstico 360°, resumo executivo e insights. Só números vão para o provedor de IA (nenhum nome ou identificador); todo rascunho precisa ser validado por uma pessoa."
                    : payload.ai.reason === "plan"
                      ? "Disponível no plano avançado."
                      : "Cadastre uma chave em Configurações → Integração com IA para liberar."}
                </Text>
              </View>
            </Pressable>
          ) : null}
          {error ? <Text className="text-danger" style={{ fontSize: 13 }}>{error}</Text> : null}
          {onOpenPriorities ? (
            <View className="border-t border-border" style={{ paddingTop: 12, marginTop: 4, gap: 6, alignItems: "flex-start" }}>
              <Text className="text-ink-muted" style={{ fontSize: 13 }}>Os assuntos prioritários de cada concurso (peso no edital) ficam num cadastro próprio.</Text>
              <Button
                size="sm"
                label="Assuntos prioritários por concurso"
                onPress={() => {
                  onClose();
                  onOpenPriorities();
                }}
              />
            </View>
          ) : null}
        </View>
      )}
    </Modal>
  );
}
