<?php

namespace App\Support;

use App\Models\CalendarEvent;
use App\Models\Exam;

class CalendarEventTypeResolver
{
    public static function isPresentialExam(Exam $exam): bool
    {
        $slug = strtolower((string) ($exam->examType?->slug ?? ''));
        $label = strtolower((string) ($exam->examType?->label ?? ''));

        if ($slug === 'presencial' || str_contains($label, 'presencial')) {
            return true;
        }

        return self::titleIndicatesPresential((string) $exam->title);
    }

    public static function calendarTypeForExam(Exam $exam): string
    {
        return self::isPresentialExam($exam) ? 'exam_presential' : 'exam';
    }

    public static function displayTypeForEvent(CalendarEvent $event): string
    {
        if ($event->type === 'exam_presential') {
            return 'exam_presential';
        }

        if ($event->type === 'exam' || $event->source_type === 'exam') {
            if (self::titleIndicatesPresential((string) $event->title)) {
                return 'exam_presential';
            }
        }

        return (string) $event->type;
    }

    /**
     * @return array{label: string, icon: string, color: string}
     */
    public static function metaForType(string $type): array
    {
        $meta = config('calendar_events.types.'.$type, []);

        return [
            'label' => (string) ($meta['label'] ?? $type),
            'icon'  => (string) ($meta['icon'] ?? 'calendar'),
            'color' => (string) ($meta['color'] ?? '#64748B'),
        ];
    }

    private static function titleIndicatesPresential(string $title): bool
    {
        return (bool) preg_match('/simulado\s+presencial/i', $title);
    }
}
