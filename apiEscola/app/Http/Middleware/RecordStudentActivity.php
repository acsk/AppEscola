<?php

namespace App\Http\Middleware;

use App\Services\PracticePerformanceService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Registra o dia de uso do app pelo aluno (student_activity_days) depois da resposta.
 * No máximo uma escrita por aluno a cada `bi.activity_touch_minutes`; falha aqui nunca afeta a requisição.
 */
class RecordStudentActivity
{
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $user = $request->user();

        if (! $user || $user->role !== 'aluno' || ! $user->tenant_id || ! config('bi.activity_tracking', true)) {
            return;
        }

        $minutes = max(1, (int) config('bi.activity_touch_minutes', 15));
        if (! Cache::add('bi:activity:'.$user->id, true, now()->addMinutes($minutes))) {
            return;
        }

        try {
            $studentId = DB::table('students')
                ->where('user_id', $user->id)
                ->where('tenant_id', $user->tenant_id)
                ->whereNull('deleted_at')
                ->value('id');

            if ($studentId === null) {
                return;
            }

            $now = Carbon::now();
            DB::table('student_activity_days')->upsert(
                [[
                    'tenant_id' => $user->tenant_id,
                    'student_id' => $studentId,
                    'activity_date' => $now->copy()->setTimezone(PracticePerformanceService::RANKING_TIMEZONE)->toDateString(),
                    'first_seen_at' => $now,
                    'last_seen_at' => $now,
                    'touches' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]],
                ['student_id', 'activity_date'],
                [
                    'last_seen_at' => $now,
                    'touches' => DB::raw('touches + 1'),
                    'updated_at' => $now,
                ],
            );
        } catch (\Throwable $e) {
            Log::warning('Falha ao registrar atividade do aluno.', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }
    }
}
