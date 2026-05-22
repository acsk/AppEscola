<?php

namespace App\Http\Resources;

use App\Services\EnrollmentFinancialLockService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Http\Resources\InvoiceResource;

class EnrollmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lockService = app(EnrollmentFinancialLockService::class);
        $lockedFields = $lockService->lockedFieldsFor($this->resource);

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'student_id' => $this->student_id,
            'student' => new StudentResource($this->whenLoaded('student')),
            'school_class_id' => $this->school_class_id,
            'school_class' => new SchoolClassResource($this->whenLoaded('schoolClass')),
            'school_class_ids' => $this->when(
                $this->bundle_id !== null,
                fn () => $this->relationLoaded('schoolClasses')
                    ? $this->schoolClasses->pluck('id')->values()->all()
                    : [$this->school_class_id]
            ),
            'school_classes' => SchoolClassResource::collection($this->whenLoaded('schoolClasses')),
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
            'net_monthly_amount' => number_format($this->netMonthlyAmount(), 2, '.', ''),
            'payment_due_day' => $this->payment_due_day,
            'financial_fields_locked' => $lockedFields !== [],
            'locked_fields' => $lockedFields,
            'charges_generated_at' => $this->charges_generated_at?->toISOString(),
            'charges_batch_generated' => $this->charges_generated_at !== null,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'invoices'   => InvoiceResource::collection($this->whenLoaded('invoices')),
        ];
    }
}
