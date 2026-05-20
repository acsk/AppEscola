<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\Student;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class CalendarEventVisibilityService
{
    public function __construct(
        private readonly StudentEnrollmentService $enrollmentService,
    ) {}

    /**
     * @return Collection<int, int>
     */
    public function activeSchoolClassIdsForStudent(Student $student): Collection
    {
        $today = now()->toDateString();

        return \Illuminate\Support\Facades\DB::table('enrollments')
            ->where('student_id', $student->id)
            ->where('status', 'active')
            ->where('start_date', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('end_date')->orWhere('end_date', '>=', $today);
            })
            ->whereNull('deleted_at')
            ->whereNotNull('school_class_id')
            ->pluck('school_class_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    public function studentEventsQuery(
        int $tenantId,
        Student $student,
        Carbon $from,
        Carbon $to,
    ): Builder {
        $courseIds = $this->enrollmentService->activeCourseIdsForStudent($student);
        $schoolClassIds = $this->activeSchoolClassIdsForStudent($student);

        return CalendarEvent::query()
            ->where('tenant_id', $tenantId)
            ->where('is_published', true)
            ->where($this->overlapsRange($from, $to))
            ->where(function (Builder $q) use ($student, $courseIds, $schoolClassIds) {
                $q->where('audience_type', 'tenant');

                $q->orWhere(function (Builder $inner) use ($student) {
                    $inner->where('audience_type', 'student')
                        ->where('student_id', $student->id);
                });

                if ($courseIds->isNotEmpty()) {
                    $q->orWhere(function (Builder $inner) use ($courseIds) {
                        $inner->where('audience_type', 'course')
                            ->whereIn('course_id', $courseIds);
                    });
                }

                if ($schoolClassIds->isNotEmpty()) {
                    $q->orWhere(function (Builder $inner) use ($schoolClassIds) {
                        $inner->where('audience_type', 'school_class')
                            ->whereIn('school_class_id', $schoolClassIds);
                    });
                }

                $q->orWhere(function (Builder $inner) use ($student) {
                    $inner->where('audience_type', 'students')
                        ->whereJsonContains('audience_params->student_ids', $student->id);
                });
            })
            ->orderBy('starts_at');
    }

    public function overlapsRange(Carbon $from, Carbon $to): \Closure
    {
        return function (Builder $q) use ($from, $to) {
            $q->where(function (Builder $inner) use ($from, $to) {
                $inner->whereBetween('starts_at', [$from, $to])
                    ->orWhereBetween('ends_at', [$from, $to])
                    ->orWhere(function (Builder $span) use ($from, $to) {
                        $span->where('starts_at', '<=', $from)
                            ->where(function (Builder $end) use ($to) {
                                $end->whereNull('ends_at')
                                    ->orWhere('ends_at', '>=', $to);
                            });
                    });
            });
        };
    }
}
