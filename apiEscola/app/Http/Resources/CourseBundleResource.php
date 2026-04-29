<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CourseBundleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'tenant_id'          => $this->tenant_id,
            'name'               => $this->name,
            'description'        => $this->description,
            'billing_cycle'      => $this->billing_cycle,
            'cycle_label'        => $this->cycleLabel(),
            'months_in_cycle'    => $this->monthsInCycle(),
            'price'              => $this->price,
            'monthly_equivalent' => $this->monthlyEquivalent(),
            'status'             => $this->status,
            'courses'            => CourseResource::collection($this->whenLoaded('courses')),
            'created_at'         => $this->created_at?->toISOString(),
            'updated_at'         => $this->updated_at?->toISOString(),
        ];
    }
}
