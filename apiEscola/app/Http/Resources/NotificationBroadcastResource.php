<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationBroadcastResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $typeMeta = config('student_notifications.types.'.$this->type, []);

        return [
            'id'               => $this->id,
            'type'             => $this->type,
            'type_label'       => $typeMeta['label'] ?? $this->type,
            'title'            => $this->title,
            'body'             => $this->body,
            'audience_type'    => $this->audience_type,
            'audience_params'  => $this->audience_params,
            'data'             => $this->data,
            'recipients_count' => $this->recipients_count,
            'show_on_calendar' => (bool) $this->show_on_calendar,
            'starts_at'        => $this->starts_at?->toISOString(),
            'ends_at'          => $this->ends_at?->toISOString(),
            'sent_by'          => $this->whenLoaded('sentBy', fn () => [
                'id'   => $this->sentBy->id,
                'name' => $this->sentBy->name,
            ]),
            'created_at'       => $this->created_at?->toISOString(),
        ];
    }
}
