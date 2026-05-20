<?php

namespace Tests\Unit;

use App\Models\Student;
use App\Services\StudentPerformanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class StudentPerformanceServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_empty_student_returns_zeroed_structure(): void
    {
        $student = Student::factory()->create();

        $service = new StudentPerformanceService;
        $result = $service->build($student, 3);

        $this->assertSame($student->id, $result['student_id']);
        $this->assertSame($student->id, $result['student']['id']);
        $this->assertSame($student->name, $result['student']['name']);
        $this->assertSame(3, $result['months']);
        $this->assertSame(0, $result['overview']['total_attempts']);
        $this->assertCount(3, $result['monthly_evolution']);
        $this->assertSame([], $result['by_subject']);
    }
}
