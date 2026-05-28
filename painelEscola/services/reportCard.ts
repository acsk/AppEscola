import api from "./api";
import { unwrapApi, type ApiEnvelope } from "../types/api";
import type { StudentReportCard } from "../types/reportCard";

export type {
  ReportCardAssessmentRef,
  ReportCardGradeRow,
  ReportCardSubjectRef,
  ReportCardSubjectSummary,
  StudentReportCard,
} from "../types/reportCard";

export async function fetchStudentReportCard(studentId: number): Promise<StudentReportCard> {
  const { data } = await api.get<ApiEnvelope<StudentReportCard>>(
    `/students/${studentId}/report-card`
  );
  return unwrapApi(data);
}
