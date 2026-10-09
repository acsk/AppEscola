<?php

namespace App\Services\Learning;

use App\Models\PracticeAnswer;
use App\Models\StudentReviewItem;
use App\Services\PracticePerformanceService;
use Illuminate\Support\Carbon;

/** Revisão espaçada das questões erradas. Acertar avança a caixa; errar de novo volta para o começo. */
class LearningReviewService
{
    public function record(PracticeAnswer $answer): void
    {
        $intervals = array_values(config('learning.review_intervals_days', [1, 3, 7, 15]));
        if ($intervals === []) {
            return;
        }
        $today = now(PracticePerformanceService::RANKING_TIMEZONE)->startOfDay();
        $item = StudentReviewItem::query()
            ->where('student_id', $answer->student_id)
            ->where('exam_question_id', $answer->exam_question_id)
            ->first();

        if ($answer->is_correct && ! $item) {
            return;
        }

        $box = 0;
        if ($item && $answer->is_correct) {
            $box = min($item->box + 1, count($intervals) - 1);
        }
        $history = $item->history ?? [];
        $history[] = [
            'at' => $answer->answered_at?->toIso8601String() ?? now()->toIso8601String(),
            'correct' => (bool) $answer->is_correct,
            'box' => $box,
        ];

        StudentReviewItem::query()->updateOrCreate(
            [
                'student_id' => $answer->student_id,
                'exam_question_id' => $answer->exam_question_id,
            ],
            [
                'tenant_id' => $answer->tenant_id,
                'box' => $box,
                'next_review_on' => $today->copy()->addDays((int) $intervals[$box])->toDateString(),
                'reviews_count' => ($item->reviews_count ?? 0) + ($item ? 1 : 0),
                'last_correct' => (bool) $answer->is_correct,
                'history' => array_slice($history, -12),
            ],
        );
    }

    public function nextDate(int $box): Carbon
    {
        $intervals = array_values(config('learning.review_intervals_days', [1, 3, 7, 15]));
        $days = (int) ($intervals[$box] ?? $intervals[0] ?? 1);

        return now(PracticePerformanceService::RANKING_TIMEZONE)->startOfDay()->addDays($days);
    }
}
