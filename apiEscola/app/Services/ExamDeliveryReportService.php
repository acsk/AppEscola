<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\Student;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ExamDeliveryReportService
{
    /**
     * @return array{
     *   exam: array<string, mixed>,
     *   delivered: array<int, array<string, mixed>>,
     *   pending: array<int, array<string, mixed>>,
     *   summary: array<string, int>
     * }
     */
    public function build(Exam $exam): array
    {
        $exam->loadMissing(['courses', 'course', 'subject', 'examStatus', 'examType']);

        $eligibleStudentIds = $this->eligibleStudentIds($exam);
        $deliveredRows = $this->deliveredAttemptsByStudent($exam->id, $eligibleStudentIds);

        $deliveredStudentIds = $deliveredRows->keys()->map(fn ($id) => (int) $id)->all();
        $pendingStudentIds = $eligibleStudentIds
            ->diff($deliveredStudentIds)
            ->values();

        $students = Student::query()
            ->whereIn('id', $eligibleStudentIds->all())
            ->orderBy('name')
            ->get(['id', 'name', 'enrollment_number'])
            ->keyBy('id');

        $delivered = $deliveredRows
            ->sortBy(fn ($row) => mb_strtolower((string) ($students->get($row['student_id'])?->name ?? '')))
            ->map(function (array $row) use ($students) {
                $student = $students->get($row['student_id']);

                return [
                    'student_id' => $row['student_id'],
                    'name' => $student?->name ?? '—',
                    'enrollment_number' => $student?->enrollment_number,
                    'finished_at' => $row['finished_at'],
                    'attempt_status' => $row['attempt_status'],
                    'attempt_status_label' => $row['attempt_status_label'],
                ];
            })
            ->values()
            ->all();

        $pending = $pendingStudentIds
            ->map(function (int $studentId) use ($students) {
                $student = $students->get($studentId);

                return [
                    'student_id' => $studentId,
                    'name' => $student?->name ?? '—',
                    'enrollment_number' => $student?->enrollment_number,
                ];
            })
            ->sortBy(fn (array $row) => mb_strtolower((string) $row['name']))
            ->values()
            ->all();

        $courseNames = $exam->courses?->pluck('name')->filter()->values()->all() ?? [];
        if ($courseNames === [] && $exam->course) {
            $courseNames = [$exam->course->name];
        }

        return [
            'exam' => [
                'id' => $exam->id,
                'title' => $exam->title,
                'exam_type' => $exam->examType?->slug,
                'exam_type_label' => $exam->examType?->label,
                'status' => $exam->examStatus?->slug,
                'status_label' => $exam->examStatus?->label,
                'courses' => $courseNames,
                'subject' => $exam->subject ? [
                    'id' => $exam->subject->id,
                    'name' => $exam->subject->name,
                ] : null,
            ],
            'delivered' => $delivered,
            'pending' => $pending,
            'summary' => [
                'eligible_students_count' => $eligibleStudentIds->count(),
                'delivered_students_count' => count($delivered),
                'pending_students_count' => count($pending),
            ],
        ];
    }

    /** @return Collection<int, int> */
    private function eligibleStudentIds(Exam $exam): Collection
    {
        $tenantId = (int) $exam->tenant_id;
        $courseIds = $exam->linkedCourseIds()->unique()->values();

        if ($courseIds->isEmpty()) {
            return collect();
        }

        $today = now()->toDateString();
        $eligible = [];

        $fromEnrollment = DB::table('enrollments')
            ->leftJoin('course_plans', 'enrollments.course_plan_id', '=', 'course_plans.id')
            ->leftJoin('school_classes', 'enrollments.school_class_id', '=', 'school_classes.id')
            ->where('enrollments.tenant_id', $tenantId)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                    ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->whereIn(DB::raw('COALESCE(course_plans.course_id, school_classes.course_id)'), $courseIds)
            ->selectRaw('enrollments.student_id, COALESCE(course_plans.course_id, school_classes.course_id) as course_id')
            ->get();

        $fromPivot = DB::table('enrollment_school_classes')
            ->join('enrollments', 'enrollment_school_classes.enrollment_id', '=', 'enrollments.id')
            ->join('school_classes', 'enrollment_school_classes.school_class_id', '=', 'school_classes.id')
            ->where('enrollments.tenant_id', $tenantId)
            ->where('enrollments.status', 'active')
            ->where('enrollments.start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('enrollments.end_date')
                    ->orWhere('enrollments.end_date', '>=', $today);
            })
            ->whereNull('enrollments.deleted_at')
            ->whereIn('school_classes.course_id', $courseIds)
            ->select('enrollments.student_id', 'school_classes.course_id')
            ->get();

        foreach ($fromEnrollment->concat($fromPivot) as $row) {
            if (! $courseIds->contains((int) $row->course_id)) {
                continue;
            }

            $eligible[(int) $row->student_id] = true;
        }

        return collect(array_keys($eligible))->map(fn ($id) => (int) $id)->values();
    }

    /**
     * Última tentativa entregue (finished_at) por aluno elegível.
     *
     * @return Collection<int, array{student_id: int, finished_at: string, attempt_status: string, attempt_status_label: string}>
     */
    private function deliveredAttemptsByStudent(int $examId, Collection $eligibleStudentIds): Collection
    {
        if ($eligibleStudentIds->isEmpty()) {
            return collect();
        }

        $rows = DB::table('exam_attempts')
            ->join('exam_attempt_statuses', 'exam_attempts.attempt_status_id', '=', 'exam_attempt_statuses.id')
            ->where('exam_attempts.exam_id', $examId)
            ->whereIn('exam_attempts.student_id', $eligibleStudentIds->all())
            ->whereNull('exam_attempts.deleted_at')
            ->whereNotNull('exam_attempts.finished_at')
            ->orderByDesc('exam_attempts.finished_at')
            ->get([
                'exam_attempts.student_id',
                'exam_attempts.finished_at',
                'exam_attempt_statuses.slug as attempt_status',
                'exam_attempt_statuses.label as attempt_status_label',
            ]);

        $byStudent = [];

        foreach ($rows as $row) {
            $studentId = (int) $row->student_id;
            if (isset($byStudent[$studentId])) {
                continue;
            }

            $byStudent[$studentId] = [
                'student_id' => $studentId,
                'finished_at' => (string) $row->finished_at,
                'attempt_status' => (string) $row->attempt_status,
                'attempt_status_label' => (string) $row->attempt_status_label,
            ];
        }

        return collect($byStudent);
    }
}
