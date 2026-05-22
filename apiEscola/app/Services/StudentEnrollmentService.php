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
}
