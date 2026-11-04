<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Histórico imutável das decisões de conciliação de uma movimentação. */
class BankStatementEntryLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id',
        'entry_id',
        'user_id',
        'action',
        'from_status',
        'to_status',
        'invoice_id',
        'justification',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
