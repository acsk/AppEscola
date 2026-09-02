<?php

namespace Tests\Unit;

use App\Models\Student;
use App\Services\StudentAcademicHistoryService;
use App\Services\StudentPerformanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\SeedsDomainLookups;
use Tests\TestCase;

class StudentAcademicHistoryServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsDomainLookups;

    public function test_empty_history_structure(): void
    {
        $student = Student::factory()->create([
            'name' => 'Aluno Histórico',
        ]);

        $service = new StudentAcademicHistoryService(new StudentPerformanceService);
        $result = $service->build($student);

        $this->assertSame($student->id, $result['student']['id']);
        $this->assertSame('Aluno Histórico', $result['student']['name']);
        $this->assertSame(0, $result['summary']['enrollments_count']);
        $this->assertSame(0, $result['summary']['attempts_count']);
        $this->assertSame([], $result['enrollments']);
        $this->assertSame([], $result['exam_attempts']);
    }
}
