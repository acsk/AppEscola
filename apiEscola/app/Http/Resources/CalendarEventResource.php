<?php

namespace App\Http\Resources;

use App\Support\CalendarEventTypeResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CalendarEventResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $displayType = CalendarEventTypeResolver::displayTypeForEvent($this->resource);
        $typeMeta = CalendarEventTypeResolver::metaForType($displayType);

        return [
            'id'              => $this->id,
            'source_type'     => $this->source_type,
            'source_id'       => $this->source_id,
            'is_synced'       => in_array($this->source_type, ['exam', 'invoice', 'notification_broadcast'], true),
            'is_editable'     => $this->source_type === null || $this->source_type === 'manual',
            'type'            => $displayType,
            'type_label'      => $typeMeta['label'],
            'type_icon'       => $typeMeta['icon'],
            'type_color'      => $typeMeta['color'],
            'title'           => $this->title,
            'description'     => $this->description,
            'starts_at'       => $this->starts_at?->toISOString(),
            'ends_at'         => $this->ends_at?->toISOString(),
            'all_day'         => (bool) $this->all_day,
            'course_id'       => $this->course_id,
            'course'          => $this->whenLoaded('course', fn () => [
                'id'   => $this->course->id,
                'name' => $this->course->name,
            ]),
            'school_class_id' => $this->school_class_id,
            'school_class'    => $this->whenLoaded('schoolClass', fn () => [
                'id'   => $this->schoolClass->id,
                'name' => $this->schoolClass->name,
            ]),
            'location'        => $this->location,
            'audience_type'   => $this->audience_type,
            'audience_params' => $this->audience_params,
            'is_published'    => (bool) $this->is_published,
            'student_id'      => $this->student_id,
            'exam_id'         => $this->source_type === 'exam' ? $this->source_id : null,
            'invoice_id'      => $this->source_type === 'invoice' ? $this->source_id : null,
            'broadcast_id'    => $this->source_type === 'notification_broadcast' ? $this->source_id : null,
            'created_at'      => $this->created_at?->toISOString(),
        ];
    }
}
