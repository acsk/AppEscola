<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupportMaterialResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'exam_id'     => $this->exam_id,
            'title'       => $this->title,
            'description' => $this->description,
            'type'        => $this->type,
            'content'     => $this->normalizeContentUrl($this->content),
            'file_type'   => $this->file_type,
            'file_size'   => $this->file_size,
            'created_by'  => $this->created_by,
            'updated_by'  => $this->updated_by,
            'created_at'  => $this->created_at?->toISOString(),
            'updated_at'  => $this->updated_at?->toISOString(),
        ];
    }

    private function normalizeContentUrl(?string $url): ?string
    {
        if ($url === null || trim($url) === '') {
            return $url;
        }

        $value = trim($url);

        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }

        $normalized = ltrim($value, '/');

        if (str_starts_with($normalized, 'storage/')) {
            return asset($normalized);
        }

        return asset('storage/'.$normalized);
    }
}
