<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Enrollment extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'student_id',
        'school_class_id',
        'course_plan_id',
        'bundle_id',
        'enrollment_number',
        'start_date',
        'end_date',
        'status',
        'monthly_amount',
        'discount_amount',
        'payment_due_day',
        'created_by',
        'updated_by',
        'deleted_by',
        'charges_generated_at',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'monthly_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'charges_generated_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function coursePlan(): BelongsTo
    {
        return $this->belongsTo(CoursePlan::class);
    }

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(CourseBundle::class, 'bundle_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    /**
     * Valor base da mensalidade antes do desconto (override da matrícula ou plano/pacote).
     */
    public function baseMonthlyAmount(): float
    {
        if ($this->monthly_amount !== null) {
            return (float) $this->monthly_amount;
        }

        $plan = $this->coursePlan;
        if ($plan) {
            return (float) $plan->monthlyEquivalent();
        }

        $bundle = $this->bundle;
        if ($bundle) {
            return (float) $bundle->monthlyEquivalent();
        }

        return 0.0;
    }

    /**
     * Valor líquido da mensalidade usado nas cobranças: base − desconto (mín. 0).
     */
    public function netMonthlyAmount(): float
    {
        return max($this->baseMonthlyAmount() - (float) ($this->discount_amount ?? 0), 0);
    }
}
