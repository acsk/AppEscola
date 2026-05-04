<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamAttemptResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'exam_id'     => $this->exam_id,
            'exam'        => $this->whenLoaded('exam', fn () => [
                'id'    => $this->exam->id,
                'title' => $this->exam->title,
            ]),
            'student_id'  => $this->student_id,
            'student'     => $this->whenLoaded('student', fn () => [
                'id'   => $this->student->id,
                'name' => $this->student->name,
            ]),
            'started_at'  => $this->started_at?->toISOString(),
            'finished_at' => $this->finished_at?->toISOString(),
            'status'      => $this->status,
            'score'       => $this->score !== null ? (float) $this->score : null,
            'max_score'   => $this->max_score !== null ? (float) $this->max_score : null,
            'percentage'  => $this->percentage !== null ? (float) $this->percentage : null,
            'passed'      => $this->when(
                $this->status === 'completed' && $this->exam?->passing_score !== null,
                fn () => $this->percentage >= $this->exam->passing_score
            ),
            'answers'     => $this->whenLoaded('answers', function () {
                return $this->answers->map(fn ($a) => [
                    'question_id'   => $a->question_id,
                    'option_id'     => $a->option_id,
                    'text_answer'   => $a->text_answer,
                    'is_correct'    => $a->is_correct,
                    'points_earned' => (float) $a->points_earned,
                ]);
            }),
            'created_at'  => $this->created_at?->toISOString(),
            'updated_at'  => $this->updated_at?->toISOString(),
        ];
    }
}
