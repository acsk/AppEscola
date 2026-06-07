<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CoursePlan extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Meses de duração de cada ciclo de cobrança.
     */
    public const CYCLE_MONTHS = [
        'monthly'        => 1,
        'bimonthly'      => 2,
        'quadrimestral'  => 4,
        'semiannual'     => 6,
        'annual'         => 12,
    ];

    public const CYCLE_LABELS = [
        'monthly'        => 'Mensal',
        'bimonthly'      => 'Bimestral',
        'quadrimestral'  => 'Quadrimestral',
        'semiannual'     => 'Semestral',
        'annual'         => 'Anual',
    ];

    protected $fillable = [
        'tenant_id',
        'course_id',
        'name',
        'billing_cycle',
        'price',
        'enrollment_fee_amount',
        'status',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'enrollment_fee_amount' => 'decimal:2',
    ];

    // -------------------------------------------------------------------------
    // Relacionamentos
    // -------------------------------------------------------------------------

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class);
    }

    // -------------------------------------------------------------------------
    // Helpers de ciclo
    // -------------------------------------------------------------------------

    public function monthsInCycle(): int
    {
        return self::CYCLE_MONTHS[$this->billing_cycle] ?? 1;
    }

    /**
     * Equivalente mensal do plano (price / meses do ciclo).
     */
    public function monthlyEquivalent(): float
    {
        return round((float) $this->price / $this->monthsInCycle(), 2);
    }

    public function cycleLabel(): string
    {
        return self::CYCLE_LABELS[$this->billing_cycle] ?? $this->billing_cycle;
    }

    /**
     * Taxa de matrícula líquida do plano após desconto (null se não configurada ou zerada).
     */
    public function netEnrollmentFeeAmount(float $discountAmount = 0): ?float
    {
        if ($this->enrollment_fee_amount === null) {
            return null;
        }

        $amount = (float) $this->enrollment_fee_amount;
        if ($amount <= 0) {
            return null;
        }

        $net = max($amount - $discountAmount, 0);

        return $net > 0 ? $net : null;
    }
}
