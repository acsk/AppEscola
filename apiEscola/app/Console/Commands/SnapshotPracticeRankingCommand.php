<?php

namespace App\Console\Commands;

use App\Services\PracticePerformanceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Grava a posição atual do ranking (view vw_practice_ranking) para a seta de subida/descida. */
class SnapshotPracticeRankingCommand extends Command
{
    protected $signature = 'ranking:snapshot';

    protected $description = 'Grava a foto horária do ranking do banco de questões';

    public function handle(PracticePerformanceService $performance): int
    {
        $capturedAt = now();
        $count = DB::getDriverName() === 'sqlite'
            ? $this->snapshotFromService($performance, $capturedAt)
            : $this->snapshotFromView($capturedAt);

        $removed = DB::table('practice_ranking_snapshots')
            ->where('captured_at', '<', now()->subHours(48))
            ->delete();

        $this->info("{$count} posição(ões) gravada(s). {$removed} antiga(s) removida(s).");

        return self::SUCCESS;
    }

    private function snapshotFromView(\Illuminate\Support\Carbon $capturedAt): int
    {
        return DB::affectingStatement('
            INSERT INTO practice_ranking_snapshots (captured_at, tenant_id, period, student_id, position, questions, correct)
            SELECT ?, tenant_id, period, student_id, position, questions, correct
            FROM vw_practice_ranking
        ', [$capturedAt]);
    }

    /** SQLite dos testes não tem a view: usa o mesmo cálculo do serviço. */
    private function snapshotFromService(PracticePerformanceService $performance, \Illuminate\Support\Carbon $capturedAt): int
    {
        $rows = [];
        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (PracticePerformanceService::PERIODS as $period) {
                foreach ($performance->captureRows((int) $tenantId, $period) as $row) {
                    $rows[] = $row + [
                        'captured_at' => $capturedAt,
                        'tenant_id' => (int) $tenantId,
                        'period' => $period,
                    ];
                }
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('practice_ranking_snapshots')->insert($chunk);
        }

        return count($rows);
    }
}
