<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CoursePlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'tenant_id'      => $this->tenant_id,
            'course_id'      => $this->course_id,
            'course'         => new CourseResource($this->whenLoaded('course')),
            'name'           => $this->name,
            'billing_cycle'  => $this->billing_cycle,
            'cycle_label'    => $this->cycleLabel(),
            'months_in_cycle'=> $this->monthsInCycle(),
            'price'          => $this->price,
            'monthly_equivalent' => $this->monthlyEquivalent(),
            'status'         => $this->status,
            'created_at'     => $this->created_at?->toISOString(),
            'updated_at'     => $this->updated_at?->toISOString(),
        ];
    }
}
