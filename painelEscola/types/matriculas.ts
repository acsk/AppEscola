import type {
  CourseRef,
  GuardianRef,
  SchoolClassRef,
  SchoolClassWithSchedules,
  StudentRef,
} from "./entities";
import type { WithNavigate } from "./navigation";

export type CoursePlanSummary = {
  id: number;
  name: string;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  enrollment_fee_amount?: string | number;
  course?: CourseRef;
  monthly_equivalent?: string;
};

export type CourseSummary = CourseRef & {
  enrollment_fee_amount?: string | number;
};

export type BundleSummary = {
  id: number;
  name: string;
  billing_cycle: string;
  cycle_label: string;
  price: string;
  monthly_equivalent: string;
  courses: CourseRef[];
};

export type EnrollmentSummary = {
  id: number;
  enrollment_number: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  monthly_amount: string | null;
  discount_amount: string | null;
  /** Valor da mensalidade após desconto (base − desconto). */
  net_monthly_amount?: string | null;
  payment_due_day: number | null;
  student?: StudentRef;
  school_class?: SchoolClassRef;
  guardian?: GuardianRef;
  course_plan?: CoursePlanSummary;
  created_at?: string;
};

export type EnrollmentDetail = EnrollmentSummary & {
  invoices?: InvoiceListItem[];
  charges_generated_at?: string | null;
  charges_batch_generated?: boolean;
};

export type InvoiceCoraAssets = {
  charge_id?: string;
  status?: string;
  payment_url?: string;
  pix_copy_paste?: string;
  qr_code_image_url?: string;
  boleto_number?: string;
  boleto_digitable?: string;
};

export type InvoiceListItem = {
  id: number;
  description: string;
  amount: string;
  due_date: string;
  status: string;
  payment_method: string | null;
  payment_reference?: string | null;
  paid_at?: string | null;
  notes: string | null;
  type: string | null;
  edit_reason?: string | null;
  created_by_user?: { id: number; name: string } | null;
  updated_by_user?: { id: number; name: string } | null;
  cora?: InvoiceCoraAssets;
  student?: StudentRef;
  guardian?: GuardianRef;
  enrollment_id: number | null;
  can_edit?: boolean;
  can_cancel?: boolean;
  can_delete?: boolean;
  requires_cora_cancel_before_delete?: boolean;
  cancel_block_reason?: string | null;
  delete_block_reason?: string | null;
  lifecycle_hint?: string | null;
  has_active_gateway_charge?: boolean;
  will_cancel_gateway_on_settlement?: boolean;
  settlement_hint?: string | null;
};

export type EnrollmentEditFormValues = {
  student_id: string;
  school_class_id: string;
  start_date: string;
  end_date: string;
  status: string;
  monthly_amount: string;
  discount_amount: string;
  payment_due_day: string;
};

export type InvoiceFormValues = {
  description: string;
  amount: string;
  due_date: string;
  status: string;
  type: string;
  payment_method: string;
  notes: string;
  edit_reason: string;
};

export type SubscribeInvoiceResult = {
  id: number;
  description: string;
  amount: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
};

export type EnrollmentsScreenProps = WithNavigate;

export type EnrollmentFormScreenProps = WithNavigate;

export type EnrollmentDetailScreenProps = WithNavigate & {
  enrollmentId: number;
};

export type { SchoolClassWithSchedules };
