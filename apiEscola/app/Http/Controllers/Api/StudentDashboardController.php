<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExamAttempt;
use App\Models\Student;
use App\Services\StudentPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudentDashboardController extends Controller
{
    public function __construct(
        private readonly StudentPerformanceService $performanceService,
    ) {
    }
    /**
     * Retorna as métricas de desempenho do aluno autenticado.
     *
     * Campos retornados:
     *  - total_exams          : simulados realizados (status = completed)
     *  - avg_accuracy         : precisão média (% de acertos nas tentativas concluídas)
     *  - current_streak_days  : dias consecutivos com ao menos uma tentativa finalizada
     *  - period               : período de referência do resumo ('month' ou 'all')
     *  - summary.accuracy     : precisão no período (%)
     *  - summary.correct      : total de acertos no período
     *  - summary.wrong        : total de erros no período
     *  - summary.accuracy_change : variação vs período anterior (pp)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        $period = $request->query('period', 'month'); // 'month' | 'all'

        // ── Totais gerais (independente do período) ─────────────────────────
        $completedAttempts = ExamAttempt::where('student_id', $student->id)
            ->whereHas('attemptStatus', fn ($q) => $q->where('slug', 'completed'))
            ->whereNotNull('finished_at')
            ->get(['id', 'score', 'max_score', 'percentage', 'finished_at']);

        $totalExams   = $completedAttempts->count();
        $avgAccuracy  = $totalExams > 0
            ? round($completedAttempts->avg('percentage'), 1)
            : null;

        // ── Streak (dias consecutivos com tentativa finalizada) ──────────────
        $currentStreakDays = $this->calculateStreak($student->id);

        // ── Resumo por período ───────────────────────────────────────────────
        [$periodStart, $prevStart, $prevEnd] = $this->periodBounds($period);

        $summaryAnswers = $this->periodAnswerStats($student->id, $periodStart);
        $prevAnswers    = $this->periodAnswerStats($student->id, $prevStart, $prevEnd);

        $accuracy       = $summaryAnswers['total'] > 0
            ? round(($summaryAnswers['correct'] / $summaryAnswers['total']) * 100, 1)
            : null;

        $prevAccuracy   = $prevAnswers['total'] > 0
            ? round(($prevAnswers['correct'] / $prevAnswers['total']) * 100, 1)
            : null;

        $accuracyChange = ($accuracy !== null && $prevAccuracy !== null)
            ? round($accuracy - $prevAccuracy, 1)
            : null;

        return $this->success([
            'total_exams'         => $totalExams,
            'avg_accuracy'        => $avgAccuracy,
            'current_streak_days' => $currentStreakDays,
            'period'              => $period,
            'summary'             => [
                'accuracy'        => $accuracy,
                'correct'         => $summaryAnswers['correct'],
                'wrong'           => $summaryAnswers['wrong'],
                'accuracy_change' => $accuracyChange,
            ],
            'active_enrollments'  => $this->performanceService->activeEnrollmentsPayload($student),
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Calcula quantos dias consecutivos (até hoje) o aluno teve ao menos
     * uma tentativa finalizada.
     */
    private function calculateStreak(int $studentId): int
    {
        $dates = ExamAttempt::where('student_id', $studentId)
            ->whereNotNull('finished_at')
            ->select(DB::raw('DATE(finished_at) as day'))
            ->groupBy('day')
            ->orderByDesc('day')
            ->pluck('day')
            ->map(fn ($d) => \Carbon\Carbon::parse($d)->startOfDay())
            ->values();

        if ($dates->isEmpty()) {
            return 0;
        }

        $today    = now()->startOfDay();
        $streak   = 0;
        $expected = $today;

        // Aceita que a última atividade seja hoje ou ontem (não penaliza quem
        // ainda não fez simulado hoje)
        if ($dates->first()->lt($expected->copy()->subDays(1))) {
            return 0;
        }

        foreach ($dates as $date) {
            if ($date->eq($expected) || $date->eq($expected->copy()->subDay())) {
                $streak++;
                $expected = $date->copy()->subDay();
            } else {
                break;
            }
        }

        return $streak;
    }

    /**
     * Conta acertos e erros das respostas ligadas a tentativas concluídas
     * dentro de um intervalo de datas.
     *
     * @return array{correct: int, wrong: int, total: int}
     */
    private function periodAnswerStats(int $studentId, ?\Carbon\Carbon $from, ?\Carbon\Carbon $to = null): array
    {
        $query = DB::table('exam_answers')
            ->join('exam_attempts', 'exam_answers.attempt_id', '=', 'exam_attempts.id')
            ->join('exam_attempt_statuses', 'exam_attempts.attempt_status_id', '=', 'exam_attempt_statuses.id')
            ->where('exam_attempts.student_id', $studentId)
            ->where('exam_attempt_statuses.slug', 'completed')
            ->whereNotNull('exam_attempts.finished_at')
            ->whereNotNull('exam_answers.is_correct')
            ->whereNull('exam_attempts.deleted_at');

        if ($from) {
            $query->where('exam_attempts.finished_at', '>=', $from);
        }

        if ($to) {
            $query->where('exam_attempts.finished_at', '<=', $to);
        }

        $correct = (int) (clone $query)->where('exam_answers.is_correct', true)->count();
        $wrong   = (int) (clone $query)->where('exam_answers.is_correct', false)->count();

        return [
            'correct' => $correct,
            'wrong'   => $wrong,
            'total'   => $correct + $wrong,
        ];
    }

    /**
     * Retorna [início do período atual, início do período anterior, fim do período anterior].
     *
     * @return array{\Carbon\Carbon|null, \Carbon\Carbon|null, \Carbon\Carbon|null}
     */
    private function periodBounds(string $period): array
    {
        if ($period === 'month') {
            $start    = now()->startOfMonth();
            $prevEnd  = now()->startOfMonth()->subSecond();
            $prevStart = now()->subMonth()->startOfMonth();
            return [$start, $prevStart, $prevEnd];
        }

        // 'all' — sem filtro de data
        return [null, null, null];
    }
}
