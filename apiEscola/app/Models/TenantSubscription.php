<?php

namespace App\Models;

use App\Services\Saas\SaasBillingService;
use App\Support\BusinessDate;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class TenantSubscription extends Model
{
    public const TRIALING = 'trialing';
    public const ACTIVE = 'active';
    public const PAST_DUE = 'past_due';
    public const CANCELED = 'canceled';
    public const EXPIRED = 'expired';

    protected $fillable = [
        'tenant_id', 'saas_plan_id', 'status', 'billing_cycle', 'price', 'price_schedule',
        'gestao_enabled', 'gestao_price_monthly', 'discount_percent',
        'started_at', 'trial_ends_at', 'current_period_end', 'canceled_at', 'cancel_reason',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'gestao_price_monthly' => 'decimal:2',
        'gestao_enabled' => 'boolean',
        'price_schedule' => 'array',
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

    public function isPerStudent(): bool
    {
        return ($this->plan?->billing_basis ?? SaasPlan::FLAT) === SaasPlan::PER_STUDENT;
    }

    /**
     * Valor por aluno na data. Antes da primeira faixa fica zero.
     * Num intervalo entre faixas, vale o preço de referência gravado na assinatura.
     */
    public function unitPriceOn(Carbon $date): float
    {
        $schedule = collect($this->price_schedule ?? [])
            ->filter(fn ($row) => ! empty($row['from']))
            ->sortBy('from')
            ->values();
        $day = $date->toDateString();
        foreach ($schedule as $row) {
            $until = $row['until'] ?? null;
            if ($day >= $row['from'] && ($until === null || $until === '' || $day <= $until)) {
                return (float) $row['price'];
            }
        }
        if ($schedule->isNotEmpty() && $day < $schedule->first()['from']) {
            return 0.0;
        }

        return (float) $this->price;
    }

    /** Mensalidade equivalente, com desconto, sem olhar o status. Gestão soma por cima; o painel não entra. */
    public function monthlyAmount(): float
    {
        $factor = 1 - (float) $this->discount_percent / 100;
        $gestao = $this->gestao_enabled ? (float) $this->gestao_price_monthly * $factor : 0.0;
        if ($this->isPerStudent()) {
            $students = app(SaasBillingService::class)->appStudents((int) $this->tenant_id);
            $app = $students * $this->unitPriceOn(BusinessDate::today()) * $factor;

            return round($app + $gestao, 2);
        }

        $net = (float) $this->price * $factor;
        $monthly = $this->billing_cycle === 'yearly' ? $net / 12 : $net;

        return round($monthly + $gestao, 2);
    }

    /** Receita mensal equivalente (com desconto): base do MRR. Trial e canceladas não contam. */
    public function monthlyRevenue(): float
    {
        if (! in_array($this->status, [self::ACTIVE, self::PAST_DUE], true)) {
            return 0.0;
        }

        return $this->monthlyAmount();
    }
}
