<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Http\Resources\ClassScheduleResource;

class SchoolClassResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'course_id' => $this->course_id,
            'course' => new CourseResource($this->whenLoaded('course')),
            'name' => $this->name,
            'year' => $this->year,
            'period' => $this->period,
            'capacity' => $this->capacity,
            'start_date' => $this->start_date?->toDateString(),
            'end_date'   => $this->end_date?->toDateString(),
            'status' => $this->status,
            'schedules' => ClassScheduleResource::collection($this->whenLoaded('schedules')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
