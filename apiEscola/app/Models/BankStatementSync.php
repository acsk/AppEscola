<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Uma execução de busca do extrato no banco. */
class BankStatementSync extends Model
{
    protected $fillable = [
        'tenant_id',
        'environment',
        'source',
        'period_start',
        'period_end',
        'status',
        'fetched',
        'created',
        'auto_reconciled',
        'divergent',
        'balance_end',
        'balance_end_at',
        'error',
        'triggered_by',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'balance_end' => 'decimal:2',
        'balance_end_at' => 'datetime',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];
}
