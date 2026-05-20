<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Tenant;

/**
 * Regras compartilhadas de métodos/provedor entre painel admin e app do aluno.
 */
class InvoicePaymentSettingsResolver
{
    /**
     * @return array<string, mixed>
     */
    public function paymentScope(int $tenantId): array
    {
        static $cache = [];

        if (isset($cache[$tenantId])) {
            return $cache[$tenantId];
        }

        $tenant = Tenant::find($tenantId);
        if (! $tenant) {
            return $cache[$tenantId] = [];
        }

        return $cache[$tenantId] = app(TenantBillingSettingsService::class)->scope($tenant, 'payment');
    }

    public function defaultProviderSlug(int $tenantId): string
    {
        $slug = strtolower((string) ($this->paymentScope($tenantId)['default_provider'] ?? 'cora'));

        return PaymentProviderRegistry::exists($slug) ? $slug : 'cora';
    }

    public function supportsGatewayCharge(int $tenantId): bool
    {
        return PaymentProviderRegistry::supportsGatewayCharge($this->defaultProviderSlug($tenantId));
    }

    /**
     * @return array<int, string>
     */
    public function enabledMethodsForTenant(int $tenantId): array
    {
        $provider = $this->defaultProviderSlug($tenantId);
        $paymentSettings = $this->paymentScope($tenantId);
        $rawEnabledMethods = $paymentSettings['enabled_methods'] ?? null;

        $enabledMethods = is_array($rawEnabledMethods)
            ? array_values(array_unique(array_map(static function ($method): string {
                $normalized = strtolower(trim((string) $method));

                return $normalized === 'bank_slip' ? 'boleto' : $normalized;
            }, $rawEnabledMethods)))
            : PaymentProviderRegistry::defaultEnabledMethods($provider);

        $providerMethods = PaymentProviderRegistry::supportedMethods($provider);
        $enabledMethods = array_values(array_intersect($enabledMethods, $providerMethods));

        if ($enabledMethods === []) {
            $enabledMethods = PaymentProviderRegistry::defaultEnabledMethods($provider);
            $enabledMethods = array_values(array_intersect($enabledMethods, $providerMethods));
        }

        return $enabledMethods;
    }

    /**
     * Métodos habilitados para geração via gateway (somente PIX/boleto/híbrido).
     *
     * @return array<int, string>
     */
    public function gatewayChargeMethodsForTenant(int $tenantId): array
    {
        $gatewayMethods = ['pix', 'boleto', 'hybrid'];

        return array_values(array_intersect($this->enabledMethodsForTenant($tenantId), $gatewayMethods));
    }

    public function configuredDefaultMethod(int $tenantId): ?string
    {
        $paymentSettings = $this->paymentScope($tenantId);
        $enabledMethods = $this->enabledMethodsForTenant($tenantId);

        $configuredDefaultMethod = strtolower((string) ($paymentSettings['default_method'] ?? ''));
        $configuredDefaultMethod = $configuredDefaultMethod === 'bank_slip' ? 'boleto' : $configuredDefaultMethod;

        if (! in_array($configuredDefaultMethod, $enabledMethods, true)) {
            return null;
        }

        return $configuredDefaultMethod;
    }

    /**
     * @return array{method: ?string, reason: ?string}
     */
    public function resolveMethodLock(Invoice $invoice): array
    {
        $lockedSyncedMethod = $this->resolveLockedMethodForSyncedInvoice($invoice);

        if ($lockedSyncedMethod !== null) {
            return [
                'method' => $lockedSyncedMethod,
                'reason' => 'synced_charge_method_lock',
            ];
        }

        if (! $invoice->cora_charge_id) {
            return [
                'method' => null,
                'reason' => null,
            ];
        }

        if ($invoice->payment_method === 'hybrid') {
            return [
                'method' => 'hybrid',
                'reason' => 'method_already_charged',
            ];
        }

        if ($invoice->payment_method === 'pix') {
            return [
                'method' => 'pix',
                'reason' => 'method_already_charged',
            ];
        }

        if (in_array($invoice->payment_method, ['bank_slip', 'boleto'], true)) {
            return [
                'method' => 'bank_slip',
                'reason' => 'method_already_charged',
            ];
        }

        return [
            'method' => null,
            'reason' => null,
        ];
    }

    private function resolveLockedMethodForSyncedInvoice(Invoice $invoice): ?string
    {
        if (! $invoice->cora_charge_id) {
            return null;
        }

        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $origin = strtolower(trim((string) data_get($payload, 'integration.origin')));
        $methodLocked = (bool) data_get($payload, 'integration.method_locked', false);
        $originalMethod = strtolower(trim((string) data_get($payload, 'integration.original_method')));

        if ($origin === 'cora_sync' && $methodLocked) {
            if ($originalMethod === 'hybrid') {
                return 'bank_slip';
            }

            if (in_array($originalMethod, ['pix', 'bank_slip'], true)) {
                return $originalMethod;
            }

            return $this->resolveStoredMethodForExistingCharge($invoice);
        }

        $hasLocalInvoiceMetadata = data_get($payload, 'metadata.invoice_id') !== null;
        $looksLikeImported = str_contains(strtolower((string) $invoice->description), 'importada');

        if (! $hasLocalInvoiceMetadata && $looksLikeImported) {
            return $this->resolveStoredMethodForExistingCharge($invoice);
        }

        return null;
    }

    public function resolveStoredMethodForExistingCharge(Invoice $invoice): ?string
    {
        $paymentMethod = strtolower((string) $invoice->payment_method);

        if ($paymentMethod === 'hybrid') {
            return 'bank_slip';
        }

        if (in_array($paymentMethod, ['boleto', 'bank_slip'], true)) {
            return 'bank_slip';
        }

        if ($paymentMethod === 'pix') {
            return 'pix';
        }

        if ($invoice->boleto_digitable || $invoice->boleto_number || $invoice->cora_payment_url) {
            return 'bank_slip';
        }

        if ($invoice->cora_pix_copy_paste) {
            return 'pix';
        }

        return null;
    }
}
