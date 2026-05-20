<?php

namespace App\Console\Commands;

use App\Services\ExamAttemptIntegrityService;
use Illuminate\Console\Command;

class AbandonTimedOutExamAttemptsCommand extends Command
{
    protected $signature = 'exams:abandon-timed-out
                            {--exam_id= : Abandona apenas tentativas do simulado informado}';

    protected $description = 'Marca como abandonadas tentativas em andamento cujo tempo (expires_at) já expirou';

    public function handle(ExamAttemptIntegrityService $integrity): int
    {
        $examId = $this->option('exam_id');
        $parsedExamId = is_numeric($examId) ? (int) $examId : null;

        $abandoned = $integrity->abandonAllExpiredInProgress($parsedExamId);

        $this->info("{$abandoned} tentativa(s) abandonada(s) por tempo esgotado.");

        return self::SUCCESS;
    }
}
