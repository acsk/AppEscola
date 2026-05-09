<?php

namespace App\Jobs;

use App\Models\ExamAttempt;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ReleasePendingExamResultsJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ?int $examId = null,
        public readonly bool $force = false,
    ) {
    }

    public function handle(): int
    {
        $released = 0;

        ExamAttempt::query()
            ->whereStatus('awaiting_release')
            ->when($this->examId, fn ($query) => $query->where('exam_id', $this->examId))
            ->whereHas('exam', function ($query) {
                $query->where('release_results_after_end', true);

                if (! $this->force) {
                    $query->whereNotNull('ends_at')
                        ->where('ends_at', '<=', now());
                }
            })
            ->chunkById(100, function ($attempts) use (&$released) {
                foreach ($attempts as $attempt) {
                    $attempt->update(['status' => 'completed']);
                    $released++;
                }
            });

        return $released;
    }
}
