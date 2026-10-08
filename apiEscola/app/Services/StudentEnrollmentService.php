<?php

namespace App\Services;

use App\Models\Student;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StudentEnrollmentService
{
    /**
     * IDs de cursos com matrícula ativa e vigente para o aluno.
     *
     * @return Collection<int, int>
     */
    public function activeCourseIdsForStudent(Student $student): Collection
    {
        $today = now()->toDateString();

        $fromEnrollment = DB::table('enrollments')
            ->leftJoin('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->leftJoin('school_classes', 'enrollments.school_class_id', '=', 'school_classes.id')
            ->where('enrollments.student_id', $student->id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                    ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->selectRaw('COALESCE(course_plans.course_id, school_classes.course_id) as course_id')
            ->whereNotNull(DB::raw('COALESCE(course_plans.course_id, school_classes.course_id)'))
            ->pluck('course_id');

        $fromPivot = DB::table('enrollment_school_classes')
            ->join('enrollments', 'enrollment_school_classes.enrollment_id', '=', 'enrollments.id')
            ->join('school_classes', 'enrollment_school_classes.school_class_id', '=', 'school_classes.id')
            ->where('enrollments.student_id', $student->id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                    ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->pluck('school_classes.course_id');

        return $fromEnrollment
            ->merge($fromPivot)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    public function hasActiveEnrollmentInCourse(Student $student, int $courseId): bool
    {
        return $this->activeCourseIdsForStudent($student)->contains($courseId);
    }

    /**
     * IDs das turmas (coluna legada ou pivot) das matrículas ativas e vigentes do aluno.
     *
     * @return Collection<int, int>
     */
    public function activeSchoolClassIdsForStudent(Student $student): Collection
    {
        $today = now()->toDateString();
        $active = fn () => DB::table('enrollments')
            ->where('enrollments.student_id', $student->id)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(fn ($q) => $q->whereNull('enrollments.end_date')->orWhere('enrollments.end_date', '>=', $today))
            ->whereNull('enrollments.deleted_at');

        $fromEnrollment = $active()->whereNotNull('enrollments.school_class_id')->pluck('enrollments.school_class_id');
        $fromPivot = $active()
            ->join('enrollment_school_classes', 'enrollment_school_classes.enrollment_id', '=', 'enrollments.id')
            ->pluck('enrollment_school_classes.school_class_id');

        return $fromEnrollment->merge($fromPivot)->map(fn ($id) => (int) $id)->unique()->values();
    }

    /**
     * Disciplinas da grade horária das turmas ativas do aluno.
     *
     * @return Collection<int, int>
     */
    public function activeSubjectIdsForStudent(Student $student): Collection
    {
        $classIds = $this->activeSchoolClassIdsForStudent($student);
        if ($classIds->isEmpty()) {
            return collect();
        }

        return DB::table('class_schedules')
            ->join('school_classes', 'school_classes.id', '=', 'class_schedules.school_class_id')
            ->whereIn('class_schedules.school_class_id', $classIds)
            ->where('class_schedules.tenant_id', $student->tenant_id)
            ->whereNull('class_schedules.deleted_at')
            ->whereNull('school_classes.deleted_at')
            ->whereNotNull('class_schedules.subject_id')
            ->distinct()
            ->pluck('class_schedules.subject_id')
            ->map(fn ($id) => (int) $id)
            ->values();
    }
}
