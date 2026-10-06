<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class QuestionImageGeneration extends Model
{
    use HasUuids;

    protected $guarded = ['id'];

    protected $casts = [
        'content' => 'array',
        'analysis' => 'array',
        'image_spec' => 'array',
        'validation' => 'array',
        'metadata' => 'array',
        'attempts' => 'integer',
        'duration_ms' => 'integer',
    ];

    public function reviewPayload(): array
    {
        return [
            'generation_id' => $this->id,
            'image_url' => $this->image_url,
            'image_generation' => [
                'status' => $this->status,
                'model' => $this->model,
                'attempts' => $this->attempts,
                'validation' => $this->validation,
                'reason' => $this->error,
            ],
        ];
    }
}
