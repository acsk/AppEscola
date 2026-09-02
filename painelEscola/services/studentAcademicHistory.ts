import api from "./api";
import { getApiResponseBody } from "../utils/apiErrors";
import type { StudentAcademicHistory } from "../types/academicHistory";

export async function fetchStudentAcademicHistory(
  studentId: number
): Promise<StudentAcademicHistory> {
  const { data } = await api.get(`/students/${studentId}/academic-history`);
  const body =
    getApiResponseBody<StudentAcademicHistory>(data) ??
    (data as { body?: StudentAcademicHistory })?.body ??
    (data as StudentAcademicHistory);

  if (!body?.student?.id) {
    throw new Error("Histórico acadêmico inválido.");
  }

  return {
    student: body.student,
    summary: body.summary ?? {
      enrollments_count: 0,
      active_enrollments_count: 0,
      attempts_count: 0,
      completed_attempts_count: 0,
      average_percentage: null,
      passed_count: 0,
      failed_count: 0,
    },
    enrollments: Array.isArray(body.enrollments) ? body.enrollments : [],
    exam_attempts: Array.isArray(body.exam_attempts) ? body.exam_attempts : [],
  };
}
