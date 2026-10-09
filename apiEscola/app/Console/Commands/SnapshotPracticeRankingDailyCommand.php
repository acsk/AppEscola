<?php

namespace App\Console\Commands;

use App\Services\PracticePerformanceService;
use App\Services\PracticeRankingHistoryService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Fecha o dia anterior do desempenho e da dedicação. Rodar de novo no mesmo dia não duplica nem deixa foto pela metade. */
class SnapshotPracticeRankingDailyCommand extends Command
{
    protected $signature = 'ranking:daily-snapshot';

    protected $description = 'Grava o fechamento de ontem dos rankings de desempenho e dedicação';

    public function handle(PracticePerformanceService $performance, PracticeRankingHistoryService $history): int
    {
        $scopes = 0;
        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach ($this->courseIds((int) $tenantId) as $courseId) {
                foreach (PracticePerformanceService::SCORED_CRITERIA as $criterion) {
                    foreach (PracticePerformanceService::PERIODS as $period) {
                        $history->ensureClosedDay($performance, (int) $tenantId, $criterion, $period, $courseId, null, null);
                        $scopes++;
                        foreach ($history->knownScopes((int) $tenantId, $criterion, $period, $courseId) as $scope) {
                            $history->ensureClosedDay(
                                $performance,
                                (int) $tenantId,
                                $criterion,
                                $period,
                                $courseId,
                                $scope['subject_id'],
                                $scope['topic_id'],
                            );
                            $scopes++;
                        }
                    }
                }
            }
        }

        $removed = $history->prune();
        $this->info("Escopos conferidos: {$scopes}. Fechamentos com mais de ".PracticeRankingHistoryService::RETENTION_DAYS." dias removidos: {$removed}.");

        return self::SUCCESS;
    }

    /** @return list<int> */
    private function courseIds(int $tenantId): array
    {
        $classes = DB::table('school_classes')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('course_id')
            ->whereNull('deleted_at')
            ->distinct()
            ->pluck('course_id');
        $plans = DB::table('course_plans')
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->distinct()
            ->pluck('course_id');

        return $classes->merge($plans)->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
