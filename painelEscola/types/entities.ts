/** Referências mínimas usadas em listas, selects e relações aninhadas */

export type CourseRef = {
  id: number;
  name: string;
};

export type GuardianRef = {
  id: number;
  name: string;
  document?: string | null;
};

export type StudentRef = {
  id: number;
  name: string;
  enrollment_number?: string | null;
};

export type SchoolClassRef = {
  id: number;
  name: string;
  course?: CourseRef;
};

export type DesiredCourseRef = {
  id: number;
  name: string;
};

export type CourseOption = {
  id: number;
  name: string;
};

export type ClassScheduleRef = {
  id: number;
  weekday: string;
  start_time: string;
  end_time: string;
};

export type SchoolClassWithSchedules = SchoolClassRef & {
  schedules?: ClassScheduleRef[];
};
