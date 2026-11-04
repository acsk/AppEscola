<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Movimentação do extrato bancário e sua situação de conciliação. */
class BankStatementEntry extends Model
{
    protected $fillable = [
        'tenant_id',
        'environment',
        'source',
        'external_id',
        'transaction_id',
        'direction',
        'transaction_type',
        'amount',
        'occurred_at',
        'description',
        'counterparty_name',
        'status',
        'match_type',
        'invoice_id',
        'expense_id',
        'divergence',
        'justification',
        'reviewed_by',
        'reviewed_at',
        'sync_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'occurred_at' => 'datetime',
        'reviewed_at' => 'datetime',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(BankStatementEntryLog::class, 'entry_id');
    }
}
