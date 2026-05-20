<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'enrollment_id',
        'student_id',
        'guardian_id',
        'type',
        'description',
        'amount',
        'due_date',
        'paid_at',
        'status',
        'payment_method',
        'payment_reference',
        'notes',
        'edit_reason',
        'cora_charge_id',
        'cora_status',
        'cora_payment_url',
        'cora_pix_copy_paste',
        'boleto_number',
        'boleto_digitable',
        'cora_payload',
        'cora_last_synced_at',
        'created_by',
        'updated_by',
        'deleted_by',
    ];

    protected $casts = [
        'due_date' => 'date',
        'paid_at' => 'datetime',
        'amount' => 'decimal:2',
        'cora_payload' => 'array',
        'cora_last_synced_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(Enrollment::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function guardian(): BelongsTo
    {
        return $this->belongsTo(Guardian::class);
    }

    public function invoiceType(): BelongsTo
    {
        return $this->belongsTo(DomainInvoiceType::class, 'type', 'slug');
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function updatedByUser(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'updated_by');
    }
}
