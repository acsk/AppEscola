<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAttempt;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class ExamAttemptIntegrityService
{
    /**
     * Calcula o fim do tempo da tentativa quando o simulado define duration_minutes.
     * Sem duração configurada, retorna null (sem limite por cronômetro).
     */
    public function resolveExpiresAt(Exam $exam, ?Carbon $startedAt = null): ?Carbon
    {
        $minutes = (int) ($exam->duration_minutes ?? 0);

        if ($minutes <= 0) {
            return null;
        }

        return ($startedAt ?? now())->copy()->addMinutes($minutes);
    }

    public function abandonIfTimedOut(ExamAttempt $attempt): bool
    {
        if ($attempt->status !== 'in_progress') {
            return false;
        }

        if ($attempt->expires_at === null || $attempt->expires_at->isFuture()) {
            return false;
        }

        $attempt->update([
            'status'      => 'abandoned',
            'finished_at' => now(),
        ]);

        return true;
    }

    /**
     * Encerra tentativas expiradas do aluno no simulado antes de validar nova tentativa.
     */
    public function abandonExpiredInProgressFor(int $examId, int $studentId): int
    {
        $abandoned = 0;

        ExamAttempt::query()
            ->where('exam_id', $examId)
            ->where('student_id', $studentId)
            ->whereStatus('in_progress')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->each(function (ExamAttempt $attempt) use (&$abandoned) {
                if ($this->abandonIfTimedOut($attempt)) {
                    $abandoned++;
                }
            });

        return $abandoned;
    }

    public function abandonAllExpiredInProgress(?int $examId = null): int
    {
        $abandoned = 0;

        ExamAttempt::query()
            ->whereStatus('in_progress')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->when($examId, fn ($q) => $q->where('exam_id', $examId))
            ->chunkById(100, function ($attempts) use (&$abandoned) {
                foreach ($attempts as $attempt) {
                    if ($this->abandonIfTimedOut($attempt)) {
                        $abandoned++;
                    }
                }
            });

        return $abandoned;
    }

    /**
     * Marca como abandonada se o tempo esgotou; lança 422 se a tentativa não puder continuar.
     */
    public function ensureAttemptActive(ExamAttempt $attempt): void
    {
        if ($this->abandonIfTimedOut($attempt)) {
            $attempt->refresh();

            throw ValidationException::withMessages([
                'attempt_id' => ['O tempo do simulado expirou. A tentativa foi encerrada.'],
            ]);
        }

        if ($attempt->status !== 'in_progress') {
            throw ValidationException::withMessages([
                'attempt_id' => ['Esta tentativa já foi finalizada.'],
            ]);
        }
    }

    public function syncMaxScoreFromExam(ExamAttempt $attempt): float
    {
        $exam = $attempt->exam()->first(['id']);

        if (! $exam) {
            return (float) ($attempt->max_score ?: 0);
        }

        $maxScore = $exam->totalPoints();

        if ((float) $attempt->max_score !== $maxScore) {
            $attempt->update(['max_score' => $maxScore]);
        }

        return $maxScore;
    }

    /**
     * Melhor tentativa concluída por aluno (maior percentual; desempate por finished_at).
     *
     * @return Collection<int, ExamAttempt>
     */
    public function bestCompletedAttemptsForExam(int $examId, ?int $tenantId = null): Collection
    {
        return ExamAttempt::query()
            ->with('student:id,name,enrollment_number')
            ->where('exam_id', $examId)
            ->whereStatus('completed')
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->orderByDesc('percentage')
            ->orderByDesc('finished_at')
            ->get(['id', 'tenant_id', 'exam_id', 'student_id', 'score', 'max_score', 'percentage', 'finished_at'])
            ->unique('student_id')
            ->values();
    }
}
