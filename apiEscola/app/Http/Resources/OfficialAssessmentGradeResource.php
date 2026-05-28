<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OfficialAssessmentGradeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'official_assessment_id' => $this->official_assessment_id,
            'assessment' => $this->whenLoaded('assessment', function () {
                if (! $this->assessment) {
                    return null;
                }

                return [
                    'id' => $this->assessment->id,
                    'title' => $this->assessment->title,
                    'kind' => $this->assessment->kind,
                    'assessment_date' => $this->assessment->assessment_date?->toDateString(),
                    'max_score' => $this->assessment->max_score !== null
                        ? (float) $this->assessment->max_score
                        : null,
                    'weight' => $this->assessment->weight !== null
                        ? (float) $this->assessment->weight
                        : null,
                    'school_class' => $this->assessment->relationLoaded('schoolClass') && $this->assessment->schoolClass
                        ? [
                            'id' => $this->assessment->schoolClass->id,
                            'name' => $this->assessment->schoolClass->name,
                        ]
                        : null,
                ];
            }),
            'student_id' => $this->student_id,
            'subject_id' => $this->subject_id,
            'subject' => $this->whenLoaded('subject', fn () => $this->subject ? [
                'id' => $this->subject->id,
                'name' => $this->subject->name,
                'icon' => $this->subject->icon,
                'color' => $this->subject->color,
            ] : null),
            'student' => $this->whenLoaded('student', fn () => $this->student ? [
                'id' => $this->student->id,
                'name' => $this->student->name,
                'enrollment_number' => $this->student->enrollment_number,
            ] : null),
            'enrollment_id' => $this->enrollment_id,
            'grade' => $this->grade !== null ? (float) $this->grade : null,
            'is_absent' => (bool) $this->is_absent,
            'notes' => $this->notes,
            'graded_at' => $this->graded_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
