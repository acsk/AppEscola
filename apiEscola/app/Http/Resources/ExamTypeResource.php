<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExamTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'slug'         => $this->slug,
            'label'        => $this->label,
            'sort_order'   => (int) $this->sort_order,
            'is_active'    => (bool) $this->is_active,
            'exams_count'  => $this->whenCounted('exams'),
            'past_exams_count' => $this->whenCounted('pastExams'),
            'questions_count'  => $this->whenCounted('questions'),
            'created_at'   => $this->created_at?->toISOString(),
            'updated_at'   => $this->updated_at?->toISOString(),
        ];
    }
}
