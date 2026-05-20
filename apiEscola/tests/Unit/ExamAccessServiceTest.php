<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\ExamAccessService;
use Tests\TestCase;

class ExamAccessServiceTest extends TestCase
{
    public function test_staff_roles_can_view_answer_keys(): void
    {
        foreach (['super_admin', 'admin', 'secretaria', 'professor'] as $role) {
            $user = new User(['role' => $role]);
            $this->assertTrue(ExamAccessService::canViewAnswerKeys($user));
            $this->assertTrue($user->canViewExamAnswerKeys());
        }
    }

    public function test_student_cannot_view_answer_keys(): void
    {
        $user = new User(['role' => 'aluno']);

        $this->assertFalse(ExamAccessService::canViewAnswerKeys($user));
        $this->assertFalse($user->canViewExamAnswerKeys());
    }

    public function test_guest_cannot_view_answer_keys(): void
    {
        $this->assertFalse(ExamAccessService::canViewAnswerKeys(null));
    }
}
