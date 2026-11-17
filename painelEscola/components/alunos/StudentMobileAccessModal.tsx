import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormSelect from "../ui/FormSelect";
import FormInput from "../ui/FormInput";
import { getApiResponseMessage, parseApiErrors } from "../../utils/apiErrors";
import { durationLabel, fetchSupportAccessReasons, startStudentMobileAccess, type SupportAccessReason } from "../../services/supportAccess";

type Props = {
  student: { id: number; name: string } | null;
  onClose: () => void;
};

const MIN_DETAILS = 10;

/** Abre o app web na conta do aluno: motivo, o que será feito e por quanto tempo. Fica registrado. */
export default function StudentMobileAccessModal({ student, onClose }: Props) {
  const [reasons, setReasons] = useState<SupportAccessReason[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [details, setDetails] = useState("");
  const [duration, setDuration] = useState("60");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!student) return;
    setReasonId("");
    setDetails("");
    setDuration("60");
    setErrors({});
    setError("");
    setLaunchUrl("");
    fetchSupportAccessReasons()
      .then((data) => {
        setReasons(data.reasons);
        setDurations(data.durations);
      })
      .catch((e) => setError(getApiResponseMessage(e?.response?.data, "Não foi possível carregar os motivos.")));
  }, [student]);

  const reason = reasons.find((r) => String(r.id) === reasonId);

  const submit = async () => {
    if (!student) return;
    const local: Record<string, string> = {};
    if (!reason) local.reason_id = "Escolha o motivo do acesso.";
    if (reason?.requires_details && details.trim().length < MIN_DETAILS) {
      local.details = `Descreva o que será feito (mínimo de ${MIN_DETAILS} caracteres).`;
    }
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    setError("");
    setLaunchUrl("");
    try {
      const result = await startStudentMobileAccess(student.id, {
        reason_id: Number(reasonId),
        details: details.trim() || undefined,
        duration_minutes: Number(duration),
      });
      if (!result.launch_url) {
        setError("O endereço do app não está configurado no servidor (MOBILE_WEB_URL).");
        setSaving(false);
        return;
      }
      const popup = typeof window !== "undefined" ? window.open(result.launch_url, "_blank") : null;
      if (popup) {
        popup.opener = null;
        onClose();
        return;
      }
      setLaunchUrl(result.launch_url);
      setError("O navegador bloqueou a nova aba. Abra o link abaixo ou permita pop-ups deste site.");
      setSaving(false);
    } catch (e: any) {
      const data = e?.response?.data;
      setErrors(parseApiErrors(data?.errors ?? data?.body?.errors ?? {}));
      setError(getApiResponseMessage(e?.response?.data, "Não foi possível abrir o app do aluno."));
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!student}
      title={`App de ${student?.name ?? ""}`}
      onClose={saving ? () => undefined : onClose}
      size="md"
      footer={
        <>
          <Button label="Cancelar" onPress={onClose} disabled={saving} />
          <Button variant="primary" label="Abrir app" onPress={submit} loading={saving} />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted" style={{ lineHeight: 20 }}>
          Você entra na conta deste aluno no app, por tempo limitado, sem usar a senha dele. O que for feito vale para a
          conta e fica registrado. A senha do aluno não muda.
        </Text>
        <FormSelect
          label="Motivo"
          required
          value={reasonId}
          options={[{ value: "", label: "Selecione o motivo" }, ...reasons.map((r) => ({ value: String(r.id), label: r.name }))]}
          onChange={(v) => {
            setReasonId(v);
            setErrors((prev) => ({ ...prev, reason_id: "" }));
          }}
          error={errors.reason_id}
        />
        <FormInput
          label={reason?.requires_details ? "O que será feito" : "O que será feito (opcional)"}
          required={!!reason?.requires_details}
          value={details}
          onChangeText={(v) => {
            setDetails(v);
            setErrors((prev) => ({ ...prev, details: "" }));
          }}
          placeholder="Ex.: conferir o boleto que o aluno não consegue abrir"
          multiline
          numberOfLines={3}
          maxLength={500}
          error={errors.details}
        />
        <FormSelect
          label="Duração do acesso"
          required
          value={duration}
          options={(durations.length ? durations : [30, 60, 120, 240]).map((m) => ({ value: String(m), label: durationLabel(m) }))}
          onChange={setDuration}
          error={errors.duration_minutes}
        />
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        {launchUrl ? (
          <Text className="text-sm text-brand" selectable onPress={() => window.open(launchUrl, "_blank")}>
            {launchUrl}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}
