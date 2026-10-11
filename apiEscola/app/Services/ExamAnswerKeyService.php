<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamAttempt;
use App\Models\ExamQuestion;
use Illuminate\Support\Facades\DB;

/** Troca a alternativa correta do simulado pelo gabarito conferido e recalcula provas já corrigidas. */
class ExamAnswerKeyService
{
    /**
     * @param  list<array{question_id: int, option_index: int}>  $corrections
     * @return array{updated: int, answers_regraded: int, attempts_recalculated: int}
     */
    public function apply(Exam $exam, array $corrections): array
    {
        $updated = 0;
        $answersRegraded = 0;
        $attemptsRecalculated = 0;

        DB::transaction(function () use ($exam, $corrections, &$updated, &$answersRegraded, &$attemptsRecalculated) {
            $ids = collect($corrections)->pluck('question_id')->map(fn ($id) => (int) $id)->unique()->values();
            $questions = $exam->questions()
                ->with('options')
                ->whereIn('id', $ids)
                ->get()
                ->keyBy('id');

            $changed = [];
            foreach ($corrections as $row) {
                $question = $questions->get((int) $row['question_id']);
                if (! $question instanceof ExamQuestion || $question->type !== 'multiple_choice' || $question->is_annulled) {
                    continue;
                }
                $options = $question->options->values();
                $index = (int) $row['option_index'];
                $target = $options->get($index);
                if ($target === null || $options->count() < 2) {
                    continue;
                }
                $already = $options->where('is_correct', true)->count() === 1 && $target->is_correct;
                if ($already) {
                    continue;
                }
                foreach ($options as $position => $option) {
                    $correct = $position === $index;
                    if ((bool) $option->is_correct !== $correct) {
                        $option->is_correct = $correct;
                        $option->save();
                    }
                }
                $updated++;
                $changed[] = $question->id;
                $answersRegraded += $this->regradeQuestion($question);
            }

            if ($changed !== []) {
                $attemptsRecalculated = $this->recalculateFinishedAttempts($changed);
            }
        });

        return [
            'updated' => $updated,
            'answers_regraded' => $answersRegraded,
            'attempts_recalculated' => $attemptsRecalculated,
        ];
    }

    private function regradeQuestion(ExamQuestion $question): int
    {
        if ($question->allow_text_answer) {
            return 0;
        }
        $correctId = (int) $question->options()->where('is_correct', true)->value('id');
        $count = 0;
        $answers = ExamAnswer::query()
            ->where('question_id', $question->id)
            ->whereNotNull('option_id')
            ->whereNotNull('is_correct')
            ->with('option')
            ->get();
        foreach ($answers as $answer) {
            if ($answer->option?->triggers_text_input) {
                continue;
            }
            $isCorrect = (int) $answer->option_id === $correctId;
            $earned = $isCorrect ? (float) $question->points : 0.0;
            if ((bool) $answer->is_correct === $isCorrect && abs((float) $answer->points_earned - $earned) < 0.001) {
                continue;
            }
            $answer->update(['is_correct' => $isCorrect, 'points_earned' => $earned]);
            $count++;
        }

        return $count;
    }

    /** @param  list<int>  $questionIds */
    private function recalculateFinishedAttempts(array $questionIds): int
    {
        $attemptIds = ExamAnswer::query()
            ->whereIn('question_id', $questionIds)
            ->pluck('attempt_id')
            ->unique()
            ->values();
        $count = 0;
        ExamAttempt::query()->whereIn('id', $attemptIds)->whereNotNull('finished_at')->each(function (ExamAttempt $attempt) use (&$count) {
            if ($attempt->answers()->whereNull('is_correct')->exists()) {
                return;
            }
            $total = (float) $attempt->answers()->sum('points_earned');
            $max = (float) ($attempt->max_score ?: 0);
            $attempt->update([
                'score' => $total,
                'percentage' => $max > 0 ? round($total / $max * 100, 2) : 0,
            ]);
            $count++;
        });

        return $count;
    }
}
