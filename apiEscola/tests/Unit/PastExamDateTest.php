<?php

namespace Tests\Unit;

use App\Support\PastExamDate;
use Tests\TestCase;

class PastExamDateTest extends TestCase
{
    public function test_parse_iso_date_accepts_valid_value_when_get_last_errors_is_false(): void
    {
        // PHP 8.2+: getLastErrors() retorna false quando não há avisos/erros.
        $parsed = PastExamDate::parseIsoDate('2024-03-15');

        $this->assertNotNull($parsed);
        $this->assertSame('2024-03-15', $parsed->toDateString());
    }

    public function test_parse_iso_date_rejects_invalid_month_without_throwing(): void
    {
        $this->assertNull(PastExamDate::parseIsoDate('2024-13-01'));
    }

    public function test_parse_iso_date_rejects_garbage_without_throwing(): void
    {
        $this->assertNull(PastExamDate::parseIsoDate('invalid-date'));
    }

    public function test_schedule_fields_from_string(): void
    {
        $fields = PastExamDate::scheduleFieldsFromString('2024-03-15');

        $this->assertSame([
            'exam_date' => '2024-03-15',
            'exam_year' => 2024,
        ], $fields);
    }
}
