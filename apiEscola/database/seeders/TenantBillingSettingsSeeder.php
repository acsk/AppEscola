<?php

namespace Database\Seeders;

use App\Models\Tenant;
use App\Services\TenantBillingSettingsService;
use Illuminate\Database\Seeder;

/**
 * Seed inicial das configurações de cobrança por tenant.
 *
 * Define quatro presets prontos de "modo de cobrança":
 *  - pix      → só PIX
 *  - boleto   → só boleto bancário
 *  - hybrid   → boleto + PIX no QR code do boleto
 *  - all      → habilita todos os métodos disponíveis no provedor
 *
 * Como usar:
 *   php artisan db:seed --class=TenantBillingSettingsSeeder
 *
 * Para escolher o preset, defina a env var TENANT_BILLING_PRESET antes de rodar:
 *   TENANT_BILLING_PRESET=pix        php artisan db:seed --class=TenantBillingSettingsSeeder
 *   TENANT_BILLING_PRESET=boleto     php artisan db:seed --class=TenantBillingSettingsSeeder
 *   TENANT_BILLING_PRESET=hybrid     php artisan db:seed --class=TenantBillingSettingsSeeder   # default
 *   TENANT_BILLING_PRESET=all        php artisan db:seed --class=TenantBillingSettingsSeeder
 *
 * Idempotente: só aplica em tenants que ainda não possuem o escopo `payment` salvo.
 * Para forçar reaplicação, defina TENANT_BILLING_FORCE=1.
 */
class TenantBillingSettingsSeeder extends Seeder
{
    /**
     * @var array<string, array{enabled_methods: array<int,string>, default_method: string, default_provider: string, auto_sync_charges: bool}>
     */
    private const PRESETS = [
        'pix' => [
            'enabled_methods'   => ['pix'],
            'default_method'    => 'pix',
            'default_provider'  => 'cora',
            'auto_sync_charges' => true,
        ],
        'boleto' => [
            'enabled_methods'   => ['boleto'],
            'default_method'    => 'boleto',
            'default_provider'  => 'cora',
            'auto_sync_charges' => true,
        ],
        'hybrid' => [
            'enabled_methods'   => ['pix', 'boleto', 'hybrid'],
            'default_method'    => 'hybrid',
            'default_provider'  => 'cora',
            'auto_sync_charges' => true,
        ],
        'all' => [
            'enabled_methods'   => ['pix', 'boleto', 'hybrid', 'credit_card', 'debit_card', 'cash', 'transfer'],
            'default_method'    => 'hybrid',
            'default_provider'  => 'cora',
            'auto_sync_charges' => true,
        ],
    ];

    /**
     * Defaults conservadores para o escopo de billing (regras de geração).
     *
     * @var array<string, mixed>
     */
    private const BILLING_DEFAULTS = [
        'charges_enrollment_fee'             => true,
        'enrollment_fee_covers_first_month'  => false,
        'allow_monthlies_before_fee_paid'    => true,
        'default_payment_due_day'            => 10,
    ];

    public function run(): void
    {
        $presetName = strtolower((string) env('TENANT_BILLING_PRESET', 'hybrid'));
        if ($presetName === 'bank_slip') {
            $presetName = 'boleto';
        }
        if (! array_key_exists($presetName, self::PRESETS)) {
            $this->command?->warn("Preset '{$presetName}' inválido. Usando 'hybrid'.");
            $presetName = 'hybrid';
        }

        $force   = (bool) env('TENANT_BILLING_FORCE', false);
        $preset  = self::PRESETS[$presetName];
        $service = app(TenantBillingSettingsService::class);

        $applied = 0;
        $skipped = 0;

        Tenant::query()->orderBy('id')->each(function (Tenant $tenant) use ($service, $preset, $force, &$applied, &$skipped) {
            $settings = is_array($tenant->settings) ? $tenant->settings : [];

            $hasPayment = isset($settings['payment']) && is_array($settings['payment']) && $settings['payment'] !== [];
            $hasBilling = isset($settings['billing']) && is_array($settings['billing']) && $settings['billing'] !== [];

            if (! $force && $hasPayment && $hasBilling) {
                $skipped++;
                return;
            }

            if ($force || ! $hasPayment) {
                $service->updateScope($tenant, 'payment', $preset);
            }

            if ($force || ! $hasBilling) {
                $service->updateScope($tenant, 'billing', self::BILLING_DEFAULTS);
            }

            $applied++;
        });

        $this->command?->info("TenantBillingSettingsSeeder: preset='{$presetName}', aplicados={$applied}, ignorados={$skipped}.");
    }
}
