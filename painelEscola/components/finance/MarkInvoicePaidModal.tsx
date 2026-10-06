import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import Modal from "../ui/Modal";
import FormInput from "../ui/FormInput";
import FormSelect from "../ui/FormSelect";
import DatePickerInput from "../ui/DatePickerInput";
import { usePaymentMethods } from "../../hooks/useDomains";
import { parseApiErrors } from "../../utils/apiErrors";
import { markInvoiceAsPaid } from "../../services/invoices";
import {
  manualPaymentMethodOptions,
  paymentMethodLabel,
  requiresCardPaymentReference,
} from "../../utils/paymentMethods";
import { displayToISO, isoToDisplay } from "../../utils/masks";

const todayDisplay = () => isoToDisplay(new Date().toISOString().slice(0, 10));

import type { InvoiceListItem } from "../../types/matriculas";

type Props = {
  visible: boolean;
  invoice: InvoiceListItem | null;
  onClose: () => void;
  onSuccess: (message?: string) => void;
};

export default function MarkInvoicePaidModal({
  visible,
  invoice,
  onClose,
  onSuccess,
}: Props) {
  const paymentMethods = usePaymentMethods();
  const methodOptions = manualPaymentMethodOptions(paymentMethods);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paidAt, setPaidAt] = useState(todayDisplay());
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPaymentMethod("");
    setPaidAt(todayDisplay());
    setPaymentReference("");
    setNotes("");
    setErrors({});
    setSubmitError(null);
  }, [visible, invoice?.id]);

  const submit = async () => {
    if (!invoice) return;

    const localErrors: Record<string, string> = {};
    if (!paymentMethod) localErrors.payment_method = "Selecione a forma de pagamento.";
    if (requiresCardPaymentReference(paymentMethod) && !paymentReference.trim()) {
      localErrors.payment_reference =
        "Informe o identificador da transação (NSU, autorização ou comprovante).";
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    setSubmitError(null);

    try {
      const result = await markInvoiceAsPaid(invoice.id, {
        payment_method: paymentMethod,
        paid_at: displayToISO(paidAt) || undefined,
        payment_reference: paymentReference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess(result.message);
      onClose();
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data.errors ?? {}));
        if (e.response.data?.message) setSubmitError(e.response.data.message);
      } else {
        setSubmitError("Não foi possível registrar a baixa. Tente novamente.");
      }
    }

    setSaving(false);
  };

  const showCardReference = requiresCardPaymentReference(paymentMethod);

  return (
    <Modal
      visible={visible}
      title="Dar baixa na cobrança"
      onClose={onClose}
      size="md"
      footer={
        <>
          <TouchableOpacity
            onPress={onClose}
            className="px-5 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center"
          >
            <Text className="text-sm font-semibold text-ink">Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={submit}
            disabled={saving || !invoice}
            className="px-5 py-2.5 rounded-ds-md bg-emerald-600"
          >
            {saving ? (
              <ActivityIndicator color="var(--ds-on-brand)" size="small" />
            ) : (
              <Text className="text-sm font-medium text-on-brand">Confirmar baixa</Text>
            )}
          </TouchableOpacity>
        </>
      }
    >
      {invoice ? (
        <View className="gap-3">
          <View className="rounded-ds-md border border-border bg-surface-sunken px-4 py-3">
            <Text className="text-xs font-mono font-semibold text-brand" numberOfLines={1}>
              ID #{invoice.id}
              {invoice.cora?.charge_id ? ` · Cora ${invoice.cora.charge_id}` : ""}
            </Text>
            <Text className="text-sm font-semibold text-ink mt-0.5" numberOfLines={2}>
              {invoice.description}
            </Text>
            <Text className="text-xs text-ink-muted mt-1">
              Valor: R$ {parseFloat(invoice.amount).toFixed(2)}
              {invoice.student?.name ? ` · ${invoice.student.name}` : ""}
            </Text>
          </View>

          {invoice.settlement_hint ? (
            <View className="rounded-ds-md border border-warning bg-warning-tint px-4 py-3">
              <Text className="text-xs text-warning">{invoice.settlement_hint}</Text>
            </View>
          ) : null}

          <FormSelect
            label="Forma de pagamento"
            required
            value={paymentMethod}
            options={methodOptions}
            onChange={setPaymentMethod}
            error={errors.payment_method}
          />

          <DatePickerInput
            label="Data do pagamento"
            required
            value={paidAt}
            onChangeText={setPaidAt}
            error={errors.paid_at}
          />

          {showCardReference ? (
            <FormInput
              label="Identificador da transação"
              required
              value={paymentReference}
              onChangeText={setPaymentReference}
              error={errors.payment_reference}
              placeholder="Ex: NSU 123456, autorização 789012"
            />
          ) : null}

          <FormInput
            label="Observações"
            value={notes}
            onChangeText={setNotes}
            error={errors.notes}
            placeholder="Ex: Pago na recepção"
            multiline
          />

          {paymentMethod ? (
            <View className="flex-row items-center gap-2 bg-success-tint border border-success rounded-ds-md px-3 py-2">
              <Text className="text-xs text-success flex-1">
                A cobrança será marcada como paga via{" "}
                <Text className="font-semibold">{paymentMethodLabel(paymentMethod)}</Text>.
              </Text>
            </View>
          ) : null}

          {submitError ? (
            <Text className="text-xs text-danger">{submitError}</Text>
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}
