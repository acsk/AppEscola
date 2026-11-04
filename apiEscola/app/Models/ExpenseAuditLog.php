<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Histórico imutável de uma despesa. */
class ExpenseAuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'expense_id', 'user_id', 'action', 'changes', 'reason', 'ip'];

    protected $casts = ['changes' => 'array'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
