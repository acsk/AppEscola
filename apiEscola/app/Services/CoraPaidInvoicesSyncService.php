<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Tenant;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Reconcilia faturas locais com cobranças Cora (boleto/PIX/híbrido).
 * Usado pelo comando diário no servidor compartilhado.
 */
class CoraPaidInvoicesSyncService
{
    private const PAID_STATUSES = ['PAID', 'IN_PAYMENT', 'COMPLETED', 'RECEIVED'];

    private const CANCELLED_STATUSES = ['CANCELLED', 'CANCELED', 'VOIDED', 'EXPIRED'];

    /** Tentativas extras quando a Cora responde 429 (rate limit). */
    private const RATE_LIMIT_RETRIES = 4;

    public function __construct(
        private readonly PaymentGatewayFactory $gatewayFactory,
        private readonly InvoicePaymentSettingsResolver $paymentSettingsResolver,
    ) {
    }

    /**
     * @return array{
     *   checked: int,
     *   marked_paid: int,
     *   marked_cancelled: int,
     *   unchanged: int,
     *   failed: int,
     *   skipped: int,
     *   paid_invoice_ids: array<int, int>,
     *   cancelled_invoice_ids: array<int, int>,
     *   failures: array<int, array{invoice_id: int, message: string}>
     * }
     */
    public function sync(
        ?int $tenantId = null,
        string $environment = 'prod',
        bool $dryRun = false,
        ?int $limit = null,
        int $sleepMs = 800,
    ): array {
        $environment = $environment === 'production' ? 'prod' : $environment;
        if (! in_array($environment, ['prod', 'stage'], true)) {
            $environment = 'prod';
        }

        $summary = [
            'checked' => 0,
            'marked_paid' => 0,
            'marked_cancelled' => 0,
            'unchanged' => 0,
            'failed' => 0,
            'skipped' => 0,
            'paid_invoice_ids' => [],
            'cancelled_invoice_ids' => [],
            'failures' => [],
        ];

        $query = Invoice::query()
            ->with('tenant')
            ->whereNotNull('cora_charge_id')
            ->where('cora_charge_id', '!=', '')
            ->whereIn('status', ['pending', 'overdue'])
            ->orderBy('id');

        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        if ($limit !== null && $limit > 0) {
            $query->limit($limit);
        }

        /** @var \Illuminate\Support\Collection<int, Invoice> $invoices */
        $invoices = $query->get();

        foreach ($invoices as $invoice) {
            $summary['checked']++;

            $tenant = $invoice->tenant;
            if (! $tenant instanceof Tenant) {
                $summary['skipped']++;
                $summary['failures'][] = [
                    'invoice_id' => (int) $invoice->id,
                    'message' => 'Tenant não encontrado.',
                ];
                continue;
            }

            if (! $this->isCoraCharge($invoice, $tenant)) {
                $summary['skipped']++;
                continue;
            }

            $env = $this->resolveEnvironment($invoice, $environment);
            $chargeId = trim((string) $invoice->cora_charge_id);

            try {
                $external = $this->fetchInvoiceWithRetry($tenant, $chargeId, $env);

                $result = $this->applyExternalStatus($invoice, $external, $dryRun);

                if ($result === 'paid') {
                    $summary['marked_paid']++;
                    $summary['paid_invoice_ids'][] = (int) $invoice->id;
                } elseif ($result === 'cancelled') {
                    $summary['marked_cancelled']++;
                    $summary['cancelled_invoice_ids'][] = (int) $invoice->id;
                } else {
                    $summary['unchanged']++;
                }
            } catch (Throwable $e) {
                $summary['failed']++;
                $summary['failures'][] = [
                    'invoice_id' => (int) $invoice->id,
                    'message' => $e->getMessage(),
                ];

                Log::warning('CoraPaidInvoicesSyncService failed for invoice', [
                    'invoice_id' => $invoice->id,
                    'tenant_id' => $invoice->tenant_id,
                    'cora_charge_id' => $chargeId,
                    'environment' => $env,
                    'error' => $e->getMessage(),
                ]);
            }

            if ($sleepMs > 0) {
                usleep($sleepMs * 1000);
            }
        }

        Log::info('CoraPaidInvoicesSyncService finished', [
            'tenant_id' => $tenantId,
            'environment' => $environment,
            'dry_run' => $dryRun,
            'summary' => [
                'checked' => $summary['checked'],
                'marked_paid' => $summary['marked_paid'],
                'marked_cancelled' => $summary['marked_cancelled'],
                'unchanged' => $summary['unchanged'],
                'failed' => $summary['failed'],
                'skipped' => $summary['skipped'],
            ],
        ]);

        return $summary;
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchInvoiceWithRetry(Tenant $tenant, string $chargeId, string $environment): array
    {
        $attempt = 0;
        $lastException = null;

        while ($attempt <= self::RATE_LIMIT_RETRIES) {
            try {
                return $this->gatewayFactory
                    ->resolve('cora')
                    ->getInvoiceById($tenant, $chargeId, $environment);
            } catch (RequestException $e) {
                $lastException = $e;
                $status = $e->response?->status();

                if ($status !== 429 || $attempt >= self::RATE_LIMIT_RETRIES) {
                    throw $e;
                }

                // Backoff: 2s, 4s, 8s, 16s
                $waitSeconds = 2 ** ($attempt + 1);
                Log::warning('CoraPaidInvoicesSyncService rate limited, retrying', [
                    'cora_charge_id' => $chargeId,
                    'attempt' => $attempt + 1,
                    'wait_seconds' => $waitSeconds,
                ]);
                sleep($waitSeconds);
                $attempt++;
            }
        }

        throw $lastException ?? new \RuntimeException('Falha ao consultar cobrança na Cora.');
    }

    private function isCoraCharge(Invoice $invoice, Tenant $tenant): bool
    {
        $fromPayload = strtolower(trim((string) data_get($invoice->cora_payload, 'integration.provider', '')));

        if ($fromPayload !== '') {
            return $fromPayload === 'cora';
        }

        return $this->paymentSettingsResolver->defaultProviderSlug((int) $tenant->id) === 'cora';
    }

    private function resolveEnvironment(Invoice $invoice, string $fallback): string
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $stored = strtolower(trim((string) data_get($payload, 'integration.environment', '')));

        if (in_array($stored, ['prod', 'production'], true)) {
            return 'prod';
        }

        if ($stored === 'stage') {
            return 'stage';
        }

        return $fallback;
    }

    /**
     * @param  array<string, mixed>  $external
     * @return 'paid'|'cancelled'|'unchanged'
     */
    private function applyExternalStatus(Invoice $invoice, array $external, bool $dryRun): string
    {
        $providerStatus = strtoupper(trim((string) ($external['status'] ?? '')));
        $existingPayload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];

        $updates = [
            'cora_payload' => array_replace_recursive($existingPayload, $external, [
                'last_status_check' => [
                    'source' => 'cora:sync-paid-invoices',
                    'checked_at' => now()->toIso8601String(),
                ],
            ]),
            'cora_last_synced_at' => now(),
        ];

        if ($providerStatus !== '') {
            $updates['cora_status'] = $providerStatus;
        }

        $outcome = 'unchanged';

        if (in_array($providerStatus, self::PAID_STATUSES, true) && $invoice->status !== 'paid') {
            $updates['status'] = 'paid';
            $updates['paid_at'] = $this->extractPaidAt($external) ?? $invoice->paid_at ?? now();
            $paymentMethod = $this->resolvePaymentMethod($invoice, $external);
            if ($paymentMethod !== null) {
                $updates['payment_method'] = $paymentMethod;
            }
            $outcome = 'paid';
        } elseif (
            in_array($providerStatus, self::CANCELLED_STATUSES, true)
            && ! in_array($invoice->status, ['paid', 'cancelled'], true)
        ) {
            $updates['status'] = 'cancelled';
            $outcome = 'cancelled';
        }

        if ($dryRun) {
            return $outcome;
        }

        $invoice->update($updates);

        if ($outcome !== 'unchanged') {
            Log::info('CoraPaidInvoicesSyncService invoice updated', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'outcome' => $outcome,
                'provider_status' => $providerStatus,
                'paid_at' => isset($updates['paid_at'])
                    ? (string) $updates['paid_at']
                    : null,
            ]);
        }

        return $outcome;
    }

    /**
     * @param  array<string, mixed>  $external
     */
    private function extractPaidAt(array $external): ?Carbon
    {
        $candidates = [
            $external['paid_at'] ?? null,
            $external['occurrence_date'] ?? null,
            data_get($external, 'payment.paid_at'),
            data_get($external, 'payment_date'),
            data_get($external, 'payments.0.finalized_at'),
            data_get($external, 'payments.0.created_at'),
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) || trim($candidate) === '') {
                continue;
            }

            try {
                return Carbon::parse($candidate);
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $external
     */
    private function resolvePaymentMethod(Invoice $invoice, array $external): ?string
    {
        $current = strtolower(trim((string) ($invoice->payment_method ?? '')));
        if (in_array($current, ['bank_slip', 'boleto', 'pix', 'hybrid'], true)) {
            return $current === 'boleto' ? 'bank_slip' : $current;
        }

        $method = strtoupper(trim((string) (
            data_get($external, 'payments.0.method')
            ?? data_get($external, 'payment.method')
            ?? ''
        )));

        return match ($method) {
            'BANK_SLIP', 'BOLETO' => 'bank_slip',
            'PIX' => 'pix',
            default => $invoice->payment_method ?: 'bank_slip',
        };
    }
}
