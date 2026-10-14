<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuestionEmbedding extends Model
{
    protected $fillable = [
        'tenant_id',
        'exam_question_id',
        'subject_id',
        'model_name',
        'dimensions',
        'embedding',
        'text_hash',
        'strategy_version',
        'multimodal_required',
    ];

    protected $casts = [
        'embedding' => 'array',
        'dimensions' => 'integer',
        'multimodal_required' => 'boolean',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'exam_question_id');
    }
}
