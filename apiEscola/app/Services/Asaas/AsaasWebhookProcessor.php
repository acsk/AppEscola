<?php

namespace App\Services\Asaas;

use App\Models\Invoice;
use App\Models\PaymentWebhookEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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

    public function __construct(
        private readonly AsaasInvoicePaymentApplier $paymentApplier,
        private readonly AsaasPaymentStatusMapper $statusMapper,
    ) {
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{status: string, message: string, invoice_id?: int}
     */
    public function handle(array $payload): array
    {
        $eventType = strtoupper(trim((string) ($payload['event'] ?? '')));
        $payment = is_array($payload['payment'] ?? null) ? $payload['payment'] : [];
        $paymentId = trim((string) ($payment['id'] ?? ''));
        $idempotencyKey = $this->buildIdempotencyKey($eventType, $paymentId, $payload);

        $existing = PaymentWebhookEvent::query()
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existing && in_array($existing->status, [PaymentWebhookEvent::STATUS_PROCESSED, PaymentWebhookEvent::STATUS_IGNORED], true)) {
            return [
                'status' => 'duplicate',
                'message' => 'Evento já processado.',
                'invoice_id' => $existing->invoice_id,
            ];
        }

        $webhookEvent = $existing ?? PaymentWebhookEvent::query()->create([
            'provider' => 'asaas',
            'idempotency_key' => $idempotencyKey,
            'event_type' => $eventType !== '' ? $eventType : 'UNKNOWN',
            'external_payment_id' => $paymentId !== '' ? $paymentId : null,
            'status' => PaymentWebhookEvent::STATUS_PENDING,
            'payload' => $payload,
        ]);

        try {
            return DB::transaction(function () use ($webhookEvent, $eventType, $payment, $paymentId): array {
                if (! in_array($eventType, self::PROCESSED_EVENTS, true)) {
                    $webhookEvent->update([
                        'status' => PaymentWebhookEvent::STATUS_IGNORED,
                        'processed_at' => now(),
                        'error_message' => 'Evento não requer processamento.',
                    ]);

                    return [
                        'status' => 'ignored',
                        'message' => 'Evento ignorado.',
                    ];
                }

                $invoice = $this->resolveInvoice($payment, $paymentId);

                if (! $invoice) {
                    $webhookEvent->update([
                        'status' => PaymentWebhookEvent::STATUS_FAILED,
                        'processed_at' => now(),
                        'error_message' => 'Fatura local não encontrada para o pagamento.',
                    ]);

                    Log::warning('Asaas webhook invoice not found', [
                        'payment_id' => $paymentId,
                        'external_reference' => $payment['externalReference'] ?? null,
                        'event' => $eventType,
                    ]);

                    return [
                        'status' => 'not_found',
                        'message' => 'Fatura não encontrada.',
                    ];
                }

                $webhookEvent->update(['invoice_id' => $invoice->id]);

                if (in_array($eventType, ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'], true)) {
                    $this->paymentApplier->apply($invoice, $payment, $eventType);
                } elseif ($eventType === 'PAYMENT_OVERDUE') {
                    if ($invoice->status !== 'paid') {
                        $invoice->update(['status' => 'overdue', 'cora_status' => 'OVERDUE']);
                    }
                } elseif (in_array($eventType, ['PAYMENT_DELETED', 'PAYMENT_REFUNDED'], true)) {
                    if ($invoice->status !== 'paid') {
                        $invoice->update([
                            'status' => 'cancelled',
                            'cora_status' => $eventType === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'DELETED',
                        ]);
                    }
                } elseif ($eventType === 'PAYMENT_CREATED') {
                    $status = strtoupper((string) ($payment['status'] ?? 'PENDING'));
                    $invoice->update([
                        'cora_charge_id' => $paymentId !== '' ? $paymentId : $invoice->cora_charge_id,
                        'cora_status' => $status,
                        'cora_last_synced_at' => now(),
                    ]);
                }

                $webhookEvent->update([
                    'status' => PaymentWebhookEvent::STATUS_PROCESSED,
                    'processed_at' => now(),
                ]);

                return [
                    'status' => 'processed',
                    'message' => 'Evento processado.',
                    'invoice_id' => $invoice->id,
                ];
            });
        } catch (\Throwable $e) {
            $webhookEvent->update([
                'status' => PaymentWebhookEvent::STATUS_FAILED,
                'processed_at' => now(),
                'error_message' => $e->getMessage(),
            ]);

            Log::error('Asaas webhook processing failed', [
                'event' => $eventType,
                'payment_id' => $paymentId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    private function resolveInvoice(array $payment, string $paymentId): ?Invoice
    {
        if ($paymentId !== '') {
            $byCharge = Invoice::query()->where('cora_charge_id', $paymentId)->first();
            if ($byCharge) {
                return $byCharge;
            }
        }

        $externalRef = trim((string) ($payment['externalReference'] ?? ''));

        if ($externalRef !== '' && ctype_digit($externalRef)) {
            return Invoice::query()->find((int) $externalRef);
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function buildIdempotencyKey(string $eventType, string $paymentId, array $payload): string
    {
        $date = (string) ($payload['dateCreated'] ?? $payload['createdDate'] ?? '');

        return hash('sha256', 'asaas|' . $eventType . '|' . $paymentId . '|' . $date);
    }
}
