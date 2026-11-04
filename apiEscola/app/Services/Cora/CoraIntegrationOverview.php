<?php

namespace App\Services\Cora;

use App\Models\CoraWebhookEndpoint;
use App\Models\CoraWebhookEvent;
use App\Models\TenantCoraCredential;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Leitura do painel Financeiro > Integração Cora: situação por ambiente (sem segredos),
 * contadores da caixa de entrada e lista filtrável de avisos.
 */
class CoraIntegrationOverview
{
    public const ENVIRONMENTS = ['stage', 'prod'];

    /**
     * Etapa exibida ao usuário. O aviso só vira "pagamento confirmado" depois que a consulta
     * na Cora confirmou e a baixa foi aplicada.
     */
    public const STAGES = ['waiting', 'confirmed', 'cancelled', 'received', 'ignored', 'review', 'failed'];

    /**
     * @return array<string, mixed>
     */
    public function build(int $tenantId): array
    {
        $credentials = TenantCoraCredential::query()->where('tenant_id', $tenantId)->get()->keyBy('environment');
        $endpoints = CoraWebhookEndpoint::query()->where('tenant_id', $tenantId)->orderByDesc('id')->get();

        $environments = [];
        foreach (self::ENVIRONMENTS as $environment) {
            $credential = $credentials->get($environment);
            $endpoint = $endpoints->firstWhere('environment', $environment);
            $active = $endpoints->first(fn ($e) => $e->environment === $environment && $e->active);

            $environments[$environment] = [
                'credentials' => [
                    'configured' => $credential !== null && $credential->certificate_path && $credential->private_key_path ? true : false,
                    'active' => (bool) ($credential?->active ?? false),
                    'configured_at' => $credential?->configured_at?->toISOString(),
                ],
                'webhook' => [
                    'registered' => $active !== null,
                    'trigger' => ($active ?? $endpoint)?->trigger,
                    'registered_at' => ($active ?? $endpoint)?->registered_at?->toISOString(),
                    'last_event_at' => ($active ?? $endpoint)?->last_event_at?->toISOString(),
                ],
            ];
        }

        $events = CoraWebhookEvent::query()->where('tenant_id', $tenantId);
        $byStatus = (clone $events)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $oldestWaiting = (clone $events)->whereIn('status', ['pending', 'processing'])->min('received_at');

        return [
            'environments' => $environments,
            'last_received_at' => $this->iso((clone $events)->max('received_at')),
            'last_processed_at' => $this->iso((clone $events)->where('status', 'processed')->max('processed_at')),
            'counts' => [
                'waiting' => (int) (($byStatus['pending'] ?? 0) + ($byStatus['processing'] ?? 0)),
                'review' => (int) ($byStatus['needs_review'] ?? 0),
                'failed' => (int) ($byStatus['failed'] ?? 0),
                'processed' => (int) ($byStatus['processed'] ?? 0),
                'duplicates' => (int) (clone $events)->sum('duplicates'),
                'anomalies' => (clone $events)->whereNotNull('anomaly')->count(),
            ],
            'oldest_waiting_at' => $this->iso($oldestWaiting),
        ];
    }

    /**
     * @param  array{stage?: string|null, date_from?: string|null, date_to?: string|null, search?: string|null, per_page?: int|null}  $filters
     */
    public function events(int $tenantId, array $filters): LengthAwarePaginator
    {
        $query = CoraWebhookEvent::query()
            ->where('tenant_id', $tenantId)
            ->with(['invoice:id,tenant_id,student_id,description,amount,due_date,status,paid_at', 'invoice.student:id,name', 'retriedBy:id,name'])
            ->orderByDesc('received_at')
            ->orderByDesc('id');

        if (! empty($filters['stage'])) {
            $this->applyStage($query, $filters['stage']);
        }

        // As datas do filtro são dias no fuso da operação; received_at está no fuso da aplicação.
        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        if (! empty($filters['date_from'])) {
            $query->where('received_at', '>=', Carbon::parse($filters['date_from'], $tz)->startOfDay()->setTimezone(config('app.timezone')));
        }
        if (! empty($filters['date_to'])) {
            $query->where('received_at', '<=', Carbon::parse($filters['date_to'], $tz)->endOfDay()->setTimezone(config('app.timezone')));
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $q) use ($search) {
                if (preg_match('/^#?(\d+)$/', $search, $m)) {
                    $q->orWhere('invoice_id', (int) $m[1]);
                }
                $q->orWhere('resource_id', $search)->orWhere('event_id', $search);
            });
        }

        return $query->paginate(min(max((int) ($filters['per_page'] ?? 25), 1), 100));
    }

    public static function stageOf(CoraWebhookEvent $event): string
    {
        return match ($event->status) {
            'pending', 'processing' => 'waiting',
            'processed' => match ($event->result) {
                'paid' => 'confirmed',
                'cancelled' => 'cancelled',
                default => 'received',
            },
            'ignored' => 'ignored',
            'needs_review' => 'review',
            default => 'failed',
        };
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(CoraWebhookEvent $event): array
    {
        $invoice = $event->invoice;

        return [
            'id' => $event->id,
            'event_id' => $event->event_id,
            'event_type' => $event->event_type,
            'resource_id' => $event->resource_id,
            'environment' => $event->environment,
            'status' => $event->status,
            'result' => $event->result,
            'stage' => self::stageOf($event),
            'can_retry' => in_array($event->status, ['failed', 'needs_review'], true),
            'attempts' => (int) $event->attempts,
            'duplicates' => (int) $event->duplicates,
            'anomaly' => $event->anomaly,
            'last_error' => $event->last_error ? mb_substr($event->last_error, 0, 300) : null,
            'received_at' => $event->received_at?->toISOString(),
            'processed_at' => $event->processed_at?->toISOString(),
            'next_attempt_at' => in_array($event->status, ['pending', 'processing'], true) ? $event->available_at?->toISOString() : null,
            'manual_retries' => (int) $event->manual_retries,
            'last_retried_at' => $event->last_retried_at?->toISOString(),
            'last_retried_by' => $event->retriedBy ? ['id' => $event->retriedBy->id, 'name' => $event->retriedBy->name] : null,
            'invoice' => $invoice ? [
                'id' => $invoice->id,
                'description' => $invoice->description,
                'amount' => $invoice->amount,
                'due_date' => $invoice->due_date?->toDateString(),
                'status' => $invoice->status,
                'paid_at' => $invoice->paid_at?->toISOString(),
                'student' => $invoice->student ? ['id' => $invoice->student->id, 'name' => $invoice->student->name] : null,
            ] : null,
        ];
    }

    private function applyStage(Builder $query, string $stage): void
    {
        match ($stage) {
            'waiting' => $query->whereIn('status', ['pending', 'processing']),
            'confirmed' => $query->where('status', 'processed')->where('result', 'paid'),
            'cancelled' => $query->where('status', 'processed')->where('result', 'cancelled'),
            'received' => $query->where('status', 'processed')->where(fn ($q) => $q->whereNull('result')->orWhereNotIn('result', ['paid', 'cancelled'])),
            'ignored' => $query->where('status', 'ignored'),
            'review' => $query->where('status', 'needs_review'),
            'failed' => $query->where('status', 'failed'),
        };
    }

    private function iso(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->toISOString() : null;
    }
}
