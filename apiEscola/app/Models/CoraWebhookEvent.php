<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Aviso recebido da Cora (caixa de entrada durável). */
class CoraWebhookEvent extends Model
{
    protected $fillable = [
        'endpoint_id',
        'tenant_id',
        'environment',
        'event_id',
        'event_type',
        'resource_id',
        'status',
        'result',
        'invoice_id',
        'attempts',
        'available_at',
        'locked_until',
        'processed_at',
        'last_error',
        'duplicates',
        'anomaly',
        'received_at',
    ];

    protected $casts = [
        'available_at' => 'datetime',
        'locked_until' => 'datetime',
        'processed_at' => 'datetime',
        'received_at' => 'datetime',
    ];

    public function endpoint(): BelongsTo
    {
        return $this->belongsTo(CoraWebhookEndpoint::class, 'endpoint_id');
    }
}
