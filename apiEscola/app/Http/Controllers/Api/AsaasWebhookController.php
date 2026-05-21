<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Asaas\AsaasConfigResolver;
use App\Services\Asaas\AsaasWebhookProcessor;
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
        if (! $this->validateWebhookToken($request)) {
            Log::warning('Asaas webhook rejected: invalid token');

            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $payload = $request->all();

        if (! is_array($payload) || $payload === []) {
            return response()->json(['message' => 'Payload inválido'], 422);
        }

        Log::info('Asaas webhook received', [
            'event' => $payload['event'] ?? null,
            'payment_id' => data_get($payload, 'payment.id'),
        ]);

        try {
            $result = $this->processor->handle($payload);
        } catch (\Throwable $e) {
            Log::error('Asaas webhook handler error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Erro ao processar webhook'], 500);
        }

        return response()->json($result);
    }

    private function validateWebhookToken(Request $request): bool
    {
        $candidates = [
            (string) $request->header('asaas-access-token', ''),
            (string) $request->header('access_token', ''),
            (string) $request->query('access_token', ''),
        ];

        foreach ($candidates as $token) {
            if ($token !== '' && $this->config->validateWebhookToken($token)) {
                return true;
            }
        }

        Log::warning('Asaas webhook rejected: token does not match any tenant or global config');

        return false;
    }
}
