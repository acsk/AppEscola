<?php

namespace App\Services\Saas;

use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\TenantSubscriptionEvent;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Ciclo de vida da assinatura SaaS de um tenant. Ainda não emite cobrança: vencimento e valor servem para
 * acompanhamento e MRR. Toda mudança gera evento (histórico do tenant) e registro na auditoria global.
 */
class SaasSubscriptionService
{
    public function __construct(
        private readonly SaasEntitlementService $entitlements,
        private readonly TenantQuotaService $quotas,
        private readonly SaasAuditService $audit,
    ) {
    }

    /** @param  array{saas_plan_id: int, billing_cycle: string, trial_days?: int|null, discount_percent?: float|null}  $data */
    public function subscribe(Tenant $tenant, array $data, User $actor): TenantSubscription
    {
        if (TenantSubscription::query()->where('tenant_id', $tenant->id)->exists()) {
            throw ValidationException::withMessages(['saas_plan_id' => ['A instituição já tem assinatura. Use a troca de plano.']]);
        }
        $plan = $this->activePlan((int) $data['saas_plan_id']);
        $cycle = $data['billing_cycle'];
        $today = BusinessDate::today();
        $trialDays = (int) ($data['trial_days'] ?? $plan->trial_days);

        $subscription = DB::transaction(function () use ($tenant, $plan, $cycle, $today, $trialDays, $data, $actor) {
            $subscription = TenantSubscription::query()->create([
                'tenant_id' => $tenant->id,
                'saas_plan_id' => $plan->id,
                'status' => $trialDays > 0 ? TenantSubscription::TRIALING : TenantSubscription::ACTIVE,
                'billing_cycle' => $cycle,
                'price' => $plan->priceFor($cycle),
                'discount_percent' => (float) ($data['discount_percent'] ?? 0),
                'started_at' => $today,
                'trial_ends_at' => $trialDays > 0 ? $today->copy()->addDays($trialDays) : null,
                'current_period_end' => $trialDays > 0 ? $today->copy()->addDays($trialDays) : $this->periodEnd($today, $cycle),
            ]);
            $this->event($subscription, 'created', $actor, null, $plan->id, ['billing_cycle' => $cycle, 'trial_days' => $trialDays]);

            return $subscription;
        });

        $this->audit->log($actor, $tenant->id, 'subscription.created', "Assinatura contratada: {$plan->name} ({$this->cycleLabel($cycle)})".($trialDays ? ", teste de {$trialDays} dias" : ''));
        $this->entitlements->flush($tenant->id);

        return $subscription->fresh('plan');
    }

    /** Upgrade/downgrade imediato. Downgrade é recusado se o uso atual passar dos limites do novo plano. */
    public function changePlan(TenantSubscription $subscription, int $planId, string $cycle, User $actor): TenantSubscription
    {
        $plan = $this->activePlan($planId);
        $from = $subscription->plan;
        if ($from?->id === $plan->id && $subscription->billing_cycle === $cycle) {
            throw ValidationException::withMessages(['saas_plan_id' => ['Escolha um plano ou ciclo diferente do atual.']]);
        }

        $exceeded = [];
        foreach (TenantQuotaService::RESOURCES as $resource => [$label, $unit, $monthly]) {
            $limit = $plan->limits[$resource] ?? null;
            if ($monthly || $limit === null || $limit === '') {
                continue;
            }
            $usage = $this->quotas->usage($subscription->tenant_id, $resource);
            if ($usage > (int) $limit) {
                $exceeded[] = "{$label}: {$usage} em uso, limite {$limit}";
            }
        }
        if ($exceeded) {
            throw ValidationException::withMessages(['saas_plan_id' => ['O uso atual passa dos limites do novo plano — '.implode('; ', $exceeded).'.']]);
        }

        $oldPrice = (float) $subscription->price;
        DB::transaction(function () use ($subscription, $plan, $cycle, $actor, $from, $oldPrice) {
            $subscription->update([
                'saas_plan_id' => $plan->id,
                'billing_cycle' => $cycle,
                'price' => $plan->priceFor($cycle),
            ]);
            $this->event($subscription, 'plan_changed', $actor, $from?->id, $plan->id, [
                'billing_cycle' => $cycle,
                'direction' => (float) $plan->priceFor($cycle) >= $oldPrice ? 'upgrade' : 'downgrade',
                'old_price' => $oldPrice,
                'new_price' => (float) $plan->priceFor($cycle),
            ]);
        });

        $this->audit->log($actor, $subscription->tenant_id, 'subscription.plan_changed', 'Plano alterado: '.($from?->name ?? '—')." → {$plan->name} ({$this->cycleLabel($cycle)})");
        $this->entitlements->flush($subscription->tenant_id);

        return $subscription->fresh('plan');
    }

    /** Registra a renovação: avança o vencimento um ciclo e encerra o teste, se houver. */
    public function renew(TenantSubscription $subscription, User $actor): TenantSubscription
    {
        $this->ensureStatus($subscription, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE, TenantSubscription::TRIALING], 'Só assinaturas ativas, em atraso ou em teste podem ser renovadas.');
        $base = $subscription->current_period_end && $subscription->status !== TenantSubscription::TRIALING
            ? Carbon::parse($subscription->current_period_end)
            : BusinessDate::today();
        $end = $this->periodEnd($base, $subscription->billing_cycle);

        $subscription->update(['status' => TenantSubscription::ACTIVE, 'current_period_end' => $end, 'trial_ends_at' => $subscription->status === TenantSubscription::TRIALING ? BusinessDate::today() : $subscription->trial_ends_at]);
        $this->event($subscription, 'renewed', $actor, null, null, ['current_period_end' => $end->toDateString()]);
        $this->audit->log($actor, $subscription->tenant_id, 'subscription.renewed', 'Assinatura renovada até '.$end->format('d/m/Y'));
        $this->entitlements->flush($subscription->tenant_id);

        return $subscription->fresh('plan');
    }

    public function cancel(TenantSubscription $subscription, string $reason, User $actor): TenantSubscription
    {
        $this->ensureStatus($subscription, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE, TenantSubscription::TRIALING], 'A assinatura já está encerrada.');
        $subscription->update(['status' => TenantSubscription::CANCELED, 'canceled_at' => now(), 'cancel_reason' => $reason]);
        $this->event($subscription, 'canceled', $actor, null, null, ['reason' => $reason]);
        $this->audit->log($actor, $subscription->tenant_id, 'subscription.canceled', "Assinatura cancelada: {$reason}");
        $this->entitlements->flush($subscription->tenant_id);

        return $subscription->fresh('plan');
    }

    public function reactivate(TenantSubscription $subscription, User $actor): TenantSubscription
    {
        $this->ensureStatus($subscription, [TenantSubscription::CANCELED, TenantSubscription::EXPIRED], 'Só assinaturas canceladas ou expiradas podem ser reativadas.');
        $today = BusinessDate::today();
        $subscription->update([
            'status' => TenantSubscription::ACTIVE,
            'canceled_at' => null,
            'cancel_reason' => null,
            'current_period_end' => $this->periodEnd($today, $subscription->billing_cycle),
        ]);
        $this->event($subscription, 'reactivated', $actor);
        $this->audit->log($actor, $subscription->tenant_id, 'subscription.reactivated', 'Assinatura reativada');
        $this->entitlements->flush($subscription->tenant_id);

        return $subscription->fresh('plan');
    }

    public function extendTrial(TenantSubscription $subscription, int $days, User $actor): TenantSubscription
    {
        $this->ensureStatus($subscription, [TenantSubscription::TRIALING, TenantSubscription::EXPIRED], 'Só é possível estender o teste de assinaturas em teste ou com teste expirado.');
        $base = $subscription->status === TenantSubscription::TRIALING && $subscription->trial_ends_at
            ? Carbon::parse($subscription->trial_ends_at)
            : BusinessDate::today();
        $end = $base->copy()->addDays($days);

        $subscription->update(['status' => TenantSubscription::TRIALING, 'trial_ends_at' => $end, 'current_period_end' => $end]);
        $this->event($subscription, 'trial_extended', $actor, null, null, ['days' => $days, 'trial_ends_at' => $end->toDateString()]);
        $this->audit->log($actor, $subscription->tenant_id, 'subscription.trial_extended', "Teste estendido em {$days} dias (até {$end->format('d/m/Y')})");
        $this->entitlements->flush($subscription->tenant_id);

        return $subscription->fresh('plan');
    }

    public function setDiscount(TenantSubscription $subscription, float $percent, User $actor): TenantSubscription
    {
        $old = (float) $subscription->discount_percent;
        $subscription->update(['discount_percent' => $percent]);
        $this->event($subscription, 'discount_changed', $actor, null, null, ['from' => $old, 'to' => $percent]);
        $this->audit->log($actor, $subscription->tenant_id, 'subscription.discount_changed', "Desconto alterado de {$old}% para {$percent}%");

        return $subscription->fresh('plan');
    }

    /** Teste vencido → expirada; vencimento passado → em atraso. Não suspende o tenant (decisão do super admin). */
    public function expireOverdue(): array
    {
        $today = BusinessDate::today()->toDateString();
        $counts = ['expired' => 0, 'past_due' => 0];

        TenantSubscription::query()->where('status', TenantSubscription::TRIALING)->whereDate('trial_ends_at', '<', $today)->each(function (TenantSubscription $s) use (&$counts) {
            $s->update(['status' => TenantSubscription::EXPIRED]);
            $this->event($s, 'trial_expired', null);
            $this->entitlements->flush($s->tenant_id);
            $counts['expired']++;
        });
        TenantSubscription::query()->where('status', TenantSubscription::ACTIVE)->whereDate('current_period_end', '<', $today)->each(function (TenantSubscription $s) use (&$counts) {
            $s->update(['status' => TenantSubscription::PAST_DUE]);
            $this->event($s, 'past_due', null);
            $this->entitlements->flush($s->tenant_id);
            $counts['past_due']++;
        });

        return $counts;
    }

    private function activePlan(int $planId): SaasPlan
    {
        $plan = SaasPlan::query()->find($planId);
        if (! $plan || $plan->status !== 'active') {
            throw ValidationException::withMessages(['saas_plan_id' => ['Plano inválido ou inativo.']]);
        }

        return $plan;
    }

    private function ensureStatus(TenantSubscription $subscription, array $allowed, string $message): void
    {
        if (! in_array($subscription->status, $allowed, true)) {
            throw ValidationException::withMessages(['status' => [$message]]);
        }
    }

    private function periodEnd(Carbon $from, string $cycle): Carbon
    {
        return $cycle === 'yearly' ? $from->copy()->addYearNoOverflow() : $from->copy()->addMonthNoOverflow();
    }

    private function cycleLabel(string $cycle): string
    {
        return $cycle === 'yearly' ? 'anual' : 'mensal';
    }

    private function event(TenantSubscription $subscription, string $type, ?User $actor, ?int $fromPlan = null, ?int $toPlan = null, ?array $data = null): void
    {
        TenantSubscriptionEvent::query()->create([
            'tenant_id' => $subscription->tenant_id,
            'tenant_subscription_id' => $subscription->id,
            'type' => $type,
            'from_plan_id' => $fromPlan,
            'to_plan_id' => $toPlan,
            'data' => $data,
            'user_id' => $actor?->id,
        ]);
    }
}
