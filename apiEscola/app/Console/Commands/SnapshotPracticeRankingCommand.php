<?php

namespace App\Console\Commands;

use App\Services\PracticePerformanceService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Grava a posição atual do ranking (view vw_practice_ranking) para a seta de subida/descida. */
class SnapshotPracticeRankingCommand extends Command
{
    protected $signature = 'ranking:snapshot';

    protected $description = 'Grava a foto do ranking do banco de questões, a cada 10 minutos';

    public function handle(PracticePerformanceService $performance): int
    {
        $capturedAt = now();
        $criteria = [
            PracticePerformanceService::CRITERION_PARTICIPATION,
            PracticePerformanceService::CRITERION_WILSON,
            PracticePerformanceService::CRITERION_DEDICATION,
        ];
        $dayAgo = now()->subHours(20);
        $missing = array_values(array_filter(
            $criteria,
            fn (string $criterion) => ! DB::table('practice_ranking_snapshots')
                ->where('criterion', $criterion)
                ->where('captured_at', '<=', $dayAgo)
                ->exists(),
        ));
        // A foto de participação já pode existir. Desempenho e dedicação ainda assim ganham a de 24h atrás.
        $backfill = $missing === []
            ? 0
            : $this->snapshotFromService($performance, now()->subDay(), now()->subDay(), $missing);
        $count = DB::getDriverName() === 'sqlite'
            ? $this->snapshotFromService($performance, $capturedAt)
            : $this->snapshotFromView($capturedAt) + $this->snapshotFromService($performance, $capturedAt, criteria: [
                PracticePerformanceService::CRITERION_WILSON,
                PracticePerformanceService::CRITERION_DEDICATION,
            ]);

        $removed = DB::table('practice_ranking_snapshots')
            ->where('captured_at', '<', now()->subHours(48))
            ->delete();

        $this->info("Foto de agora: {$count}. Foto de 24h atrás: {$backfill}. Antigas removidas: {$removed}.");

        return self::SUCCESS;
    }

    private function snapshotFromView(Carbon $capturedAt): int
    {
        return DB::affectingStatement('
            INSERT INTO practice_ranking_snapshots (captured_at, tenant_id, period, student_id, position, questions, correct)
            SELECT ?, tenant_id, period, student_id, position, questions, correct
            FROM vw_practice_ranking
        ', [$capturedAt]);
    }

    /**
     * SQLite dos testes não tem a view. $before limita as respostas (foto de 24h atrás).
     *
     * @param  list<string>|null  $criteria
     */
    private function snapshotFromService(PracticePerformanceService $performance, Carbon $capturedAt, ?Carbon $before = null, ?array $criteria = null): int
    {
        $criteria ??= [
            PracticePerformanceService::CRITERION_PARTICIPATION,
            PracticePerformanceService::CRITERION_WILSON,
            PracticePerformanceService::CRITERION_DEDICATION,
        ];
        $rows = [];
        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (PracticePerformanceService::PERIODS as $period) {
                foreach ($criteria as $criterion) {
                    foreach ($performance->captureRows((int) $tenantId, $period, $before, $criterion) as $row) {
                        $rows[] = $row + [
                            'captured_at' => $capturedAt,
                            'tenant_id' => (int) $tenantId,
                            'period' => $period,
                            'criterion' => $criterion,
                        ];
                    }
                }
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('practice_ranking_snapshots')->insert($chunk);
        }

        return count($rows);
    }
}
