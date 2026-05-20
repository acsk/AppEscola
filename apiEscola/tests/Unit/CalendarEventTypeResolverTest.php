<?php

namespace Tests\Unit;

use App\Models\CalendarEvent;
use App\Models\Exam;
use App\Models\ExamType;
use App\Support\CalendarEventTypeResolver;
use Tests\TestCase;

class CalendarEventTypeResolverTest extends TestCase
{
    public function test_detects_presential_by_exam_type_slug(): void
    {
        $exam = new Exam(['title' => 'Prova 1']);
        $exam->setRelation('examType', new ExamType(['slug' => 'presencial', 'label' => 'Presencial']));

        $this->assertSame('exam_presential', CalendarEventTypeResolver::calendarTypeForExam($exam));
    }

    public function test_detects_presential_by_title_on_calendar_event(): void
    {
        $event = new CalendarEvent([
            'type'        => 'exam',
            'source_type' => 'exam',
            'title'       => 'Simulado presencial: Matemática',
        ]);

        $this->assertSame('exam_presential', CalendarEventTypeResolver::displayTypeForEvent($event));
        $this->assertSame('#EC4899', CalendarEventTypeResolver::metaForType('exam_presential')['color']);
    }
}
