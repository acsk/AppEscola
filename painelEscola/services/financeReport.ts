import api from "./api";

export type FinanceReportBucket = {
  key: string | null;
  count: number;
  amount: string;
};

export type FinanceReportStatus = {
  key: string;
  count: number;
  amount: string;
};

export type FinanceReportMonth = {
  period: string;
  label: string;
  count: number;
  amount: string;
  paid_amount: string;
  open_amount: string;
  overdue_amount: string;
};

export type FinanceReportClass = {
  school_class_id: number | null;
  name: string;
  count: number;
  amount: string;
};

export type FinanceReportItem = {
  id: number;
  description: string;
  amount: string;
  status: string;
  type: string | null;
  payment_method: string | null;
  due_date: string | null;
  paid_at: string | null;
  student_name: string | null;
  school_class_name: string | null;
};

export type FinanceReport = {
  filters: {
    date_basis: "due_date" | "paid_at" | "created_at";
    date_from: string | null;
    date_to: string | null;
    status: string | null;
    payment_method: string | null;
    type: string | null;
    school_class_id: number | null;
    course_id: number | null;
    search: string | null;
  };
  totals: { count: number; amount: string };
  by_status: FinanceReportStatus[];
  by_month: FinanceReportMonth[];
  by_payment_method: FinanceReportBucket[];
  by_type: FinanceReportBucket[];
  by_class: FinanceReportClass[];
  items: FinanceReportItem[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

export type FinanceReportQuery = {
  date_basis?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  payment_method?: string;
  type?: string;
  school_class_id?: number;
  course_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
};

export async function fetchFinanceReport(params: FinanceReportQuery): Promise<FinanceReport> {
  const { data } = await api.get("/reports/finance", { params });
  return data.body ?? data;
}
