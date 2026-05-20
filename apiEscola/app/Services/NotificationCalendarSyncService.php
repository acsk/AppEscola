<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\NotificationBroadcast;
use App\Models\User;
use Illuminate\Support\Carbon;

class NotificationCalendarSyncService
{
    public function syncFromBroadcast(
        NotificationBroadcast $broadcast,
        User $sender,
        Carbon $startsAt,
        Carbon $endsAt,
    ): CalendarEvent {
        $calendarType = config(
            'student_notifications.calendar_type_map.'.$broadcast->type,
            'general'
        );

        $endsAt = $endsAt->lt($startsAt) ? $startsAt->copy() : $endsAt;

        [$courseId, $schoolClassId, $studentId, $calendarAudience] = $this->resolveAudienceFields(
            $broadcast->audience_type,
            $broadcast->audience_params ?? [],
        );

        return CalendarEvent::updateOrCreate(
            [
                'source_type' => 'notification_broadcast',
                'source_id'   => $broadcast->id,
            ],
            [
                'tenant_id'       => $broadcast->tenant_id,
                'type'            => $calendarType,
                'title'           => $broadcast->title,
                'description'     => $broadcast->body,
                'starts_at'       => $startsAt,
                'ends_at'         => $endsAt,
                'all_day'         => false,
                'course_id'       => $courseId,
                'school_class_id' => $schoolClassId,
                'student_id'      => $studentId,
                'location'        => null,
                'audience_type'   => $calendarAudience,
                'audience_params' => $broadcast->audience_params,
                'is_published'    => true,
                'created_by'      => $sender->id,
                'updated_by'      => $sender->id,
            ]
        );
    }

    public function removeForBroadcast(NotificationBroadcast $broadcast): void
    {
        CalendarEvent::query()
            ->where('source_type', 'notification_broadcast')
            ->where('source_id', $broadcast->id)
            ->delete();
    }

    /**
     * @param  array<string, mixed>  $audienceParams
     * @return array{0: ?int, 1: ?int, 2: ?int, 3: string}
     */
    private function resolveAudienceFields(string $audienceType, array $audienceParams): array
    {
        return match ($audienceType) {
            'course' => [
                (int) ($audienceParams['course_id'] ?? 0) ?: null,
                null,
                null,
                'course',
            ],
            'school_class' => [
                null,
                (int) ($audienceParams['school_class_id'] ?? 0) ?: null,
                null,
                'school_class',
            ],
            'student' => [
                null,
                null,
                (int) ($audienceParams['student_id'] ?? 0) ?: null,
                'student',
            ],
            'students' => [
                null,
                null,
                null,
                'students',
            ],
            default => [null, null, null, 'tenant'],
        };
    }
}
