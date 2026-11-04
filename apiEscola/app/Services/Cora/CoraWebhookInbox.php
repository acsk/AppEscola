<?php

namespace App\Services\Cora;

use App\Models\CoraWebhookEndpoint;
use App\Models\CoraWebhookEvent;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Log;

/**
 * Persiste os avisos da Cora com deduplicação atômica (UNIQUE endpoint_id + event_id).
 * Reentrega do mesmo evento não cria outro registro; se vier com tipo ou recurso diferente,
 * o original é mantido e a divergência fica anotada.
 */
class CoraWebhookInbox
{
    /**
     * @return array{event: CoraWebhookEvent, duplicate: bool}
     */
    public function receive(CoraWebhookEndpoint $endpoint, string $eventId, string $eventType, string $resourceId): array
    {
        try {
            $event = CoraWebhookEvent::create([
                'endpoint_id' => $endpoint->id,
                'tenant_id' => $endpoint->tenant_id,
                'environment' => $endpoint->environment,
                'event_id' => $eventId,
                'event_type' => $eventType,
                'resource_id' => $resourceId,
                'status' => 'pending',
                'available_at' => now(),
                'received_at' => now(),
            ]);
            $duplicate = false;
        } catch (UniqueConstraintViolationException) {
            $event = CoraWebhookEvent::query()
                ->where('endpoint_id', $endpoint->id)
                ->where('event_id', $eventId)
                ->firstOrFail();
            $duplicate = true;

            $updates = ['duplicates' => $event->duplicates + 1];
            if ($event->event_type !== $eventType || $event->resource_id !== $resourceId) {
                $updates['anomaly'] = mb_substr(trim(($event->anomaly ? $event->anomaly . "\n" : '') . sprintf(
                    '%s: reentrega com tipo "%s" e recurso "%s"',
                    now()->toIso8601String(),
                    $eventType,
                    $resourceId
                )), 0, 2000);
                Log::warning('Webhook Cora: event_id repetido com dados diferentes.', [
                    'event_row' => $event->id,
                    'tenant_id' => $endpoint->tenant_id,
                ]);
            }
            $event->forceFill($updates)->save();
        }

        $endpoint->forceFill(['last_event_at' => now()])->save();

        return ['event' => $event, 'duplicate' => $duplicate];
    }
}
