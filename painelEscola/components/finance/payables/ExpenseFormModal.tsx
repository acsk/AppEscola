import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import FormSelect from "../../ui/FormSelect";
import DatePickerInput from "../../ui/DatePickerInput";
import { color } from "../../../constants/theme";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { getApiResponseMessage, parseApiErrors } from "../../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../../utils/masks";
import {
  createExpense,
  updateExpense,
  type ExpenseDetail,
  type ExpenseInput,
  type PayablesOptions,
} from "../../../services/payables";

type Props = {
  visible: boolean;
  options: PayablesOptions | null;
  /** Edição quando informado. */
  expense: ExpenseDetail | null;
  onClose: () => void;
  onSaved: (message: string, expense: ExpenseDetail) => void;
};

/** "4.800,00", "4800.5", "R$ 39,90" → número. */
const parseAmount = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

const fmtAmount = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cadastro e edição de despesa. Despesa aprovada que muda valor, vencimento ou fornecedor volta para aprovação. */
export default function ExpenseFormModal({ visible, options, expense, onClose, onSaved }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "monthly">("none");
  const [autoDebit, setAutoDebit] = useState(false);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState<"draft" | "submit" | "save" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDescription(expense?.description ?? "");
    setSupplierId(expense?.supplier ? String(expense.supplier.id) : "");
    setCategoryId(expense?.category ? String(expense.category.id) : "");
    setCostCenterId(expense?.cost_center ? String(expense.cost_center.id) : "");
    setAmount(expense ? fmtAmount(expense.amount) : "");
    setDueDate(expense?.due_date ?? "");
    setRecurrence(expense?.recurrence ?? "none");
    setAutoDebit(expense?.auto_debit ?? false);
    setNotes(expense?.notes ?? "");
    setReason("");
    setErrors({});
    setSubmitError("");
  }, [visible, expense]);

  const approved = expense?.status === "approved";

  const save = async (mode: "draft" | "submit" | "save") => {
    const local: Record<string, string> = {};
    const value = parseAmount(amount);
    if (!description.trim()) local.description = "Informe a descrição.";
    if (!Number.isFinite(value) || value <= 0) local.amount = "Informe um valor maior que zero.";
    if (!dueDate) local.due_date = "Informe o vencimento.";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    const input: ExpenseInput = {
      description: description.trim(),
      supplier_id: supplierId ? Number(supplierId) : null,
      category_id: categoryId ? Number(categoryId) : null,
      cost_center_id: costCenterId ? Number(costCenterId) : null,
      amount: Math.round(value * 100) / 100,
      due_date: dueDate,
      recurrence,
      auto_debit: autoDebit,
      notes: notes.trim() || null,
    };

    setSaving(mode);
    setErrors({});
    setSubmitError("");
    try {
      const result = expense
        ? await updateExpense(expense.id, { ...input, reason: reason.trim() || undefined })
        : await createExpense({ ...input, submit: mode === "submit" });
      onSaved(result.message, result.expense);
    } catch (err: any) {
      const data = err?.response?.data;
      setErrors(parseApiErrors(data?.errors ?? {}));
      setSubmitError(getApiResponseMessage(data, "Não foi possível salvar a despesa."));
    } finally {
      setSaving(null);
    }
  };

  const select = (list: { id: number; name: string }[] | undefined, empty: string) => [
    { value: "", label: empty },
    ...(list ?? []).map((item) => ({ value: String(item.id), label: item.name })),
  ];

  const half = { flex: 1, minWidth: isMobile ? "100%" : 220 } as const;

  return (
    <Modal
      visible={visible}
      title={expense ? `Editar despesa ${expense.code}` : "Nova despesa"}
      onClose={onClose}
      size="lg"
      footer={
        <View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>
          <Button variant="ghost" label="Cancelar" onPress={onClose} disabled={!!saving} />
          {expense ? (
            <Button variant="primary" label="Salvar" loading={saving === "save"} disabled={!!saving} onPress={() => save("save")} />
          ) : (
            <>
              <Button variant="secondary" label="Salvar rascunho" loading={saving === "draft"} disabled={!!saving} onPress={() => save("draft")} />
              <Button variant="primary" label="Enviar para aprovação" loading={saving === "submit"} disabled={!!saving} onPress={() => save("submit")} />
            </>
          )}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <FormInput label="Descrição" required value={description} onChangeText={setDescription} error={errors.description} maxLength={160} placeholder="Ex.: Aluguel da sede" />
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={half}>
            <FormSelect label="Fornecedor" value={supplierId} options={select(options?.suppliers, "Sem fornecedor")} onChange={setSupplierId} error={errors.supplier_id} />
          </View>
          <View style={half}>
            <FormSelect label="Categoria" value={categoryId} options={select(options?.categories, "Sem categoria")} onChange={setCategoryId} error={errors.category_id} />
          </View>
        </View>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={half}>
            <FormSelect label="Centro de custo" value={costCenterId} options={select(options?.cost_centers, "Sem centro de custo")} onChange={setCostCenterId} />
          </View>
          <View style={half}>
            <FormInput label="Valor (R$)" required value={amount} onChangeText={setAmount} error={errors.amount} keyboardType="decimal-pad" placeholder="0,00" />
          </View>
        </View>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          <View style={half}>
            <DatePickerInput
              label="Vencimento"
              required
              value={dueDate ? isoToDisplay(dueDate) : ""}
              onChangeText={(v) => setDueDate(displayToISO(v))}
              error={errors.due_date}
            />
          </View>
          <View style={half}>
            <FormSelect
              label="Recorrência"
              value={recurrence}
              options={[
                { value: "none", label: "Avulsa" },
                { value: "monthly", label: "Mensal (gera os próximos meses)" },
              ]}
              onChange={(v) => setRecurrence(v as "none" | "monthly")}
            />
          </View>
        </View>

        <Pressable
          role="checkbox"
          aria-checked={autoDebit}
          onPress={() => setAutoDebit((v) => !v)}
          className="flex-row items-start"
          style={{ gap: 10 }}
        >
          <View
            className="items-center justify-center rounded-ds-sm"
            style={{ width: 18, height: 18, marginTop: 1, borderWidth: 1.5, borderColor: autoDebit ? color.brand : color["border-strong"], backgroundColor: autoDebit ? color.brand : "transparent" }}
          >
            {autoDebit ? <Check size={12} color={color["on-brand"]} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text className="text-sm text-ink">Débito automático</Text>
            <Text className="text-xs text-ink-muted">O banco debita sozinho no vencimento; a despesa fica “Aguardando vínculo” até a saída aparecer no extrato.</Text>
          </View>
        </Pressable>

        <FormInput label="Observações" value={notes} onChangeText={setNotes} multiline numberOfLines={3} maxLength={1000} style={{ minHeight: 64, textAlignVertical: "top" }} />

        {approved ? (
          <View style={{ gap: 8 }}>
            <Text className="text-xs text-warning">Mudar valor, vencimento ou fornecedor devolve a despesa para aprovação.</Text>
            <FormInput label="Motivo da alteração" value={reason} onChangeText={setReason} maxLength={500} placeholder="Ex.: reajuste anual do contrato" />
          </View>
        ) : null}

        {submitError ? (
          <Text className="text-sm text-danger" aria-live="polite">
            {submitError}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}
