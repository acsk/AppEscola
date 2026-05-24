<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PastExamResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'tenant_id'    => $this->tenant_id,
            'course_id'    => $this->course_id,
            'course_ids'   => $this->when(
                $this->relationLoaded('courses') || $this->course_id,
                fn () => $this->linkedCourseIds()->all()
            ),
            'course'       => $this->whenLoaded('course', fn () => $this->course ? [
                'id'   => $this->course->id,
                'name' => $this->course->name,
            ] : null),
            'courses'      => $this->whenLoaded('courses', fn () => $this->courses->map(fn ($course) => [
                'id'   => $course->id,
                'name' => $course->name,
            ])->values()),
            'subject_id'   => $this->subject_id,
            'subject'      => $this->whenLoaded('subject', fn () => $this->subject ? [
                'id'    => $this->subject->id,
                'name'  => $this->subject->name,
                'icon'  => $this->subject->icon,
                'color' => $this->subject->color,
            ] : null),
            'title'        => $this->title,
            'description'  => $this->description,
            'exam_year'    => $this->exam_year,
            'exam_type'    => $this->exam_type,
            'exam_type_label' => $this->exam_type ? (config('past_exams.exam_types.'.$this->exam_type) ?? $this->exam_type) : null,
            'type'         => $this->type,
            'content'      => $this->content,
            'file_type'    => $this->file_type,
            'file_size'    => $this->file_size,
            'is_published' => (bool) $this->is_published,
            'sort_order'   => $this->sort_order,
            'created_at'   => $this->created_at?->toISOString(),
            'updated_at'   => $this->updated_at?->toISOString(),
        ];
    }
}
