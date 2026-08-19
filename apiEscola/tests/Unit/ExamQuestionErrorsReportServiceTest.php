<?php

namespace Tests\Unit;

use App\Services\ExamQuestionErrorsReportService;
use PHPUnit\Framework\TestCase;

class ExamQuestionErrorsReportServiceTest extends TestCase
{
    public function test_compare_places_higher_error_rate_first_and_nulls_last(): void
    {
        $rows = [
            ['order' => 2, 'error_rate' => 40.0, 'wrong_count' => 2],
            ['order' => 1, 'error_rate' => null, 'wrong_count' => 0],
            ['order' => 3, 'error_rate' => 80.0, 'wrong_count' => 4],
            ['order' => 4, 'error_rate' => 80.0, 'wrong_count' => 5],
        ];

        usort($rows, [ExamQuestionErrorsReportService::class, 'compareQuestionErrorRows']);

        $this->assertSame(4, $rows[0]['order']);
        $this->assertSame(3, $rows[1]['order']);
        $this->assertSame(2, $rows[2]['order']);
        $this->assertSame(1, $rows[3]['order']);
    }
}
