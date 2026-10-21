<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Asaas\AsaasConfigResolver;
use App\Services\Asaas\AsaasWebhookContext;
use App\Services\Asaas\AsaasWebhookProcessor;
use App\Services\Asaas\AsaasWebhookVerificationUnavailable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AsaasWebhookController extends Controller
{
    public function __construct(
        private readonly AsaasConfigResolver $config,
        private readonly AsaasWebhookProcessor $processor,
    ) {
    }

    public function handle(Request $request): JsonResponse
    {
        $context = $this->authenticate($request);

        if (! $context) {
            Log::warning('Asaas webhook rejected: invalid token', ['ip' => $request->ip()]);

            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $payload = $request->all();

        if (! is_array($payload) || $payload === []) {
            return response()->json(['message' => 'Payload inválido'], 422);
        }

        Log::info('Asaas webhook received', [
            'scope' => $context->scope(),
            'event' => $payload['event'] ?? null,
            'event_id' => $payload['id'] ?? null,
            'payment_id' => data_get($payload, 'payment.id'),
        ]);

        try {
            $result = $this->processor->handle($payload, $context);
        } catch (AsaasWebhookVerificationUnavailable) {
            // Não confirmamos nada sem consultar o Asaas; 503 faz o Asaas reenviar depois.
            return response()->json(['message' => 'Temporariamente indisponível'], 503);
        } catch (\Throwable $e) {
            Log::error('Asaas webhook handler error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Erro ao processar webhook'], 500);
        }

        Log::info('Asaas webhook handled', [
            'scope' => $context->scope(),
            'event_id' => $payload['id'] ?? null,
            'status' => $result['status'],
            'invoice_id' => $result['invoice_id'] ?? null,
        ]);

        // Resposta idêntica para todo evento aceito: não revela se a fatura existe nem o resultado.
        return response()->json(['received' => true]);
    }

    private function authenticate(Request $request): ?AsaasWebhookContext
    {
        $candidates = [
            (string) $request->header('asaas-access-token', ''),
            (string) $request->header('access_token', ''),
            (string) $request->query('access_token', ''),
        ];

        foreach ($candidates as $token) {
            if ($token === '') {
                continue;
            }

            $context = $this->config->authenticateWebhook($token);

            if ($context) {
                return $context;
            }
        }

        return null;
    }
}
