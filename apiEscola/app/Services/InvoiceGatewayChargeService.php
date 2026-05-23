<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Gera ou reutiliza cobrança no provedor (uso em carnê e automações).
 */
class InvoiceGatewayChargeService
{
    public function __construct(
        private readonly PaymentGatewayFactory $factory,
        private readonly InvoiceCoraChargeAssetsService $chargeAssets,
        private readonly TenantBillingSettingsService $billingSettings,
    ) {
    }

    public function resolveEnvironment(?string $requested, ?User $user): string
    {
        $requestedEnv = (string) ($requested ?? 'prod');
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        if (! app()->environment('production')) {
            return 'stage';
        }

        if ($user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return $requestedEnv ?: 'prod';
        }

        return 'prod';
    }

    /**
     * Apenas sincroniza boleto já emitido no provedor (carnê = montar PDFs, sem nova emissão).
     */
    public function prepareBoletoForCarneBundle(Invoice $invoice, string $environment): Invoice
    {
        $invoice->loadMissing(['tenant', 'student.guardians', 'guardian']);

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            throw new RuntimeException(
                "A cobrança \"{$invoice->description}\" está {$invoice->status} e não pode entrar no carnê."
            );
        }

        $assets = $this->chargeAssets->paymentAssetsFromInvoice($invoice);

        if (! $this->chargeAssets->hasBoletoAssets($assets)) {
            throw new RuntimeException(
                "A cobrança \"{$invoice->description}\" ainda não tem boleto emitido. "
                . 'Gere como Boleto ou Boleto+PIX em Financeiro, ou marque "Emitir faltantes" no carnê.'
            );
        }

        return $this->hydrateIfNeeded($invoice, $assets, $environment);
    }

    /**
     * Garante cobrança em boleto (ou híbrido) no provedor e retorna a fatura atualizada.
     */
    public function ensureBoletoCharge(Invoice $invoice, string $environment, ?string $provider = null): Invoice
    {
        $invoice->loadMissing(['tenant', 'student.guardians', 'guardian']);

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            throw new RuntimeException(
                "A cobrança \"{$invoice->description}\" está {$invoice->status} e não pode entrar no carnê."
            );
        }

        if (! $invoice->due_date) {
            throw new RuntimeException(
                "A cobrança \"{$invoice->description}\" não possui data de vencimento."
            );
        }

        $provider = strtolower(trim((string) ($provider ?? $this->resolveDefaultProvider($invoice->tenant_id))));

        if ($provider === 'manual' || ! PaymentProviderRegistry::supportsGatewayCharge($provider)) {
            throw new RuntimeException('Este tenant não possui provedor de boleto configurado.');
        }

        if (! PaymentGatewayFactory::isSupported($provider)) {
            throw new RuntimeException("Provedor \"{$provider}\" sem integração de cobrança.");
        }

        $storedMethod = $this->chargeAssets->resolveChargeMethodFromInvoice($invoice);

        if ($storedMethod === 'pix' && $invoice->cora_charge_id) {
            throw new RuntimeException(
                "A cobrança \"{$invoice->description}\" já foi emitida em PIX. Carnê exige boleto ou boleto+PIX."
            );
        }

        $assets = $this->chargeAssets->paymentAssetsFromInvoice($invoice);
        if ($invoice->cora_charge_id && $this->chargeAssets->hasBoletoAssets($assets)) {
            return $this->hydrateIfNeeded($invoice, $assets, $environment);
        }

        if ($this->canReuseOpenCharge($invoice)) {
            $refreshed = $invoice->fresh();
            $reuseAssets = $this->chargeAssets->paymentAssetsFromInvoice($refreshed);
            if ($this->chargeAssets->hasBoletoAssets($reuseAssets)) {
                return $this->hydrateIfNeeded($refreshed, $reuseAssets, $environment);
            }
        }

        try {
            return $this->createAndPersist($invoice, $environment, $provider, 'boleto');
        } catch (ConnectionException|RequestException $e) {
            if ($e instanceof RequestException
                && $coraMethod === 'boleto'
                && $this->shouldRetryAsHybrid($e)) {
                Log::info('InvoiceGatewayChargeService retrying as hybrid after boleto blocked in stage', [
                    'invoice_id' => $invoice->id,
                ]);

                try {
                    return $this->createAndPersist($invoice->fresh(), $environment, $provider, 'hybrid');
                } catch (\Throwable $hybridError) {
                    Log::warning('InvoiceGatewayChargeService hybrid retry failed', [
                        'invoice_id' => $invoice->id,
                        'error' => $hybridError->getMessage(),
                    ]);
                }
            }

            Log::warning('InvoiceGatewayChargeService provider error', [
                'invoice_id' => $invoice->id,
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);

            throw new RuntimeException(
                $this->formatProviderError($e, $invoice, $environment)
            );
        }
    }

    private function createAndPersist(
        Invoice $invoice,
        string $environment,
        string $provider,
        string $coraMethod,
    ): Invoice {
        $result = $this->factory->resolve($provider)->createCharge($invoice, $environment, $coraMethod);

        $storedMethod = $coraMethod === 'hybrid' ? 'hybrid' : 'bank_slip';

        $payloadToPersist = is_array($result['payload']) ? $result['payload'] : [];
        $payloadToPersist['integration'] = array_merge(
            (array) ($payloadToPersist['integration'] ?? []),
            ['provider' => $provider, 'environment' => $environment]
        );

        $invoice->update([
            'payment_method' => $storedMethod,
            'cora_charge_id' => $result['external_id'],
            'cora_status' => $result['status'],
            'cora_payment_url' => $this->chargeAssets->coerceScalarString($result['payment_url'] ?? null),
            'cora_pix_copy_paste' => $this->chargeAssets->coerceScalarString($result['pix_copy_paste'] ?? null),
            'boleto_number' => $this->chargeAssets->coerceScalarString($result['boleto_number'] ?? null),
            'boleto_digitable' => $this->chargeAssets->coerceScalarString($result['boleto_digitable'] ?? null),
            'cora_payload' => $payloadToPersist,
            'cora_last_synced_at' => now(),
        ]);

        $fresh = $invoice->fresh();
        $assets = $this->chargeAssets->paymentAssetsFromInvoice($fresh);

        return $this->hydrateIfNeeded($fresh, $assets, $environment);
    }

    private function hydrateIfNeeded(Invoice $invoice, array $assets, string $environment): Invoice
    {
        if ($this->chargeAssets->shouldHydrateFromProvider($invoice, $assets)) {
            $this->chargeAssets->hydrateFromProvider($invoice, $this->factory, $assets, $environment);
        }

        return $invoice->fresh();
    }

    private function resolveDefaultProvider(int $tenantId): string
    {
        $tenant = \App\Models\Tenant::query()->find($tenantId);
        if (! $tenant) {
            return 'cora';
        }

        $payment = $this->billingSettings->scope($tenant, 'payment');

        return strtolower(trim((string) ($payment['default_provider'] ?? 'cora')));
    }

    private function canReuseOpenCharge(Invoice $invoice): bool
    {
        if (! $invoice->cora_charge_id) {
            return false;
        }

        $status = strtoupper(trim((string) $invoice->cora_status));

        return in_array($status, ['OPEN', 'PENDING', 'PROCESSING', 'CREATED'], true);
    }

    private function shouldRetryAsHybrid(RequestException $e): bool
    {
        $message = strtolower((string) ($e->response?->json('message') ?? ''));
        $code = strtoupper((string) ($e->response?->json('code') ?? ''));

        return $code === 'REC-0030'
            || str_contains($message, 'bank slip not registered in cip')
            || str_contains($message, 'not registered in cip');
    }

    private function formatProviderError(
        ConnectionException|RequestException $e,
        Invoice $invoice,
        string $environment,
    ): string {
        if ($e instanceof RequestException) {
            $message = $this->resolveProviderUserMessage($e->response, 'Falha ao emitir cobrança no provedor.');

            if ($environment === 'stage' && $this->shouldRetryAsHybrid($e)) {
                $message .= ' No ambiente de testes (stage) da Cora, boleto puro costuma falhar; tente novamente (o sistema tenta boleto+PIX) ou use produção.';
            }

            return "Cobrança \"{$invoice->description}\": {$message}";
        }

        return 'Falha de comunicação com o provedor para a cobrança "' . $invoice->description . '".';
    }

    private function resolveProviderUserMessage(?Response $response, string $fallback): string
    {
        if ($response === null) {
            return $fallback;
        }

        $providerMessage = trim((string) ($response->json('message') ?? ''));
        $providerCode = trim((string) ($response->json('code') ?? ''));

        if ($providerMessage !== '' && $providerCode !== '') {
            return "{$providerMessage} ({$providerCode})";
        }

        if ($providerMessage !== '') {
            return $providerMessage;
        }

        return $fallback;
    }
}
