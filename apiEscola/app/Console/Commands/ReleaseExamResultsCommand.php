<?php

namespace App\Console\Commands;

use App\Models\ExamAttempt;
use Illuminate\Console\Command;

class ReleaseExamResultsCommand extends Command
{
    protected $signature = 'exams:release-pending-results';

    protected $description = 'Libera automaticamente resultados de simulados cujo período já foi encerrado';

    public function handle(): int
    {
        $released = 0;

        ExamAttempt::query()
            ->with('exam:id,ends_at')
            ->whereStatus('awaiting_release')
            ->whereHas('exam', fn ($query) => $query
                ->whereNotNull('ends_at')
                ->where('ends_at', '<=', now()))
            ->chunkById(100, function ($attempts) use (&$released) {
                foreach ($attempts as $attempt) {
                    $attempt->update(['status' => 'completed']);
                    $released++;
                }
            });

        $this->info("{$released} resultado(s) liberado(s).");

        return self::SUCCESS;
    }
}