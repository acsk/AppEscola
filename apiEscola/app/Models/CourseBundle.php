<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CourseBundle extends Model
{
    use HasFactory, SoftDeletes;

    public const CYCLE_MONTHS = [
        'monthly'       => 1,
        'bimonthly'     => 2,
        'quadrimestral' => 4,
        'semiannual'    => 6,
        'annual'        => 12,
    ];

    public const CYCLE_LABELS = [
        'monthly'       => 'Mensal',
        'bimonthly'     => 'Bimestral',
        'quadrimestral' => 'Quadrimestral',
        'semiannual'    => 'Semestral',
        'annual'        => 'Anual',
    ];

    protected $fillable = [
        'tenant_id',
        'name',
        'description',
        'billing_cycle',
        'price',
        'status',
    ];

    protected $casts = [
        'price' => 'decimal:2',
    ];

    public function monthsInCycle(): int
    {
        return self::CYCLE_MONTHS[$this->billing_cycle] ?? 1;
    }

    public function monthlyEquivalent(): float
    {
        return round((float) $this->price / $this->monthsInCycle(), 2);
    }

    public function cycleLabel(): string
    {
        return self::CYCLE_LABELS[$this->billing_cycle] ?? $this->billing_cycle;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function courses(): BelongsToMany
    {
        return $this->belongsToMany(Course::class, 'course_bundle_items', 'bundle_id', 'course_id')
            ->withTimestamps();
    }

    public function items(): HasMany
    {
        return $this->hasMany(CourseBundleItem::class, 'bundle_id');
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class, 'bundle_id');
    }
}
