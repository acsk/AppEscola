<?php

namespace App\Services\Saas;

use App\Models\SaasFeature;
use App\Models\SaasPlan;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Planos comerciais e status global das funcionalidades (afetam todos os tenants: invalida o cache geral). */
class SaasCatalogService
{
    public function __construct(
        private readonly SaasEntitlementService $entitlements,
        private readonly SaasAuditService $audit,
        private readonly SaasBillingService $billing,
    ) {
    }

    /** @param  array<string, mixed>  $data */
    public function savePlan(?SaasPlan $plan, array $data, User $actor): SaasPlan
    {
        $data['limits'] = $this->normalizeLimits($data['limits'] ?? []);
        $data['features'] = array_values(array_unique($data['features'] ?? []));
        $data['billing_basis'] = ($data['billing_basis'] ?? SaasPlan::FLAT) === SaasPlan::PER_STUDENT ? SaasPlan::PER_STUDENT : SaasPlan::FLAT;
        $data['gestao_price_monthly'] = ($data['offer_gestao'] ?? false) ? ($data['gestao_price_monthly'] ?? 0) : null;
        $data['price_schedule'] = $data['billing_basis'] === SaasPlan::PER_STUDENT
            ? $this->billing->normalizeSchedule($data['price_schedule'] ?? null)
            : null;
        unset($data['offer_gestao']);
        $tracked = ['name', 'price_monthly', 'price_yearly', 'billing_basis', 'gestao_price_monthly', 'price_schedule', 'trial_days', 'status', 'limits', 'features'];
        $creating = $plan === null;
        $plan ??= new SaasPlan(['slug' => $this->uniqueSlug($data['name'])]);
        $before = $creating ? null : $plan->only($tracked);

        $plan->fill($data)->save();

        $this->audit->log($actor, null, $creating ? 'plan.created' : 'plan.updated', ($creating ? 'Plano criado: ' : 'Plano alterado: ').$plan->name, $creating ? null : [
            'before' => $before,
            'after' => $plan->only($tracked),
        ]);
        $this->entitlements->flush();

        return $plan->fresh();
    }

    public function deletePlan(SaasPlan $plan, User $actor): void
    {
        if ($plan->subscriptions()->exists()) {
            throw ValidationException::withMessages(['plan' => ['Há assinaturas neste plano. Inative o plano em vez de excluir.']]);
        }
        $plan->delete();
        $this->audit->log($actor, null, 'plan.deleted', "Plano excluído: {$plan->name}");
    }

    public function setFeatureStatus(SaasFeature $feature, string $status, User $actor): SaasFeature
    {
        $old = $feature->global_status;
        $feature->update(['global_status' => $status]);
        $this->audit->log($actor, null, 'feature.global_status', "Funcionalidade {$feature->name}: {$old} → {$status}");
        $this->entitlements->flush();

        return $feature;
    }

    /** @return array<string, int|null> só recursos conhecidos; vazio/null = ilimitado. */
    private function normalizeLimits(array $limits): array
    {
        $out = [];
        foreach (TenantQuotaService::RESOURCES as $resource => $_) {
            $value = $limits[$resource] ?? null;
            $out[$resource] = $value === null || $value === '' ? null : max(0, (int) $value);
        }

        return $out;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'plano';
        $slug = $base;
        for ($i = 2; SaasPlan::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
