<?php

namespace Tests\Unit;

use App\Models\Student;
use App\Services\StudentPerformanceService;
use Tests\TestCase;

class StudentPerformanceServiceTest extends TestCase
{
    public function test_empty_student_returns_zeroed_structure(): void
    {
        $student = new Student(['id' => 999999]);

        $service = new StudentPerformanceService;
        $result = $service->build($student, 3);

        $this->assertSame(999999, $result['student_id']);
        $this->assertSame(3, $result['months']);
        $this->assertSame(0, $result['overview']['total_attempts']);
        $this->assertCount(3, $result['monthly_evolution']);
        $this->assertSame([], $result['by_subject']);
    }
}
