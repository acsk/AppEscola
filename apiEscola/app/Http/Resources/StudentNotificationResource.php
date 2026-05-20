<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StudentNotificationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $typeMeta = config('student_notifications.types.'.$this->type, []);

        return [
            'id'         => $this->id,
            'type'       => $this->type,
            'type_label' => $typeMeta['label'] ?? $this->type,
            'type_icon'  => $typeMeta['icon'] ?? 'notifications',
            'title'      => $this->title,
            'body'       => $this->body,
            'data'       => $this->data,
            'is_read'    => $this->read_at !== null,
            'read_at'    => $this->read_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
