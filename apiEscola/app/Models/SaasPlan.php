<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SaasPlan extends Model
{
    use SoftDeletes;

    public const FLAT = 'flat';

    public const PER_STUDENT = 'per_student';

    protected $fillable = [
        'name', 'slug', 'description', 'price_monthly', 'price_yearly', 'billing_basis',
        'gestao_price_monthly', 'price_schedule', 'trial_days', 'status', 'limits', 'features', 'order',
    ];

    protected $casts = [
        'price_monthly' => 'decimal:2',
        'price_yearly' => 'decimal:2',
        'gestao_price_monthly' => 'decimal:2',
        'trial_days' => 'integer',
        'limits' => 'array',
        'features' => 'array',
        'price_schedule' => 'array',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(TenantSubscription::class);
    }

    /** Preço do ciclo. No plano por aluno, o preço mensal é o valor de referência por aluno. */
    public function priceFor(string $cycle): string
    {
        if ($this->billing_basis === self::PER_STUDENT) {
            return (string) $this->price_monthly;
        }

        return $cycle === 'yearly' && $this->price_yearly !== null
            ? (string) $this->price_yearly
            : ($cycle === 'yearly' ? number_format((float) $this->price_monthly * 12, 2, '.', '') : (string) $this->price_monthly);
    }
}
