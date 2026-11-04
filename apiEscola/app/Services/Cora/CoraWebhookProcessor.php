<?php

namespace App\Services\Cora;

use App\Models\CoraWebhookEvent;
use App\Models\Invoice;
use App\Observers\InvoiceAuditObserver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Processa os avisos da caixa de entrada: o aviso só indica qual cobrança consultar. A situação
 * real vem de GET /v2/invoices/{id} com as credenciais do tenant, e a baixa usa a mesma regra da
 * sincronização diária (nunca reabre título pago, nunca baixa duas vezes).
 */
class CoraWebhookProcessor
{
    /** Espera antes de cada nova tentativa (minutos); depois da última o evento fica como falha. */
    public const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

    /** Prazo da reivindicação: se o processo morrer, outro pode retomar depois disso. */
    private const LOCK_MINUTES = 5;

    public function __construct(private readonly CoraPaidInvoicesSyncService $sync)
    {
    }

    /** Processa os eventos vencidos (agendador e recuperação). */
    public function processDue(int $limit = 50): int
    {
        $ids = CoraWebhookEvent::query()
            ->whereIn('status', ['pending', 'processing'])
            ->where('available_at', '<=', now())
            ->where(fn ($q) => $q->whereNull('locked_until')->orWhere('locked_until', '<', now()))
            ->orderBy('available_at')
            ->limit($limit)
            ->pluck('id');

        $processed = 0;
        foreach ($ids as $id) {
            if ($this->process((int) $id) !== null) {
                $processed++;
            }
        }

        return $processed;
    }

    /**
     * Reivindica e processa um evento. Devolve o status final, ou null se outro processo já o pegou
     * (ou ainda não chegou a hora da próxima tentativa).
     */
    public function process(int $eventId): ?string
    {
        if (! $this->claim($eventId)) {
            return null;
        }

        $event = CoraWebhookEvent::query()->findOrFail($eventId);

        try {
            [$status, $result, $invoiceId] = $this->handle($event);
            $this->finish($event, $status, $result, $invoiceId);

            return $status;
        } catch (Throwable $e) {
            return $this->fail($event, $e);
        }
    }

    /**
     * Reprocessamento manual de um evento em falha ou em revisão: registra quem pediu e processa
     * na hora, com as mesmas regras do automático (a baixa ainda depende da consulta na Cora).
     * Devolve o status final, ou null se o evento não podia ser reprocessado.
     */
    public function retry(CoraWebhookEvent $event, ?int $userId = null): ?string
    {
        $released = CoraWebhookEvent::query()
            ->whereKey($event->id)
            ->whereIn('status', ['failed', 'needs_review'])
            ->update([
                'status' => 'pending',
                'attempts' => 0,
                'available_at' => now(),
                'locked_until' => null,
                'manual_retries' => DB::raw('manual_retries + 1'),
                'last_retried_by' => $userId,
                'last_retried_at' => now(),
                'updated_at' => now(),
            ]) === 1;

        if (! $released) {
            return null;
        }

        Log::info('Webhook Cora: reprocessamento manual.', [
            'event_row' => $event->id,
            'tenant_id' => $event->tenant_id,
            'user_id' => $userId,
        ]);

        return $this->process($event->id);
    }

    private function claim(int $eventId): bool
    {
        return CoraWebhookEvent::query()
            ->whereKey($eventId)
            ->whereIn('status', ['pending', 'processing'])
            ->where('available_at', '<=', now())
            ->where(fn ($q) => $q->whereNull('locked_until')->orWhere('locked_until', '<', now()))
            ->update([
                'status' => 'processing',
                'locked_until' => now()->addMinutes(self::LOCK_MINUTES),
                'attempts' => DB::raw('attempts + 1'),
                'updated_at' => now(),
            ]) === 1;
    }

    /**
     * @return array{0: string, 1: string, 2: int|null}
     */
    private function handle(CoraWebhookEvent $event): array
    {
        if (! str_starts_with($event->event_type, 'invoice.')) {
            return ['ignored', 'unsupported_event', null];
        }

        // Escopo sempre pelo tenant da assinatura; nada do POST define o tenant.
        $invoices = Invoice::query()
            ->with('tenant')
            ->where('tenant_id', $event->tenant_id)
            ->where('cora_charge_id', $event->resource_id)
            ->limit(2)
            ->get();

        if ($invoices->isEmpty()) {
            return ['needs_review', 'unknown_invoice', null];
        }
        if ($invoices->count() > 1) {
            return ['needs_review', 'ambiguous_invoice', null];
        }

        $invoice = $invoices->first();
        if ($this->sync->resolveEnvironment($invoice, $event->environment) !== $event->environment) {
            return ['needs_review', 'environment_mismatch', $invoice->id];
        }

        $outcome = InvoiceAuditObserver::asSource(
            'webhook',
            fn () => $this->sync->syncOne($invoice, $event->environment, 'cora:webhook')
        );

        return ['processed', $outcome, $invoice->id];
    }

    private function finish(CoraWebhookEvent $event, string $status, string $result, ?int $invoiceId): void
    {
        $event->forceFill([
            'status' => $status,
            'result' => $result,
            'invoice_id' => $invoiceId,
            'locked_until' => null,
            'processed_at' => now(),
            'last_error' => null,
        ])->save();
    }

    private function fail(CoraWebhookEvent $event, Throwable $e): string
    {
        $event->refresh();
        $exhausted = $event->attempts >= count(self::BACKOFF_MINUTES);
        $delay = self::BACKOFF_MINUTES[max(0, min($event->attempts, count(self::BACKOFF_MINUTES)) - 1)];

        $event->forceFill([
            'status' => $exhausted ? 'failed' : 'pending',
            'available_at' => $exhausted ? $event->available_at : now()->addMinutes($delay),
            'locked_until' => null,
            'last_error' => mb_substr($e->getMessage(), 0, 1000),
        ])->save();

        Log::warning('Webhook Cora: falha ao processar evento.', [
            'event_row' => $event->id,
            'tenant_id' => $event->tenant_id,
            'attempts' => $event->attempts,
            'exhausted' => $exhausted,
            'error' => $e->getMessage(),
        ]);

        return $event->status;
    }
}
