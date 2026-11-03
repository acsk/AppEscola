<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Linha do tempo do acompanhamento (e descarte de sugestões, sem intervenção). */
class PedagogicalInterventionEvent extends Model
{
    public const CREATED = 'created';

    public const STATUS_CHANGED = 'status_changed';

    public const UPDATED = 'updated';

    public const PROGRESS = 'progress';

    public const NOTE = 'note';

    public const COMPLETED = 'completed';

    public const SUGGESTION_DISMISSED = 'suggestion_dismissed';

    protected $fillable = ['tenant_id', 'intervention_id', 'student_id', 'type', 'description', 'data', 'user_id', 'occurred_at'];

    protected $casts = ['data' => 'array', 'occurred_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
