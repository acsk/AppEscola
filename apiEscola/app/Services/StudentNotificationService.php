<?php

namespace App\Services;

use App\Models\Course;
use App\Models\NotificationBroadcast;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\StudentNotification;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StudentNotificationService
{
    public function __construct(
        private readonly NotificationCalendarSyncService $calendarSync,
    ) {}
    /**
     * @param  array<string, mixed>  $audienceParams
     * @param  array<string, mixed>|null  $data
     */
    public function send(
        int $tenantId,
        User $sender,
        string $type,
        string $title,
        string $body,
        string $audienceType,
        array $audienceParams,
        ?array $data = null,
        bool $showOnCalendar = false,
        ?Carbon $startsAt = null,
        ?Carbon $endsAt = null,
    ): NotificationBroadcast {
        $studentIds = $this->resolveStudentIds($tenantId, $audienceType, $audienceParams);

        return DB::transaction(function () use (
            $tenantId,
            $sender,
            $type,
            $title,
            $body,
            $audienceType,
            $audienceParams,
            $data,
            $studentIds,
            $showOnCalendar,
            $startsAt,
            $endsAt,
        ) {
            $broadcast = NotificationBroadcast::create([
                'tenant_id'         => $tenantId,
                'type'              => $type,
                'title'             => $title,
                'body'              => $body,
                'audience_type'     => $audienceType,
                'audience_params'   => $audienceParams,
                'data'              => $data,
                'show_on_calendar'  => $showOnCalendar,
                'starts_at'         => $showOnCalendar ? $startsAt : null,
                'ends_at'           => $showOnCalendar ? $endsAt : null,
                'sent_by_user_id'   => $sender->id,
                'recipients_count'  => 0,
            ]);

            if ($showOnCalendar && $startsAt && $endsAt) {
                $this->calendarSync->syncFromBroadcast($broadcast, $sender, $startsAt, $endsAt);
            }

            if ($studentIds->isEmpty()) {
                return $broadcast;
            }

            $now = now();
            $rows = [];

            Student::query()
                ->where('tenant_id', $tenantId)
                ->whereIn('id', $studentIds)
                ->whereNotNull('user_id')
                ->get(['id', 'user_id'])
                ->each(function (Student $student) use (
                    &$rows,
                    $tenantId,
                    $broadcast,
                    $type,
                    $title,
                    $body,
                    $data,
                    $now,
                ) {
                    $rows[] = [
                        'tenant_id'    => $tenantId,
                        'broadcast_id' => $broadcast->id,
                        'student_id'   => $student->id,
                        'user_id'      => $student->user_id,
                        'type'         => $type,
                        'title'        => $title,
                        'body'         => $body,
                        'data'         => $data !== null ? json_encode($data) : null,
                        'read_at'      => null,
                        'created_at'   => $now,
                        'updated_at'   => $now,
                    ];
                });

            foreach (array_chunk($rows, 500) as $chunk) {
                StudentNotification::insert($chunk);
            }

            $broadcast->update(['recipients_count' => count($rows)]);

            return $broadcast->fresh(['sentBy']);
        });
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function resolveStudentIds(int $tenantId, string $audienceType, array $params): Collection
    {
        $base = Student::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNotNull('user_id');

        return match ($audienceType) {
            'tenant' => (clone $base)->pluck('id'),
            'student' => (clone $base)->where('id', (int) ($params['student_id'] ?? 0))->pluck('id'),
            'students' => (clone $base)->whereIn('id', $params['student_ids'] ?? [])->pluck('id'),
            'school_class' => $this->studentsFromSchoolClass($tenantId, (int) ($params['school_class_id'] ?? 0)),
            'course' => $this->studentsFromCourse($tenantId, (int) ($params['course_id'] ?? 0)),
            default => collect(),
        };
    }

    public function previewRecipientCount(int $tenantId, string $audienceType, array $params): int
    {
        return $this->resolveStudentIds($tenantId, $audienceType, $params)->count();
    }

    public function assertAudienceBelongsToTenant(int $tenantId, string $audienceType, array $params): void
    {
        match ($audienceType) {
            'course' => Course::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) ($params['course_id'] ?? 0))
                ->exists() || abort(422, 'Curso inválido para este tenant.'),
            'school_class' => SchoolClass::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) ($params['school_class_id'] ?? 0))
                ->exists() || abort(422, 'Turma inválida para este tenant.'),
            'student' => Student::query()
                ->where('tenant_id', $tenantId)
                ->whereKey((int) ($params['student_id'] ?? 0))
                ->exists() || abort(422, 'Aluno inválido para este tenant.'),
            'students' => $this->assertStudentsBelongToTenant($tenantId, $params['student_ids'] ?? []),
            default => null,
        };
    }

    private function studentsFromSchoolClass(int $tenantId, int $schoolClassId): Collection
    {
        if ($schoolClassId <= 0) {
            return collect();
        }

        return Student::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNotNull('user_id')
            ->whereHas('enrollments', fn ($q) => $q
                ->where('school_class_id', $schoolClassId)
                ->where('status', 'active'))
            ->pluck('id');
    }

    private function studentsFromCourse(int $tenantId, int $courseId): Collection
    {
        if ($courseId <= 0) {
            return collect();
        }

        return Student::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNotNull('user_id')
            ->whereHas('enrollments', function ($q) use ($courseId) {
                $q->where('status', 'active')
                    ->where(function ($inner) use ($courseId) {
                        $inner->whereHas('schoolClass', fn ($sc) => $sc->where('course_id', $courseId))
                            ->orWhereHas('coursePlan', fn ($cp) => $cp->where('course_id', $courseId));
                    });
            })
            ->distinct()
            ->pluck('id');
    }

    /**
     * @param  list<int>  $studentIds
     */
    private function assertStudentsBelongToTenant(int $tenantId, array $studentIds): void
    {
        $ids = array_values(array_unique(array_map('intval', $studentIds)));

        if ($ids === []) {
            abort(422, 'Informe ao menos um aluno.');
        }

        $found = Student::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $ids)
            ->count();

        if ($found !== count($ids)) {
            abort(422, 'Um ou mais alunos são inválidos para este tenant.');
        }
    }
}
