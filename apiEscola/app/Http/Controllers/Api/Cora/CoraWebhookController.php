<?php

namespace App\Http\Controllers\Api\Cora;

use App\Http\Controllers\Controller;
use App\Models\CoraWebhookEndpoint;
use App\Services\Cora\CoraWebhookInbox;
use App\Services\Cora\CoraWebhookProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Receptor do webhook Cora (POST /api/webhooks/cora/{callbackKey}).
 *
 * O aviso chega sem corpo e sem assinatura: só os cabeçalhos webhook-event-*. Ele é gravado e
 * respondido com 200; o efeito financeiro vem depois, da consulta da cobrança na Cora.
 */
class CoraWebhookController extends Controller
{
    private const ID_PATTERN = '/^[A-Za-z0-9_\-]{1,100}$/';

    private const TYPE_PATTERN = '/^[a-z_]{1,30}\.[a-z_]{1,28}$/';

    public function __construct(
        private readonly CoraWebhookInbox $inbox,
        private readonly CoraWebhookProcessor $processor,
    ) {
    }

    public function __invoke(Request $request, string $callbackKey): JsonResponse
    {
        if (strlen($callbackKey) < 32 || strlen($callbackKey) > 128) {
            return response()->json(['success' => false], 404);
        }

        $endpoint = CoraWebhookEndpoint::query()
            ->where('callback_key_hash', CoraWebhookEndpoint::hashKey($callbackKey))
            ->where('active', true)
            ->first();

        if (! $endpoint) {
            return response()->json(['success' => false], 404);
        }

        $eventId = trim((string) $request->header('webhook-event-id'));
        $eventType = strtolower(trim((string) $request->header('webhook-event-type')));
        $resourceId = trim((string) $request->header('webhook-resource-id'));

        if (! preg_match(self::ID_PATTERN, $eventId)
            || ! preg_match(self::TYPE_PATTERN, $eventType)
            || ! preg_match(self::ID_PATTERN, $resourceId)) {
            Log::notice('Webhook Cora: cabeçalhos ausentes ou inválidos.', ['endpoint_id' => $endpoint->id]);

            return response()->json(['success' => false, 'message' => 'Cabeçalhos webhook-event-* ausentes ou inválidos.'], 400);
        }

        try {
            ['event' => $event, 'duplicate' => $duplicate] = $this->inbox->receive($endpoint, $eventId, $eventType, $resourceId);
        } catch (Throwable $e) {
            Log::error('Webhook Cora: não foi possível gravar o aviso.', ['endpoint_id' => $endpoint->id, 'error' => $e->getMessage()]);

            return response()->json(['success' => false], 503);
        }

        // Processa logo após responder; se falhar ou o processo cair, o agendador retoma pela tabela.
        if (! $duplicate) {
            $eventRowId = $event->id;
            app()->terminating(function () use ($eventRowId) {
                try {
                    $this->processor->process($eventRowId);
                } catch (Throwable $e) {
                    Log::warning('Webhook Cora: processamento imediato falhou; fica para o agendador.', ['event_row' => $eventRowId, 'error' => $e->getMessage()]);
                }
            });
        }

        return response()->json(['success' => true]);
    }
}
