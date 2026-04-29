<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EnrollmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'student_id' => $this->student_id,
            'student' => new StudentResource($this->whenLoaded('student')),
            'school_class_id' => $this->school_class_id,
            'school_class' => new SchoolClassResource($this->whenLoaded('schoolClass')),
            'course_plan_id' => $this->course_plan_id,
            'course_plan' => new CoursePlanResource($this->whenLoaded('coursePlan')),
            'bundle_id'   => $this->bundle_id,
            'bundle'      => new CourseBundleResource($this->whenLoaded('bundle')),
            'enrollment_number' => $this->enrollment_number,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'status' => $this->status,
            'monthly_amount' => $this->monthly_amount,
            'discount_amount' => $this->discount_amount,
            'payment_due_day' => $this->payment_due_day,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
