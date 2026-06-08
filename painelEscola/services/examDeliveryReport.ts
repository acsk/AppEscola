import api from "./api";
import { getApiResponseBody } from "../utils/apiErrors";

export type ExamDeliveryStudentRow = {
  student_id: number;
  name: string;
  enrollment_number: string | null;
};

export type ExamDeliveryDeliveredRow = ExamDeliveryStudentRow & {
  finished_at: string;
  attempt_status: string;
  attempt_status_label: string;
};

export type ExamDeliveryReport = {
  exam: {
    id: number;
    title: string;
    exam_type?: string | null;
    exam_type_label?: string | null;
    status?: string | null;
    status_label?: string | null;
    courses: string[];
    subject: { id: number; name: string } | null;
  };
  delivered: ExamDeliveryDeliveredRow[];
  pending: ExamDeliveryStudentRow[];
  summary: {
    eligible_students_count: number;
    delivered_students_count: number;
    pending_students_count: number;
  };
};

export async function fetchExamDeliveryReport(examId: number): Promise<ExamDeliveryReport> {
  const { data } = await api.get(`/exams/${examId}/delivery-report`);
  const body = getApiResponseBody<ExamDeliveryReport>(data);
  if (!body) {
    throw new Error("Resposta inválida ao carregar relatório de entregas.");
  }
  return body;
}
