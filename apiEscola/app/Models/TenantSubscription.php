<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TenantSubscription extends Model
{
    public const TRIALING = 'trialing';
    public const ACTIVE = 'active';
    public const PAST_DUE = 'past_due';
    public const CANCELED = 'canceled';
    public const EXPIRED = 'expired';

    protected $fillable = [
        'tenant_id', 'saas_plan_id', 'status', 'billing_cycle', 'price', 'discount_percent',
        'started_at', 'trial_ends_at', 'current_period_end', 'canceled_at', 'cancel_reason',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'started_at' => 'date',
        'trial_ends_at' => 'date',
        'current_period_end' => 'date',
        'canceled_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SaasPlan::class, 'saas_plan_id')->withTrashed();
    }

    public function events(): HasMany
    {
        return $this->hasMany(TenantSubscriptionEvent::class);
    }

    /** Receita mensal equivalente (com desconto): base do MRR. Trial e canceladas não contam. */
    public function monthlyRevenue(): float
    {
        if (! in_array($this->status, [self::ACTIVE, self::PAST_DUE], true)) {
            return 0.0;
        }
        $net = (float) $this->price * (1 - (float) $this->discount_percent / 100);

        return round($this->billing_cycle === 'yearly' ? $net / 12 : $net, 2);
    }
}
