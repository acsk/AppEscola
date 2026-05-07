<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamAttemptResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $visibleStatus = $this->visibleStatusFor($request->user()?->role);
        $studentAwaitingRelease = $visibleStatus === 'awaiting_release';
        $score = $studentAwaitingRelease ? null : ($this->score !== null ? (float) $this->score : null);
        $maxScore = $this->max_score !== null ? (float) $this->max_score : null;

        return [
            'id'          => $this->id,
            'exam_id'     => $this->exam_id,
            'exam'        => $this->whenLoaded('exam', fn () => $this->exam ? [
                'id'               => $this->exam->id,
                'title'            => $this->exam->title,
                'duration_minutes' => $this->exam->duration_minutes,
                'passing_score'    => $this->exam->passing_score !== null ? (float) $this->exam->passing_score : null,
                'exam_type'        => $this->exam->examType?->slug,
                'exam_type_label'  => $this->exam->examType?->label,
                'status'           => $this->exam->examStatus?->slug,
                'subject'          => $this->exam->subject ? [
                    'id'    => $this->exam->subject->id,
                    'name'  => $this->exam->subject->name,
                    'icon'  => $this->exam->subject->icon,
                    'color' => $this->exam->subject->color,
                ] : null,
            ] : null),
            'student_id'  => $this->student_id,
            'student'     => $this->whenLoaded('student', fn () => $this->student ? [
                'id'                => $this->student->id,
                'name'              => $this->student->name,
                'enrollment_number' => $this->student->enrollment_number ?? null,
            ] : null),
            'started_at'  => $this->started_at?->toISOString(),
            'finished_at' => $this->finished_at?->toISOString(),
            'status'               => $visibleStatus,
            'score'                => $score,
            'max_score'            => $maxScore,
            'score_display'        => $this->formatScoreFraction($score, $maxScore),
            'percentage'           => $studentAwaitingRelease ? null : ($this->percentage !== null ? (float) $this->percentage : null),
            'pending_answers_count'=> $this->when(
                $visibleStatus === 'pending_review',
                fn () => $this->answers->whereNull('is_correct')->count()
            ),
            'correct_answers'       => $this->whenLoaded('answers', function () use ($studentAwaitingRelease) {
                if ($studentAwaitingRelease) return null;
                return $this->answers->where('is_correct', true)->count();
            }),
            'total_questions'      => $this->whenLoaded('answers', fn () => $this->answers->count()),
            'result_release_pending' => $studentAwaitingRelease,
            'passed'               => $this->when(
                ! $studentAwaitingRelease && $visibleStatus === 'completed' && $this->exam?->passing_score !== null,
                fn () => $this->percentage >= $this->exam->passing_score
            ),
            'answers'     => $this->whenLoaded('answers', function () use ($studentAwaitingRelease) {
                $questions = $this->relationLoaded('exam') && $this->exam
                    ? $this->exam->questions->keyBy('id')
                    : collect();
                $options = $questions->flatMap->options->keyBy('id');

                return $this->answers->map(fn ($a) => [
                    'id'            => $a->id,
                    'question_id'   => $a->question_id,
                    'question_text' => $questions->get($a->question_id)?->question_text,
                    'type'          => $questions->get($a->question_id)?->type,
                    'option_id'     => $a->option_id,
                    'option_text'   => $a->option_id ? ($options->get($a->option_id)?->option_text) : null,
                    'text_answer'   => $a->text_answer,
                    'is_correct'    => $studentAwaitingRelease ? null : $a->is_correct,
                    'points_earned' => $studentAwaitingRelease || $a->points_earned === null ? null : (float) $a->points_earned,
                ]);
            }),
            'created_at'  => $this->created_at?->toISOString(),
            'updated_at'  => $this->updated_at?->toISOString(),
        ];
    }

    private function formatScoreFraction(?float $score, ?float $maxScore): ?string
    {
        if ($score === null || $maxScore === null) {
            return null;
        }

        return $this->formatScoreNumber($score) . '/' . $this->formatScoreNumber($maxScore);
    }

    private function formatScoreNumber(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
