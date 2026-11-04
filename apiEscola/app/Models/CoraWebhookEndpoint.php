<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Assinatura do webhook Cora de um tenant num ambiente. */
class CoraWebhookEndpoint extends Model
{
    protected $fillable = [
        'tenant_id',
        'environment',
        'callback_key_hash',
        'cora_endpoint_id',
        'resource',
        'trigger',
        'active',
        'registered_at',
        'last_event_at',
    ];

    protected $casts = [
        'active' => 'boolean',
        'registered_at' => 'datetime',
        'last_event_at' => 'datetime',
    ];

    public static function hashKey(string $callbackKey): string
    {
        return hash('sha256', $callbackKey);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
