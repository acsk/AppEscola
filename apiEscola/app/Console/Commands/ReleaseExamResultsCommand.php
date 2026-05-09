<?php

namespace App\Console\Commands;

use App\Jobs\ReleasePendingExamResultsJob;
use Illuminate\Console\Command;

class ReleaseExamResultsCommand extends Command
{
    protected $signature = 'exams:release-pending-results
                            {--exam_id= : Libera apenas tentativas do simulado informado}
                            {--force : Libera mesmo antes de ends_at}
                            {--queued : Enfileira o job ao inves de executar agora}';

    protected $description = 'Libera automaticamente resultados de simulados cujo período já foi encerrado';

    public function handle(): int
    {
        $examId = $this->option('exam_id');
        $force = (bool) $this->option('force');
        $queued = (bool) $this->option('queued');
        $parsedExamId = is_numeric($examId) ? (int) $examId : null;

        if ($queued) {
            dispatch(new ReleasePendingExamResultsJob($parsedExamId, $force));

            $this->info('Job de liberação enfileirado com sucesso.');

            return self::SUCCESS;
        }

        $released = (new ReleasePendingExamResultsJob($parsedExamId, $force))->handle();

        $this->info("{$released} resultado(s) liberado(s).");

        return self::SUCCESS;
    }
}