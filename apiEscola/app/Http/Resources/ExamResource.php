<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'tenant_id'        => $this->tenant_id,
            'course_id'        => $this->course_id,
            'course_ids'       => $this->when(
                $this->relationLoaded('courses') || $this->course_id,
                fn () => $this->linkedCourseIds()->all()
            ),
            'course'           => $this->whenLoaded('course', fn () => $this->course ? [
                'id'   => $this->course->id,
                'name' => $this->course->name,
            ] : null),
            'courses'          => $this->whenLoaded('courses', fn () => $this->courses->map(fn ($course) => [
                'id'   => $course->id,
                'name' => $course->name,
            ])->values()),
            'subject_id'       => $this->subject_id,
            'subject'          => $this->whenLoaded('subject', fn () => [
                'id'    => $this->subject->id,
                'name'  => $this->subject->name,
                'icon'  => $this->subject->icon,
                'color' => $this->subject->color,
            ]),
            'exam_type_id'     => $this->exam_type_id,
            'exam_type'        => $this->examType?->slug,
            'exam_type_label'  => $this->examType?->label,
            'exam_status_id'   => $this->exam_status_id,
            'status'           => $this->examStatus?->slug,
            'status_label'     => $this->examStatus?->label,
            'title'            => $this->title,
            'description'      => $this->description,
            'duration_minutes' => $this->duration_minutes,
            'passing_score'       => $this->passing_score !== null ? (float) $this->passing_score : null,
            'release_results_after_end' => (bool) $this->release_results_after_end,
            'allow_retake'        => (bool) $this->allow_retake,
            'max_attempts'        => $this->max_attempts,
            'min_score_to_retake' => $this->min_score_to_retake !== null ? (float) $this->min_score_to_retake : null,
            'starts_at'           => $this->starts_at?->toISOString(),
            'ends_at'             => $this->ends_at?->toISOString(),
            'total_questions'  => $this->whenLoaded('questions', fn () => $this->questions->count()),
            'total_points'     => $this->whenLoaded('questions', fn () => (float) $this->questions->sum('points')),
            'questions'        => $this->whenLoaded('questions', fn () => ExamQuestionResource::collection($this->questions)),
            'created_by'       => $this->created_by,
            'updated_by'       => $this->updated_by,
            'created_at'       => $this->created_at?->toISOString(),
            'updated_at'       => $this->updated_at?->toISOString(),
        ];
    }
}
