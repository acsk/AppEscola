<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Evento do histórico de uma cobrança (somente inserção). */
class InvoiceAuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id',
        'invoice_id',
        'user_id',
        'support_access_id',
        'action',
        'source',
        'changes',
        'reason',
        'ip',
    ];

    protected $casts = [
        'changes' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
