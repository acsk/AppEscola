<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StudentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'user_id' => $this->user_id,
            'enrollment_number' => $this->enrollment_number,
            'name' => $this->name,
            'birth_date' => $this->birth_date?->toDateString(),
            'document' => $this->document,
            'email' => $this->email,
            'phone' => $this->phone,
            'photo_url' => $this->photo_url,
            'is_minor' => $this->is_minor,
            'status' => $this->status,
            'desired_courses' => $this->whenLoaded('desiredCourses', fn () => $this->desiredCourses->map(fn ($course) => [
                'id' => $course->id,
                'name' => $course->name,
            ])->values()),
            'guardians' => GuardianResource::collection($this->whenLoaded('guardians')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
