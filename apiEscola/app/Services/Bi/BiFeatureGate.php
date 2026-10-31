<?php

namespace App\Services\Bi;

use App\Models\TenantSetting;

/**
 * Funcionalidades do BI habilitadas por tenant (tenant_settings, module=bi).
 * Chaves: enabled (bool), plan (basic|advanced), ai_enabled (bool).
 */
class BiFeatureGate
{
    public const MODULE = 'bi';

    public const PLAN_BASIC = 'basic';

    public const PLAN_ADVANCED = 'advanced';

    /** @return array{enabled: bool, plan: string, ai_enabled: bool} */
    public function settings(int $tenantId): array
    {
        $values = TenantSetting::query()
            ->where('tenant_id', $tenantId)
            ->where('module', self::MODULE)
            ->get()
            ->mapWithKeys(fn (TenantSetting $setting) => [$setting->key => $setting->getTypedValue()]);

        $plan = $values->get('plan', config('bi.default_plan', self::PLAN_ADVANCED));

        return [
            'enabled' => (bool) $values->get('enabled', true),
            'plan' => in_array($plan, [self::PLAN_BASIC, self::PLAN_ADVANCED], true) ? $plan : self::PLAN_BASIC,
            'ai_enabled' => (bool) $values->get('ai_enabled', false),
        ];
    }

    /** O plano do tenant cobre o recurso? (advanced inclui basic) */
    public function allows(array $settings, string $requiredPlan): bool
    {
        if (! $settings['enabled']) {
            return false;
        }

        return $requiredPlan === self::PLAN_BASIC || $settings['plan'] === self::PLAN_ADVANCED;
    }
}
