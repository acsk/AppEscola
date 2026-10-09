<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuestionReview extends Model
{
    public const APROVADA = 'aprovada';

    public const REPROVADA = 'reprovada';

    public const PENDENTE = 'revisao_pendente';

    public const APROVADA_MANUAL = 'aprovada_manual';

    protected $fillable = [
        'tenant_id',
        'question_id',
        'source_question_id',
        'content_hash',
        'generation_model',
        'review_model',
        'gabarito_original',
        'gabarito_revisor',
        'result',
        'status',
        'problems',
        'recommendation',
        'explanation',
        'attempts',
        'prompt_tokens',
        'completion_tokens',
        'estimated_cost',
        'content',
        'validated_at',
    ];

    protected $casts = [
        'problems' => 'array',
        'content' => 'array',
        'attempts' => 'integer',
        'prompt_tokens' => 'integer',
        'completion_tokens' => 'integer',
        'estimated_cost' => 'float',
        'validated_at' => 'datetime',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class, 'question_id');
    }
}
