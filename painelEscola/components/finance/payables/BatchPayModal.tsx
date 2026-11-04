import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import FormSelect from "../../ui/FormSelect";
import DatePickerInput from "../../ui/DatePickerInput";
import { displayToISO, isoToDisplay } from "../../../utils/masks";
import type { PayablesOptions } from "../../../services/payables";

type Props = {
  visible: boolean;
  count: number;
  options: PayablesOptions | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payment: { paid_at: string; payment_method: string }) => void;
};

const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Pagamento em lote: mesma data e forma para todas as despesas selecionadas. Não movimenta dinheiro. */
export default function BatchPayModal({ visible, count, options, busy, onClose, onConfirm }: Props) {
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setPaidAt(todayISO());
      setMethod("");
      setError("");
    }
  }, [visible]);

  const confirm = () => {
    if (!method) return setError("Selecione a forma de pagamento.");
    onConfirm({ paid_at: paidAt, payment_method: method });
  };

  return (
    <Modal
      visible={visible}
      title={`Registrar pagamento de ${count} despesa(s)`}
      onClose={onClose}
      size="sm"
      footer={
        <View className="flex-row justify-end" style={{ gap: 8 }}>
          <Button variant="ghost" label="Cancelar" onPress={onClose} disabled={busy} />
          <Button variant="primary" label="Registrar pagamento" onPress={confirm} loading={busy} disabled={busy} />
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Text className="text-sm text-ink">
          <Text className="font-semibold">Não movimenta dinheiro.</Text> Só registra que as despesas aprovadas foram pagas; as que não estiverem
          aprovadas voltam com o motivo.
        </Text>
        <DatePickerInput label="Pago em" value={isoToDisplay(paidAt)} onChangeText={(v) => setPaidAt(displayToISO(v))} />
        <FormSelect label="Forma de pagamento" value={method} options={[{ value: "", label: "Selecione" }, ...(options?.payment_methods ?? [])]} onChange={setMethod} error={error || undefined} />
      </View>
    </Modal>
  );
}
