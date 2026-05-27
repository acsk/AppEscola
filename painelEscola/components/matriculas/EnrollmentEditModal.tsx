import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import FormInput from "../ui/FormInput";
import FormSelect, { type SelectOption } from "../ui/FormSelect";
import DatePickerInput from "../ui/DatePickerInput";
import SearchableSelect from "../ui/SearchableSelect";
import ConfirmModal from "../ui/ConfirmModal";
import { enrollmentNetMonthlyPreview } from "../../utils/enrollmentForm";
import type { EnrollmentEditFormValues } from "../../types/matriculas";
import type { SchoolClassRef } from "../../types/entities";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  financialFieldsLocked: boolean;
  form: EnrollmentEditFormValues;
  setForm: React.Dispatch<React.SetStateAction<EnrollmentEditFormValues>>;
  errors: Record<string, string>;
  statusOptions: SelectOption[];
  classes: SchoolClassRef[];
  initialSchoolClassId?: string;
};

export default function EnrollmentEditModal({
  visible,
  onClose,
  onSubmit,
  saving,
  financialFieldsLocked,
  form,
  setForm,
  errors,
  statusOptions,
  classes,
  initialSchoolClassId = "",
}: Props) {
  const [confirmClassChangeVisible, setConfirmClassChangeVisible] = useState(false);

  const classOptions = useMemo(
    () =>
      classes.map((schoolClass) => ({
        value: String(schoolClass.id),
        label: schoolClass.course?.name
          ? `${schoolClass.name} · ${schoolClass.course.name}`
          : schoolClass.name,
      })),
    [classes]
  );

  const previousClassLabel = useMemo(() => {
    return (
      classOptions.find((opt) => opt.value === initialSchoolClassId)?.label ??
      "turma atual"
    );
  }, [classOptions, initialSchoolClassId]);

  const nextClassLabel = useMemo(() => {
    return (
      classOptions.find((opt) => opt.value === form.school_class_id)?.label ??
      "nova turma"
    );
  }, [classOptions, form.school_class_id]);

  const handleSavePress = () => {
    const classChanged =
      initialSchoolClassId !== "" &&
      form.school_class_id !== "" &&
      form.school_class_id !== initialSchoolClassId;

    if (classChanged) {
      setConfirmClassChangeVisible(true);
      return;
    }

    onSubmit();
  };

  const confirmClassChange = () => {
    setConfirmClassChangeVisible(false);
    onSubmit();
  };

  return (
    <>
      <Modal
        visible={visible}
        title="Editar Matrícula"
        onClose={onClose}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSavePress}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              {saving ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Salvar</Text>
              )}
            </TouchableOpacity>
          </>
        }
      >
        {financialFieldsLocked && (
          <View className="flex-row items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
            <Ionicons name="lock-closed-outline" size={14} color="#D97706" />
            <Text className="text-xs text-amber-800 flex-1">
              Datas, mensalidade e desconto estão bloqueados porque já existem cobranças baixadas nesta matrícula.
            </Text>
          </View>
        )}

        <View className="mb-3">
          <SearchableSelect
            label="Turma"
            required
            placeholder="Selecione a turma"
            modalTitle="Selecionar Turma"
            value={form.school_class_id}
            onChange={(v) => setForm((prev) => ({ ...prev, school_class_id: v }))}
            error={errors.school_class_id}
            options={classOptions}
          />
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1">
            <DatePickerInput
              label="Data de Início"
              required
              value={form.start_date}
              onChangeText={(v) => setForm((prev) => ({ ...prev, start_date: v }))}
              error={errors.start_date}
              disabled={financialFieldsLocked}
            />
          </View>
          <View className="flex-1">
            <DatePickerInput
              label="Data de Término"
              value={form.end_date}
              onChangeText={(v) => setForm((prev) => ({ ...prev, end_date: v }))}
              error={errors.end_date}
              disabled={financialFieldsLocked}
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormSelect
              label="Status"
              value={form.status}
              options={statusOptions}
              onChange={(v) => setForm((prev) => ({ ...prev, status: v }))}
              error={errors.status}
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Vencimento (dia do mês)"
              value={form.payment_due_day}
              onChangeText={(v) => setForm((prev) => ({ ...prev, payment_due_day: v }))}
              error={errors.payment_due_day}
              placeholder="1 a 28"
              valueFormat="dueDay"
            />
          </View>
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1">
            <FormInput
              label="Mensalidade base (R$)"
              value={form.monthly_amount}
              onChangeText={(v) => setForm((prev) => ({ ...prev, monthly_amount: v }))}
              error={errors.monthly_amount}
              placeholder="0,00"
              valueFormat="currency"
              editable={!financialFieldsLocked}
            />
          </View>
          <View className="flex-1">
            <FormInput
              label="Desconto (R$)"
              value={form.discount_amount}
              onChangeText={(v) => setForm((prev) => ({ ...prev, discount_amount: v }))}
              error={errors.discount_amount}
              placeholder="0,00"
              valueFormat="currency"
              editable={!financialFieldsLocked}
            />
          </View>
        </View>

        {!financialFieldsLocked &&
        (form.monthly_amount.trim() || form.discount_amount.trim()) ? (
          <View className="flex-row items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 -mt-1 mb-2">
            <Ionicons name="calculator-outline" size={14} color="#16A34A" />
            <Text className="text-xs text-emerald-800">
              Mensalidade líquida:{" "}
              <Text className="font-bold">
                {(enrollmentNetMonthlyPreview(form) ?? 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </Text>{" "}
              (base − desconto)
            </Text>
          </View>
        ) : null}
      </Modal>

      <ConfirmModal
        visible={confirmClassChangeVisible}
        title="Confirmar troca de turma"
        message={`Tem certeza que deseja alterar de ${previousClassLabel} para ${nextClassLabel}?`}
        confirmLabel="Confirmar mudança"
        cancelLabel="Voltar"
        tone="primary"
        iconName="swap-horizontal-outline"
        onConfirm={confirmClassChange}
        onCancel={() => setConfirmClassChangeVisible(false)}
        loading={saving}
      />
    </>
  );
}
