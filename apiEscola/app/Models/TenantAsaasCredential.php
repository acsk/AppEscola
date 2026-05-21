<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantAsaasCredential extends Model
{
    protected $fillable = [
        'tenant_id',
        'environment',
        'api_key',
        'webhook_token',
        'webhook_token_hash',
        'base_url',
        'active',
        'configured_at',
    ];

    protected $hidden = [
        'api_key',
        'webhook_token',
        'webhook_token_hash',
    ];

    protected $casts = [
        'api_key' => 'encrypted',
        'webhook_token' => 'encrypted',
        'active' => 'boolean',
        'configured_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isProduction(): bool
    {
        return in_array(strtolower($this->environment), ['prod', 'production'], true);
    }

    public static function hashWebhookToken(string $token): string
    {
        return hash('sha256', trim($token));
    }
}
