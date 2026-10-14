<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmbeddingUsage extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'exam_question_id',
        'action',
        'model_name',
        'tokens',
        'cost_usd',
        'duration_ms',
        'meta',
        'created_at',
    ];

    protected $casts = [
        'tokens' => 'integer',
        'cost_usd' => 'float',
        'duration_ms' => 'integer',
        'meta' => 'array',
        'created_at' => 'datetime',
    ];
}
