<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Student;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Bloqueio de matrícula: o aluno perde o acesso ao app enquanto houver matrícula não cancelada bloqueada.
 * O status da matrícula e a cobrança seguem iguais; só o acesso do aluno é barrado.
 */
class EnrollmentAccessBlockService
{
    public const MESSAGE = 'Seu acesso ao app foi bloqueado pela instituição. Procure a secretaria.';

    private const CACHE_TTL = 60;

    public function block(Enrollment $enrollment, string $reason, User $by): Enrollment
    {
        $enrollment->update([
            'blocked_at' => now(),
            'blocked_reason' => $reason,
            'blocked_by' => $by->id,
        ]);

        $studentUser = $this->studentUser($enrollment);
        $studentUser?->tokens()->delete();
        $this->forget($studentUser);

        return $enrollment;
    }

    public function unblock(Enrollment $enrollment): Enrollment
    {
        $enrollment->update(['blocked_at' => null, 'blocked_reason' => null, 'blocked_by' => null]);
        $this->forget($this->studentUser($enrollment));

        return $enrollment;
    }

    public function isStudentUserBlocked(User $user): bool
    {
        return Cache::remember(self::cacheKey($user->id), self::CACHE_TTL, function () use ($user): bool {
            $studentId = Student::query()->where('user_id', $user->id)->value('id');

            return $studentId !== null && Enrollment::query()
                ->where('student_id', $studentId)
                ->whereNotNull('blocked_at')
                ->where('status', '!=', 'cancelled')
                ->exists();
        });
    }

    private function studentUser(Enrollment $enrollment): ?User
    {
        return $enrollment->student()->with('user')->first()?->user;
    }

    private function forget(?User $user): void
    {
        if ($user) {
            Cache::forget(self::cacheKey($user->id));
        }
    }

    private static function cacheKey(int $userId): string
    {
        return "student:access-blocked:{$userId}";
    }
}
