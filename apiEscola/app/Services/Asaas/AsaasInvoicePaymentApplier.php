<?php

namespace App\Services\Asaas;

use App\Models\Invoice;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AsaasInvoicePaymentApplier
{
    public function __construct(private readonly AsaasPaymentStatusMapper $statusMapper)
    {
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    public function apply(Invoice $invoice, array $payment, ?string $eventType = null): bool
    {
        if ($invoice->status === 'paid') {
            Log::info('Asaas invoice already paid — skipping duplicate apply', [
                'invoice_id' => $invoice->id,
                'event' => $eventType,
                'payment_id' => $payment['id'] ?? null,
            ]);

            return false;
        }

        $asaasStatus = strtoupper(trim((string) ($payment['status'] ?? '')));
        $localStatus = $this->statusMapper->mapToLocalStatus($asaasStatus);

        if ($localStatus === 'pending') {
            $this->syncGatewayFields($invoice, $payment, $asaasStatus);

            return false;
        }

        return DB::transaction(function () use ($invoice, $payment, $asaasStatus, $localStatus, $eventType): bool {
            $invoice = Invoice::query()->lockForUpdate()->find($invoice->id);

            if (! $invoice) {
                return false;
            }

            if ($invoice->status === 'paid' && $localStatus === 'paid') {
                return false;
            }

            $paidAt = $this->resolvePaidAt($payment);
            $attributes = [
                'cora_status' => $asaasStatus,
                'cora_last_synced_at' => now(),
            ];

            if ($localStatus === 'paid') {
                $attributes['status'] = 'paid';
                $attributes['paid_at'] = $paidAt ?? now();
            } elseif ($localStatus === 'overdue') {
                $attributes['status'] = 'overdue';
            } elseif ($localStatus === 'cancelled') {
                $attributes['status'] = 'cancelled';
                $attributes['paid_at'] = null;
            }

            $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
            $payload['asaas_payment'] = $payment;
            $payload['integration'] = array_merge(
                (array) ($payload['integration'] ?? []),
                [
                    'provider' => 'asaas',
                    'last_webhook_event' => $eventType,
                    'last_sync_at' => now()->toIso8601String(),
                ]
            );
            $attributes['cora_payload'] = $payload;

            if (isset($payment['invoiceUrl'])) {
                $attributes['cora_payment_url'] = (string) $payment['invoiceUrl'];
            }

            if (isset($payment['bankSlipUrl']) && ($attributes['cora_payment_url'] ?? '') === '') {
                $attributes['cora_payment_url'] = (string) $payment['bankSlipUrl'];
            }

            $invoice->update($attributes);

            Log::info('Asaas invoice status applied', [
                'invoice_id' => $invoice->id,
                'local_status' => $localStatus,
                'asaas_status' => $asaasStatus,
                'event' => $eventType,
            ]);

            return true;
        });
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    private function syncGatewayFields(Invoice $invoice, array $payment, string $asaasStatus): void
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $payload['asaas_payment'] = $payment;

        $invoice->update([
            'cora_status' => $asaasStatus,
            'cora_payload' => $payload,
            'cora_last_synced_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    private function resolvePaidAt(array $payment): ?Carbon
    {
        $candidates = [
            $payment['paymentDate'] ?? null,
            $payment['clientPaymentDate'] ?? null,
            $payment['confirmedDate'] ?? null,
            $payment['creditDate'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) || trim($candidate) === '') {
                continue;
            }

            try {
                return Carbon::parse($candidate);
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }
}
