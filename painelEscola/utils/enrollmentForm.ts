import {
  currencyToFloat,
  displayToISO,
  isWithinDbDecimalAmount,
  parsePaymentDueDay,
} from "./masks";
import type { EnrollmentEditFormValues } from "../types/matriculas";

export function enrollmentAmountsFromForm(form: EnrollmentEditFormValues): {
  monthly: number | null;
  discount: number;
} {
  const monthly =
    form.monthly_amount.trim() === "" ? null : currencyToFloat(form.monthly_amount);
  const discount = currencyToFloat(form.discount_amount || "0");

  return { monthly, discount };
}

export function enrollmentNetMonthlyPreview(form: EnrollmentEditFormValues): number | null {
  const { monthly, discount } = enrollmentAmountsFromForm(form);
  if (monthly === null) return null;

  return Math.max(0, monthly - discount);
}

export function validateEnrollmentEditForm(
  form: EnrollmentEditFormValues,
  options: { financialLocked?: boolean } = {}
): Record<string, string> {
  const errors: Record<string, string> = {};
  const locked = options.financialLocked === true;

  if (!form.school_class_id.trim()) {
    errors.school_class_id = "Selecione a turma.";
  }

  if (!locked) {
    if (!form.start_date.trim()) {
      errors.start_date = "Informe a data de início.";
    } else if (!displayToISO(form.start_date)) {
      errors.start_date = "Data de início inválida.";
    }

    if (form.end_date.trim() && !displayToISO(form.end_date)) {
      errors.end_date = "Data de término inválida.";
    }

    const { monthly, discount } = enrollmentAmountsFromForm(form);

    if (monthly !== null && !isWithinDbDecimalAmount(monthly)) {
      errors.monthly_amount = "Valor máximo: R$ 99.999.999,99.";
    }

    if (!isWithinDbDecimalAmount(discount)) {
      errors.discount_amount = "Valor máximo: R$ 99.999.999,99.";
    }

    if (monthly !== null && discount > monthly) {
      errors.discount_amount = "O desconto não pode ser maior que a mensalidade.";
    }
  }

  if (form.payment_due_day.trim()) {
    const day = parsePaymentDueDay(form.payment_due_day);
    if (day === null) {
      errors.payment_due_day = "Informe um dia entre 1 e 28.";
    }
  }

  return errors;
}
