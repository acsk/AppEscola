<?php

namespace App\Services\Bi;

use App\Models\TenantSetting;

/**
 * Critérios pedagógicos da escola (tenant_settings, módulo bi), com o padrão de config/bi.php.
 * Em cada requisição do BI, apply() sobrepõe config('bi.*'), então todos os cálculos usam os
 * critérios da escola sem receber parâmetro; signature() entra na chave do cache.
 */
class BiCriteria
{
    /** Campo => [mínimo, máximo, inteiro?] */
    public const FIELDS = [
        'goal_pct' => [30, 100, false],
        'evolution_threshold_pp' => [1, 30, false],
        'attendance_alert_below' => [30, 100, false],
        'dedication_days_per_week' => [1, 7, false],
        'profile_min_assessments' => [1, 20, true],
        'profile_min_questions' => [0, 1000, true],
    ];

    /** @return array<string, int|float> */
    public function for(int $tenantId): array
    {
        $saved = TenantSetting::query()
            ->where('tenant_id', $tenantId)
            ->where('module', BiFeatureGate::MODULE)
            ->whereIn('key', array_keys(self::FIELDS))
            ->get()
            ->mapWithKeys(fn (TenantSetting $s) => [$s->key => $s->getTypedValue()]);

        $defaults = $this->defaults();
        $values = [];
        foreach (self::FIELDS as $key => [, , $integer]) {
            $value = $saved->get($key, $defaults[$key]);
            $values[$key] = $integer ? (int) $value : (float) $value;
        }

        return $values;
    }

    /** @return array<string, int|float> */
    public function apply(int $tenantId): array
    {
        $values = $this->for($tenantId);
        foreach ($values as $key => $value) {
            config()->set("bi.{$key}", $value);
        }

        return $values;
    }

    /**
     * @param  array<string, int|float>  $values  já validados
     * @return array<string, int|float>
     */
    public function save(int $tenantId, array $values): array
    {
        foreach (array_intersect_key($values, self::FIELDS) as $key => $value) {
            TenantSetting::query()->updateOrCreate(
                ['tenant_id' => $tenantId, 'module' => BiFeatureGate::MODULE, 'key' => $key],
                ['value' => TenantSetting::wrapValue(self::FIELDS[$key][2] ? (int) $value : (float) $value)],
            );
        }

        return $this->apply($tenantId);
    }

    /**
     * Padrões de config/bi.php, guardados antes da 1ª sobreposição: num processo que atende várias
     * escolas (fila, testes), os critérios de uma não podem virar o padrão da outra.
     *
     * @return array<string, mixed>
     */
    private function defaults(): array
    {
        $defaults = config('bi._defaults');
        if (! is_array($defaults)) {
            $defaults = array_combine(array_keys(self::FIELDS), array_map(fn (string $key) => config("bi.{$key}"), array_keys(self::FIELDS)));
            config()->set('bi._defaults', $defaults);
        }

        return $defaults;
    }

    /** Critérios em vigor (para a chave do cache: mudar a meta não pode servir números antigos). */
    public static function signature(): string
    {
        return md5(json_encode(array_map(fn (string $key) => config("bi.{$key}"), array_keys(self::FIELDS))));
    }
}
