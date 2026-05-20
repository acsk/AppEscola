<?php

namespace App\Console\Commands;

use App\Models\Exam;
use App\Services\ExamCalendarSyncService;
use Illuminate\Console\Command;

class SyncExamCalendarEventsCommand extends Command
{
    protected $signature = 'calendar:sync-exams {--tenant= : ID do tenant}';

    protected $description = 'Sincroniza simulados publicados com datas no calendário de eventos';

    public function handle(ExamCalendarSyncService $sync): int
    {
        $query = Exam::query()
            ->with(['examStatus', 'examType'])
            ->whereHas('examStatus', fn ($q) => $q->where('slug', 'published'))
            ->where(function ($q) {
                $q->whereNotNull('starts_at')->orWhereNotNull('ends_at');
            });

        if ($tenantId = $this->option('tenant')) {
            $query->where('tenant_id', (int) $tenantId);
        }

        $count = 0;
        $query->chunkById(100, function ($exams) use ($sync, &$count) {
            foreach ($exams as $exam) {
                $sync->sync($exam);
                $count++;
            }
        });

        $this->info("Sincronizados {$count} simulado(s).");

        return self::SUCCESS;
    }
}
