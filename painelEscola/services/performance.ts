import api from "./api";
import { unwrapApi, type ApiEnvelope } from "../types/api";
import type { StudentPerformance } from "../types/performance";

export type {
  PerformanceBySubject,
  PerformanceMonthSubject,
  PerformanceMonthlyEvolution,
  PerformanceOverview,
  PerformanceStudent,
  PerformanceStudentEnrollment,
  PerformanceSubject,
  StudentPerformance,
} from "../types/performance";

export async function fetchStudentPerformance(
  studentId: number,
  months = 6
): Promise<StudentPerformance> {
  const { data } = await api.get<ApiEnvelope<StudentPerformance>>(
    `/students/${studentId}/performance`,
    { params: { months } }
  );
  return unwrapApi(data);
}
