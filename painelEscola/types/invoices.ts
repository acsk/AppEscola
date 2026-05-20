import type { GuardianRef, StudentRef } from "./entities";
import type { InvoiceListItem } from "./matriculas";
import type { WithNavigate } from "./navigation";

export type { InvoiceListItem as Invoice };

export type InvoiceFormValues = {
  student_id: string;
  description: string;
  amount: string;
  due_date: string;
  enrollment_id: string;
  guardian_id: string;
  status: string;
  payment_method: string;
  notes: string;
};

export type InvoicesScreenProps = WithNavigate;

export type InvoiceStudentRef = StudentRef;
export type InvoiceGuardianRef = GuardianRef;
