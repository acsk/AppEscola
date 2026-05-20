<?php

namespace Tests\Unit;

use App\Models\Exam;
use App\Services\ExamAttemptIntegrityService;
use Carbon\Carbon;
use Tests\TestCase;

class ExamAttemptIntegrityServiceTest extends TestCase
{
    public function test_resolve_expires_at_returns_null_when_duration_not_set(): void
    {
        $service = new ExamAttemptIntegrityService;
        $exam = new Exam(['duration_minutes' => null]);

        $this->assertNull($service->resolveExpiresAt($exam, Carbon::parse('2026-05-19 10:00:00')));
    }

    public function test_resolve_expires_at_returns_null_when_duration_is_zero(): void
    {
        $service = new ExamAttemptIntegrityService;
        $exam = new Exam(['duration_minutes' => 0]);

        $this->assertNull($service->resolveExpiresAt($exam));
    }

    public function test_resolve_expires_at_adds_minutes_when_duration_set(): void
    {
        $service = new ExamAttemptIntegrityService;
        $exam = new Exam(['duration_minutes' => 90]);
        $startedAt = Carbon::parse('2026-05-19 10:00:00');

        $expiresAt = $service->resolveExpiresAt($exam, $startedAt);

        $this->assertNotNull($expiresAt);
        $this->assertTrue($expiresAt->equalTo($startedAt->copy()->addMinutes(90)));
    }
}
