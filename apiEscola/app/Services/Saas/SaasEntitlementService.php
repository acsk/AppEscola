<?php

namespace App\Services\Saas;

use App\Models\SaasFeature;
use App\Models\TenantFeatureOverride;
use App\Models\TenantQuotaOverride;
use App\Models\TenantSubscription;
use Illuminate\Support\Facades\Cache;

/**
 * O que cada tenant pode usar: funcionalidades efetivas e limites do plano.
 *
 * Ordem da decisão por funcionalidade: desligada globalmente → bloqueada; exceção do tenant → vale a exceção;
 * em beta → só com exceção; sem assinatura (tenant legado) → liberada; senão → o plano decide.
 * Limites: exceção do tenant > plano; sem assinatura → ilimitado.
 */
class SaasEntitlementService
{
    private const CACHE_SECONDS = 600;

    /** @return array{legacy: bool, plan: array{id: int, name: string}|null, subscription_status: string|null, features: array<string, array{enabled: bool, source: string}>, limits: array<string, int|null>} */
    public function forTenant(int $tenantId): array
    {
        return Cache::remember($this->key($tenantId), self::CACHE_SECONDS, fn () => $this->resolve($tenantId));
    }

    public function allows(int $tenantId, string $feature): bool
    {
        return (bool) ($this->forTenant($tenantId)['features'][$feature]['enabled'] ?? false);
    }

    public function limit(int $tenantId, string $resource): ?int
    {
        return $this->forTenant($tenantId)['limits'][$resource] ?? null;
    }

    /** Invalida o cache de todos os tenants (planos, flags globais) ou só de um. */
    public function flush(?int $tenantId = null): void
    {
        if ($tenantId !== null) {
            Cache::forget($this->key($tenantId));

            return;
        }
        Cache::forever('saas:ent:version', $this->version() + 1);
    }

    private function version(): int
    {
        return (int) Cache::get('saas:ent:version', 1);
    }

    private function key(int $tenantId): string
    {
        return 'saas:ent:'.$this->version().':'.$tenantId;
    }

    private function resolve(int $tenantId): array
    {
        $subscription = TenantSubscription::query()->with('plan')->where('tenant_id', $tenantId)->first();
        $plan = $subscription?->plan;
        $planFeatures = $plan?->features ?? [];
        $overrides = TenantFeatureOverride::query()->where('tenant_id', $tenantId)->pluck('enabled', 'feature_key');

        $features = [];
        foreach (SaasFeature::query()->orderBy('order')->get(['key', 'global_status']) as $feature) {
            $override = $overrides[$feature->key] ?? null;
            [$enabled, $source] = match (true) {
                $feature->global_status === SaasFeature::DISABLED => [false, 'global_disabled'],
                $override !== null => [(bool) $override, 'override'],
                $feature->global_status === SaasFeature::BETA => [false, 'beta'],
                $subscription === null => [true, 'legacy'],
                default => [in_array($feature->key, $planFeatures, true), 'plan'],
            };
            $features[$feature->key] = ['enabled' => $enabled, 'source' => $source];
        }

        $limits = [];
        if ($subscription !== null) {
            foreach (TenantQuotaService::RESOURCES as $resource => $_) {
                $value = $plan?->limits[$resource] ?? null;
                $limits[$resource] = $value === null || $value === '' ? null : (int) $value;
            }
        }
        foreach (TenantQuotaOverride::query()->where('tenant_id', $tenantId)->get(['resource', 'limit_value']) as $override) {
            $limits[$override->resource] = $override->limit_value;
        }

        return [
            'legacy' => $subscription === null,
            'plan' => $plan ? ['id' => $plan->id, 'name' => $plan->name] : null,
            'subscription_status' => $subscription?->status,
            'features' => $features,
            'limits' => $limits,
        ];
    }
}
