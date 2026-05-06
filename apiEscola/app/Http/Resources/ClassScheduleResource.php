<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClassScheduleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $teacherIds = $this->relationLoaded('teachers')
            ? $this->teachers->pluck('id')->values()->all()
            : null;

        $legacyTeacherId = $this->teacher_id;
        if ($legacyTeacherId === null && is_array($teacherIds) && !empty($teacherIds)) {
            $legacyTeacherId = $teacherIds[0];
        }

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'school_class_id' => $this->school_class_id,
            'subject_id' => $this->subject_id,
            'subject' => new SubjectResource($this->whenLoaded('subject')),
            'teacher_id' => $legacyTeacherId,
            'teacher' => new UserResource($this->whenLoaded('teacher')),
            'teacher_ids' => $teacherIds,
            'teachers' => UserResource::collection($this->whenLoaded('teachers')),
            'weekday' => $this->weekday,
            'start_time' => $this->start_time,
            'end_time' => $this->end_time,
            'room' => $this->room,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
