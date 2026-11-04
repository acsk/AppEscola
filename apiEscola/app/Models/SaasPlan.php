<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class SaasPlan extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'slug', 'description', 'price_monthly', 'price_yearly', 'trial_days', 'status', 'limits', 'features', 'order'];

    protected $casts = [
        'price_monthly' => 'decimal:2',
        'price_yearly' => 'decimal:2',
        'trial_days' => 'integer',
        'limits' => 'array',
        'features' => 'array',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(TenantSubscription::class);
    }

    /** Preço do ciclo; o anual cai para 12× o mensal quando o plano não tem preço anual. */
    public function priceFor(string $cycle): string
    {
        return $cycle === 'yearly' && $this->price_yearly !== null
            ? (string) $this->price_yearly
            : ($cycle === 'yearly' ? number_format((float) $this->price_monthly * 12, 2, '.', '') : (string) $this->price_monthly);
    }
}
