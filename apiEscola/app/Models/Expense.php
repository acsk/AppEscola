<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Despesa (conta a pagar). Registrar pagamento só atualiza o controle; não movimenta a conta. */
class Expense extends Model
{
    public const STATUSES = ['draft', 'pending_approval', 'approved', 'paid', 'cancelled'];

    public const PAYMENT_METHODS = ['pix', 'transfer', 'bank_slip', 'auto_debit', 'card', 'cash'];

    protected $fillable = [
        'tenant_id',
        'description',
        'supplier_id',
        'category_id',
        'cost_center_id',
        'amount',
        'due_date',
        'status',
        'recurrence',
        'series_id',
        'auto_debit',
        'system_key',
        'paid_at',
        'payment_method',
        'notes',
        'approved_by',
        'approved_at',
        'paid_by',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'due_date' => 'date',
        'paid_at' => 'datetime',
        'approved_at' => 'datetime',
        'auto_debit' => 'boolean',
    ];

    /** Código exibido na tela (D-0221). */
    public function code(): string
    {
        return 'D-' . str_pad((string) $this->id, 4, '0', STR_PAD_LEFT);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(FinanceCategory::class, 'category_id');
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ExpenseAttachment::class);
    }

    public function bankEntries(): HasMany
    {
        return $this->hasMany(BankStatementEntry::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(ExpenseAuditLog::class);
    }
}
