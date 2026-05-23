<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\Exam;
use App\Support\CalendarEventTypeResolver;

class ExamCalendarSyncService
{
    public function sync(Exam $exam): void
    {
        $exam->loadMissing(['examStatus', 'examType', 'course', 'courses']);

        if (! $exam->isPublished() || (! $exam->starts_at && ! $exam->ends_at)) {
            $this->remove($exam);

            return;
        }

        $startsAt = $exam->starts_at ?? $exam->ends_at;
        $endsAt = $exam->ends_at ?? $exam->starts_at;

        if ($startsAt === null || $endsAt === null) {
            $this->remove($exam);

            return;
        }

        if ($endsAt->lt($startsAt)) {
            $endsAt = $startsAt->copy();
        }

        $type = CalendarEventTypeResolver::calendarTypeForExam($exam);
        $titlePrefix = $type === 'exam_presential' ? 'Simulado presencial: ' : 'Simulado: ';
        $title = str_starts_with($exam->title, 'Simulado')
            ? $exam->title
            : $titlePrefix.$exam->title;

        $linkedCourseIds = $exam->linkedCourseIds();
        $primaryCourseId = $linkedCourseIds->first();

        CalendarEvent::updateOrCreate(
            [
                'source_type' => 'exam',
                'source_id'   => $exam->id,
            ],
            [
                'tenant_id'       => $exam->tenant_id,
                'type'            => $type,
                'title'           => $title,
                'description'     => $exam->description,
                'starts_at'       => $startsAt,
                'ends_at'         => $endsAt,
                'all_day'         => false,
                'course_id'       => $primaryCourseId,
                'school_class_id' => null,
                'location'        => null,
                'audience_type'   => $linkedCourseIds->isEmpty() ? 'tenant' : 'course',
                'audience_params' => $linkedCourseIds->isEmpty()
                    ? null
                    : ['course_id' => $primaryCourseId, 'course_ids' => $linkedCourseIds->values()->all()],
                'is_published'    => true,
                'updated_by'      => $exam->updated_by,
                'created_by'      => $exam->created_by,
            ]
        );
    }

    public function remove(Exam $exam): void
    {
        CalendarEvent::query()
            ->where('source_type', 'exam')
            ->where('source_id', $exam->id)
            ->delete();
    }
}
