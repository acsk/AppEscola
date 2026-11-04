import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormSelect from "../ui/FormSelect";
import FormInput from "../ui/FormInput";
import { useAuth } from "../../contexts/AuthContext";
import { getApiResponseMessage, parseApiErrors } from "../../utils/apiErrors";
import { durationLabel, fetchSupportAccessReasons, type SupportAccessReason } from "../../services/supportAccess";

type Props = {
  tenant: { id: number; name: string } | null;
  onClose: () => void;
};

const MIN_DETAILS = 10;

/** Abre o acesso de suporte a um tenant: motivo, o que será feito e por quanto tempo. Fica registrado. */
export default function SupportAccessModal({ tenant, onClose }: Props) {
  const { enterTenant } = useAuth();
  const [reasons, setReasons] = useState<SupportAccessReason[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [details, setDetails] = useState("");
  const [duration, setDuration] = useState("60");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setReasonId("");
    setDetails("");
    setDuration("60");
    setErrors({});
    setError("");
    fetchSupportAccessReasons()
      .then((data) => {
        setReasons(data.reasons);
        setDurations(data.durations);
      })
      .catch((e) => setError(getApiResponseMessage(e?.response?.data, "Não foi possível carregar os motivos.")));
  }, [tenant]);

  const reason = reasons.find((r) => String(r.id) === reasonId);

  const submit = async () => {
    if (!tenant) return;
    const local: Record<string, string> = {};
    if (!reason) local.reason_id = "Escolha o motivo do acesso.";
    if (reason?.requires_details && details.trim().length < MIN_DETAILS) {
      local.details = `Descreva o que será feito (mínimo de ${MIN_DETAILS} caracteres).`;
    }
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    setError("");
    try {
      // Em caso de sucesso a página recarrega já dentro do tenant.
      await enterTenant(tenant.id, {
        reason_id: Number(reasonId),
        details: details.trim() || undefined,
        duration_minutes: Number(duration),
      });
    } catch (e: any) {
      const data = e?.response?.data;
      setErrors(parseApiErrors(data?.errors ?? data?.body?.errors ?? {}));
      setError(getApiResponseMessage(e?.response?.data, "Não foi possível iniciar o acesso."));
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!tenant}
      title={`Acessar ${tenant?.name ?? ""}`}
      onClose={saving ? () => undefined : onClose}
      size="md"
      footer={
        <>
          <Button label="Cancelar" onPress={onClose} disabled={saving} />
          <Button variant="primary" label="Iniciar acesso" onPress={submit} loading={saving} />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted" style={{ lineHeight: 20 }}>
          Você entra como super admin nesta instituição por tempo limitado. O motivo, o que será feito, a duração e
          cada alteração de dados ficam registrados.
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
          placeholder="Ex.: conferir as cobranças de outubro a pedido da secretaria"
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
      </View>
    </Modal>
  );
}
