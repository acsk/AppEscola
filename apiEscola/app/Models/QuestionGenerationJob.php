<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Lote de questões pedidas à IA para um assunto da escola. Não roda no carregamento da tela. */
class QuestionGenerationJob extends Model
{
    public const PENDING = 'pending';

    public const RUNNING = 'running';

    public const DONE = 'done';

    public const FAILED = 'failed';

    protected $fillable = [
        'tenant_id',
        'subject_id',
        'subject_topic_id',
        'status',
        'batch_size',
        'created_count',
        'rejected_count',
        'prompt_tokens',
        'completion_tokens',
        'rejected',
        'error',
        'locked_at',
        'finished_at',
    ];

    protected $casts = [
        'batch_size' => 'integer',
        'created_count' => 'integer',
        'rejected_count' => 'integer',
        'prompt_tokens' => 'integer',
        'completion_tokens' => 'integer',
        'rejected' => 'array',
        'locked_at' => 'datetime',
        'finished_at' => 'datetime',
    ];
}
