<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class TenantApiToken extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'name',
        'token_hash',
        'abilities',
        'last_used_at',
        'expires_at',
        'status',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected $casts = [
        'abilities' => 'array',
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && ! $this->isExpired();
    }

    public function hasAbility(string $ability): bool
    {
        if (empty($this->abilities)) {
            return false;
        }

        return in_array($ability, $this->abilities, true)
            || in_array('*', $this->abilities, true);
    }
}
