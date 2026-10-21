<?php

namespace App\Services\Asaas;

use App\Models\Invoice;
use App\Models\PaymentWebhookEvent;
use App\Models\Tenant;
use App\Services\Gateways\AsaasPaymentGateway;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Processa eventos de cobrança do webhook Asaas.
 *
 * O payload só diz QUAL cobrança mudou. O estado aplicado vem sempre da API do Asaas,
 * consultada com a credencial do tenant autenticado — um payload forjado não paga,
 * cancela nem altera faturas, e eventos fora de ordem convergem para o estado real.
 */
class AsaasWebhookProcessor
{
    private const PROCESSED_EVENTS = [
        'PAYMENT_CREATED',
        'PAYMENT_RECEIVED',
        'PAYMENT_CONFIRMED',
        'PAYMENT_OVERDUE',
        'PAYMENT_DELETED',
        'PAYMENT_REFUNDED',
    ];

    /** Diferença máxima aceita entre o valor da cobrança no Asaas e o valor da fatura. */
    private const AMOUNT_TOLERANCE = 0.009;

    public function __construct(
        private readonly AsaasInvoicePaymentApplier $paymentApplier,
        private readonly AsaasPaymentStatusMapper $statusMapper,
        private readonly AsaasPaymentGateway $gateway,
        private readonly AsaasCredentialService $credentials,
    ) {
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{status: string, message: string, invoice_id?: int}
     *
     * @throws AsaasWebhookVerificationUnavailable quando a API do Asaas não pôde confirmar a cobrança
     */
    public function handle(array $payload, AsaasWebhookContext $context): array
    {
        $eventType = strtoupper(trim((string) ($payload['event'] ?? '')));
        $payment = is_array($payload['payment'] ?? null) ? $payload['payment'] : [];
        $paymentId = trim((string) ($payment['id'] ?? ''));

        $webhookEvent = $this->claimEvent($payload, $context, $eventType, $paymentId);

        if ($webhookEvent === null) {
            return ['status' => 'duplicate', 'message' => 'Evento já processado.'];
        }

        if (! in_array($eventType, self::PROCESSED_EVENTS, true) || $paymentId === '') {
            return $this->finish($webhookEvent, PaymentWebhookEvent::STATUS_IGNORED, 'ignored', 'Evento não requer processamento.');
        }

        try {
            [$tenant, $environment, $invoice] = $this->resolveTarget($context, $payment, $paymentId);

            if (! $invoice) {
                Log::warning('Asaas webhook: cobrança sem fatura no tenant autenticado', [
                    'scope' => $context->scope(),
                    'payment_id' => $paymentId,
                    'event' => $eventType,
                ]);

                return $this->finish($webhookEvent, PaymentWebhookEvent::STATUS_FAILED, 'not_found', 'Fatura local não encontrada para o pagamento.');
            }

            $webhookEvent->update(['tenant_id' => $tenant->id, 'invoice_id' => $invoice->id]);

            $remote = $this->fetchVerifiedPayment($tenant, $paymentId, $environment);

            if ($remote === null) {
                Log::warning('Asaas webhook: cobrança não existe na conta Asaas do tenant', [
                    'tenant_id' => $tenant->id,
                    'invoice_id' => $invoice->id,
                    'payment_id' => $paymentId,
                    'event' => $eventType,
                ]);

                return $this->finish($webhookEvent, PaymentWebhookEvent::STATUS_FAILED, 'rejected', 'Cobrança não confirmada na API do Asaas.');
            }

            $ownershipError = $this->ownershipError($invoice, $remote, $paymentId);

            if ($ownershipError !== null) {
                Log::warning('Asaas webhook: cobrança não corresponde à fatura', [
                    'tenant_id' => $tenant->id,
                    'invoice_id' => $invoice->id,
                    'payment_id' => $paymentId,
                    'reason' => $ownershipError,
                ]);

                return $this->finish($webhookEvent, PaymentWebhookEvent::STATUS_FAILED, 'rejected', $ownershipError);
            }

            return DB::transaction(function () use ($webhookEvent, $eventType, $tenant, $invoice, $remote, $paymentId): array {
                // Serializa entregas concorrentes do mesmo evento.
                $locked = PaymentWebhookEvent::query()->lockForUpdate()->find($webhookEvent->id);

                if (! $locked || $this->isFinal($locked)) {
                    return ['status' => 'duplicate', 'message' => 'Evento já processado.'];
                }

                $invoice = Invoice::query()
                    ->where('tenant_id', $tenant->id)
                    ->lockForUpdate()
                    ->find($invoice->id);

                if (! $invoice) {
                    return $this->finish($locked, PaymentWebhookEvent::STATUS_FAILED, 'not_found', 'Fatura local não encontrada para o pagamento.');
                }

                $outcome = $this->applyRemoteState($invoice, $remote, $paymentId, $eventType);

                if ($outcome !== null) {
                    return $this->finish($locked, PaymentWebhookEvent::STATUS_FAILED, 'rejected', $outcome, $invoice->id);
                }

                return $this->finish($locked, PaymentWebhookEvent::STATUS_PROCESSED, 'processed', null, $invoice->id);
            });
        } catch (\Throwable $e) {
            $webhookEvent->update([
                'status' => PaymentWebhookEvent::STATUS_FAILED,
                'processed_at' => now(),
                'error_message' => mb_substr($e->getMessage(), 0, 1000),
            ]);

            Log::error('Asaas webhook processing failed', [
                'scope' => $context->scope(),
                'event' => $eventType,
                'payment_id' => $paymentId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Registra o evento (ou retoma um que falhou). Retorna null se já foi processado.
     *
     * @param  array<string, mixed>  $payload
     */
    private function claimEvent(array $payload, AsaasWebhookContext $context, string $eventType, string $paymentId): ?PaymentWebhookEvent
    {
        $key = $this->buildIdempotencyKey($context, $eventType, $paymentId, $payload);

        $existing = PaymentWebhookEvent::query()->where('idempotency_key', $key)->first();

        if ($existing) {
            return $this->isFinal($existing) ? null : $existing;
        }

        try {
            return PaymentWebhookEvent::query()->create([
                'provider' => 'asaas',
                'tenant_id' => $context->tenant?->id,
                'idempotency_key' => $key,
                'event_type' => $eventType !== '' ? mb_substr($eventType, 0, 64) : 'UNKNOWN',
                'external_payment_id' => $paymentId !== '' ? mb_substr($paymentId, 0, 64) : null,
                'status' => PaymentWebhookEvent::STATUS_PENDING,
                'payload' => $payload,
            ]);
        } catch (UniqueConstraintViolationException) {
            // Outra entrega do mesmo evento chegou ao mesmo tempo; o lock na transação decide quem aplica.
            $existing = PaymentWebhookEvent::query()->where('idempotency_key', $key)->first();

            return $existing && ! $this->isFinal($existing) ? $existing : null;
        }
    }

    private function isFinal(PaymentWebhookEvent $event): bool
    {
        return in_array($event->status, [PaymentWebhookEvent::STATUS_PROCESSED, PaymentWebhookEvent::STATUS_IGNORED], true);
    }

    /**
     * @return array{status: string, message: string, invoice_id?: int}
     */
    private function finish(PaymentWebhookEvent $event, string $eventStatus, string $result, ?string $error, ?int $invoiceId = null): array
    {
        $event->update([
            'status' => $eventStatus,
            'processed_at' => now(),
            'error_message' => $error,
        ]);

        return array_filter([
            'status' => $result,
            'message' => $error ?? 'Evento processado.',
            'invoice_id' => $invoiceId,
        ], fn ($v) => $v !== null);
    }

    /**
     * Resolve tenant, ambiente e fatura — sempre restritos ao contexto autenticado.
     *
     * @param  array<string, mixed>  $payment
     * @return array{0: Tenant|null, 1: string, 2: Invoice|null}
     */
    private function resolveTarget(AsaasWebhookContext $context, array $payment, string $paymentId): array
    {
        if (! $context->isGlobal()) {
            return [$context->tenant, (string) $context->environment, $this->findTenantInvoice($context->tenant, $payment, $paymentId)];
        }

        // Token global legado: só pelo ID da cobrança, só em escolas sem credencial própria.
        $candidates = Invoice::query()->where('cora_charge_id', $paymentId)->with('tenant')->limit(2)->get();

        if ($candidates->count() !== 1) {
            return [null, '', null];
        }

        $invoice = $candidates->first();
        $tenant = $invoice->tenant;
        $environment = $this->environmentFromInvoice($invoice);

        if (! $tenant || $tenant->status !== 'active' || $this->credentials->findForTenant($tenant, $environment) !== null) {
            return [null, '', null];
        }

        return [$tenant, $environment, $invoice];
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    private function findTenantInvoice(Tenant $tenant, array $payment, string $paymentId): ?Invoice
    {
        $byCharge = Invoice::query()
            ->where('tenant_id', $tenant->id)
            ->where('cora_charge_id', $paymentId)
            ->first();

        if ($byCharge) {
            return $byCharge;
        }

        $externalRef = trim((string) ($payment['externalReference'] ?? ''));

        if ($externalRef === '' || ! ctype_digit($externalRef)) {
            return null;
        }

        return Invoice::query()
            ->where('tenant_id', $tenant->id)
            ->whereKey((int) $externalRef)
            ->first();
    }

    private function environmentFromInvoice(Invoice $invoice): string
    {
        $stored = (string) data_get($invoice->cora_payload, 'integration.environment', '');

        if ($stored !== '') {
            return $this->credentials->normalizeEnvironment($stored);
        }

        return app()->environment('production') ? 'prod' : 'stage';
    }

    /**
     * Consulta a cobrança na conta Asaas do tenant. Null = não existe nessa conta.
     *
     * @return array<string, mixed>|null
     */
    private function fetchVerifiedPayment(Tenant $tenant, string $paymentId, string $environment): ?array
    {
        try {
            $remote = $this->gateway->getInvoiceById($tenant, $paymentId, $environment)['payload'] ?? [];
        } catch (RequestException $e) {
            if ($e->response?->status() === 404) {
                return null;
            }

            throw new AsaasWebhookVerificationUnavailable('Falha ao consultar a cobrança no Asaas.', 0, $e);
        } catch (ConnectionException|\RuntimeException $e) {
            throw new AsaasWebhookVerificationUnavailable('Falha ao consultar a cobrança no Asaas.', 0, $e);
        }

        return is_array($remote) && $remote !== [] ? $remote : null;
    }

    /**
     * Confere se a cobrança devolvida pelo Asaas é desta fatura.
     *
     * @param  array<string, mixed>  $remote
     */
    private function ownershipError(Invoice $invoice, array $remote, string $paymentId): ?string
    {
        if (trim((string) ($remote['id'] ?? '')) !== $paymentId) {
            return 'ID da cobrança no Asaas diverge do evento.';
        }

        $linkedCharge = trim((string) ($invoice->cora_charge_id ?? ''));

        if ($linkedCharge !== '' && $linkedCharge !== $paymentId) {
            return 'Fatura vinculada a outra cobrança.';
        }

        $externalRef = trim((string) ($remote['externalReference'] ?? ''));

        if ($linkedCharge === '' && $externalRef !== (string) $invoice->id) {
            return 'Cobrança do Asaas não referencia esta fatura.';
        }

        return null;
    }

    /**
     * Aplica o estado REAL da cobrança. Retorna o motivo quando nada pode ser aplicado.
     *
     * @param  array<string, mixed>  $remote
     */
    private function applyRemoteState(Invoice $invoice, array $remote, string $paymentId, string $eventType): ?string
    {
        $remoteStatus = ! empty($remote['deleted']) ? 'DELETED' : strtoupper(trim((string) ($remote['status'] ?? '')));
        $remote['status'] = $remoteStatus;
        $localStatus = $this->statusMapper->mapToLocalStatus($remoteStatus);

        if (trim((string) ($invoice->cora_charge_id ?? '')) === '') {
            $invoice->update(['cora_charge_id' => $paymentId]);
        }

        if ($localStatus === 'paid') {
            if (! $this->amountMatches($invoice, $remote)) {
                Log::warning('Asaas webhook: valor pago diverge da fatura', [
                    'tenant_id' => $invoice->tenant_id,
                    'invoice_id' => $invoice->id,
                    'payment_id' => $paymentId,
                ]);

                return 'Valor da cobrança no Asaas diverge do valor da fatura.';
            }

            $this->paymentApplier->apply($invoice, $remote, $eventType);

            return null;
        }

        // Fatura paga não volta para vencida/cancelada por webhook (estorno exige tratamento manual).
        if ($invoice->status === 'paid') {
            if ($localStatus === 'cancelled') {
                Log::warning('Asaas webhook: cobrança paga aparece cancelada/estornada no Asaas', [
                    'tenant_id' => $invoice->tenant_id,
                    'invoice_id' => $invoice->id,
                    'asaas_status' => $remoteStatus,
                ]);
            }

            return null;
        }

        if ($localStatus === 'overdue' || $localStatus === 'cancelled') {
            $invoice->update([
                'status' => $localStatus,
                'cora_status' => $remoteStatus,
                'cora_last_synced_at' => now(),
            ]);

            return null;
        }

        $invoice->update([
            'cora_status' => $remoteStatus !== '' ? $remoteStatus : $invoice->cora_status,
            'cora_last_synced_at' => now(),
        ]);

        return null;
    }

    /**
     * Pagamento com juros/multa: o Asaas guarda o valor original em originalValue.
     *
     * @param  array<string, mixed>  $remote
     */
    private function amountMatches(Invoice $invoice, array $remote): bool
    {
        $expected = round((float) $invoice->amount, 2);

        foreach (['originalValue', 'value'] as $field) {
            if (isset($remote[$field]) && is_numeric($remote[$field])
                && abs(round((float) $remote[$field], 2) - $expected) <= self::AMOUNT_TOLERANCE) {
                return true;
            }
        }

        return false;
    }

    /**
     * Prefere o ID único do evento (recomendação do Asaas para idempotência), sempre
     * escopado pelo tenant autenticado — um tenant não consegue "ocupar" a chave de outro.
     *
     * @param  array<string, mixed>  $payload
     */
    private function buildIdempotencyKey(AsaasWebhookContext $context, string $eventType, string $paymentId, array $payload): string
    {
        $eventId = trim((string) ($payload['id'] ?? ''));

        if ($eventId !== '') {
            return hash('sha256', 'asaas|' . $context->scope() . '|evt|' . $eventId);
        }

        $date = (string) ($payload['dateCreated'] ?? $payload['createdDate'] ?? '');

        return hash('sha256', 'asaas|' . $context->scope() . '|' . $eventType . '|' . $paymentId . '|' . $date);
    }
}
