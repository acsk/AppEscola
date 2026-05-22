export type StudentEnrollmentCourse = {
  id: number;
  name: string;
};

export type StudentEnrollmentSchoolClass = {
  id: number;
  name: string;
  course: StudentEnrollmentCourse | null;
};

export type StudentActiveEnrollment = {
  id: number;
  enrollment_number: string | null;
  status: string;
  enrollment_type: 'plan' | 'bundle';
  school_class: { id: number; name: string } | null;
  school_classes: StudentEnrollmentSchoolClass[];
  courses: StudentEnrollmentCourse[];
  course: StudentEnrollmentCourse | null;
  course_plan: { id: number; name: string } | null;
  bundle: { id: number; name: string; cycle_label: string } | null;
};

export function primaryActiveEnrollment(
  enrollments: StudentActiveEnrollment[] | undefined
): StudentActiveEnrollment | null {
  if (!enrollments?.length) return null;
  return enrollments[0];
}

export function enrollmentHeadline(enrollment: StudentActiveEnrollment): string {
  if (enrollment.bundle) {
    return enrollment.bundle.name;
  }
  return (
    enrollment.course?.name ??
    enrollment.school_class?.name ??
    enrollment.course_plan?.name ??
    'Matrícula ativa'
  );
}
