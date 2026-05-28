<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OfficialAssessmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'course_id' => $this->course_id,
            'course' => $this->whenLoaded('course', fn () => $this->course ? [
                'id' => $this->course->id,
                'name' => $this->course->name,
            ] : null),
            'school_class_id' => $this->school_class_id,
            'school_class' => $this->whenLoaded('schoolClass', fn () => $this->schoolClass ? [
                'id' => $this->schoolClass->id,
                'name' => $this->schoolClass->name,
            ] : null),
            'subject_id' => $this->subject_id,
            'subject' => $this->whenLoaded('subject', fn () => $this->subject ? [
                'id' => $this->subject->id,
                'name' => $this->subject->name,
                'icon' => $this->subject->icon,
                'color' => $this->subject->color,
            ] : null),
            'exam_type_id' => $this->exam_type_id,
            'exam_type' => $this->whenLoaded('examType', fn () => $this->examType ? [
                'id' => $this->examType->id,
                'slug' => $this->examType->slug,
                'label' => $this->examType->label,
            ] : null),
            'title' => $this->title,
            'kind' => $this->kind,
            'assessment_date' => $this->assessment_date?->toDateString(),
            'max_score' => (float) $this->max_score,
            'weight' => (float) $this->weight,
            'counts_towards_report_card' => (bool) $this->counts_towards_report_card,
            'status' => $this->status,
            'notes' => $this->notes,
            'grades_count' => $this->whenCounted('grades'),
            'grades' => OfficialAssessmentGradeResource::collection($this->whenLoaded('grades')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
