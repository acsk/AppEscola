<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Sessão de suporte do super admin num tenant (motivo, duração e ações registradas). */
class SupportAccess extends Model
{
    protected $fillable = [
        'tenant_id',
        'user_id',
        'reason_id',
        'details',
        'duration_minutes',
        'started_at',
        'expires_at',
        'ended_at',
        'ip',
        'user_agent',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'expires_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reason(): BelongsTo
    {
        return $this->belongsTo(SupportAccessReason::class, 'reason_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(SupportAccessAction::class);
    }

    public function isActive(): bool
    {
        return $this->ended_at === null && $this->expires_at->isFuture();
    }
}
