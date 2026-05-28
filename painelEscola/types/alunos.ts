import type { DesiredCourseRef, GuardianRef, StudentRef } from "./entities";
import type { WithNavigate } from "./navigation";

export type StudentListItem = StudentRef & {
  birth_date: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  is_minor: boolean;
  status: string;
  desired_courses?: DesiredCourseRef[];
  desired_course_id?: number | null;
  desired_course?: DesiredCourseRef | null;
  guardians?: GuardianRef[];
};

export type StudentPickerItem = StudentRef & {
  document?: string | null;
  birth_date?: string | null;
};

export type StudentFormValues = {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  is_minor: string;
  status: string;
};

export type GuardianFormValues = {
  mode: "new" | "existing";
  guardian_id: number | null;
  name: string;
  document: string;
  email: string;
  phone: string;
  relationship: string;
  is_financial_responsible: boolean;
  is_pedagogical_responsible: boolean;
  can_access_portal: boolean;
};

export type GuardianSelectOption = {
  value: string;
  label: string;
  sublabel?: string;
  document?: string;
  email?: string;
};

export type StudentsScreenProps = WithNavigate;

export type StudentFormScreenProps = WithNavigate & {
  studentId: number | null;
};

export type StudentPerformanceScreenProps = WithNavigate & {
  studentId: number;
  studentName?: string;
};

export type StudentReportCardScreenProps = WithNavigate & {
  studentId: number;
  studentName?: string;
};
