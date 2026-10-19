import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import { color } from "../../constants/theme";
import { fetchQuestionBankSettings, updateQuestionBankSettings, type QuestionBankSettings } from "../../services/questionBank";
import { getApiErrorMessage, getApiValidationErrors, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";

type Props = {
  visible: boolean;
  onClose: () => void;
  setToast: (state: ApiToastState | ((prev: ApiToastState) => ApiToastState)) => void;
  /** Depois de salvar: recarrega a lista (marcas "em análise" mudam com o novo mínimo). */
  onSaved?: () => void;
};

/** Configurações do banco de questões: quantos alunos diferentes precisam avisar erro para a questão ir para análise. */
export default function QuestionBankSettingsModal({ visible, onClose, setToast, onSaved }: Props) {
  const [settings, setSettings] = useState<QuestionBankSettings | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setLoadError(null);
    setError(undefined);
    fetchQuestionBankSettings()
      .then((data) => {
        setSettings(data);
        setValue(String(data.issue_report_threshold));
      })
      .catch((cause) => setLoadError(getApiErrorMessage(cause, "Não foi possível carregar as configurações.")))
      .finally(() => setLoading(false));
  }, [visible]);

  const min = settings?.issue_report_threshold_min ?? 1;
  const max = settings?.issue_report_threshold_max ?? 50;

  const save = async () => {
    const threshold = Number(value);
    if (!Number.isInteger(threshold) || threshold < min || threshold > max) {
      setError(`Informe um número de ${min} a ${max}.`);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await updateQuestionBankSettings(threshold);
      showApiToast(setToast, response, "Configurações salvas com sucesso.");
      onSaved?.();
      onClose();
    } catch (cause) {
      setError(getApiValidationErrors(cause).issue_report_threshold);
      showApiErrorToast(setToast, cause, "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title="Configurações do banco de questões"
      onClose={onClose}
      size="sm"
      compact
      footer={
        <View className="flex-row justify-end" style={{ gap: 8 }}>
          <Button variant="secondary" label="Cancelar" onPress={onClose} disabled={saving} />
          <Button variant="primary" label="Salvar" onPress={() => void save()} loading={saving} disabled={loading || !!loadError} />
        </View>
      }
    >
      {loading ? (
        <View className="py-8 items-center"><ActivityIndicator color={color.brand} /></View>
      ) : loadError ? (
        <Text className="text-danger" style={{ fontSize: 14 }}>{loadError}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          <FormInput
            label="Avisos de erro para a questão ir para análise"
            required
            valueFormat="integer"
            maxDigits={2}
            keyboardType="number-pad"
            value={value}
            onChangeText={setValue}
            error={error}
          />
          <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 19 }}>
            Quantos alunos diferentes precisam informar erro na mesma questão para ela sair da prática e do ranking até a revisão.
            {settings ? ` Padrão: ${settings.issue_report_threshold_default}. De ${min} a ${max}.` : ""}
          </Text>
        </View>
      )}
    </Modal>
  );
}
