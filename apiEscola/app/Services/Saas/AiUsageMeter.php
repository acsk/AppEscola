<?php

namespace App\Services\Saas;

use App\Exceptions\AiException;
use App\Models\AiUsageLog;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Mede cada chamada aos provedores de IA (por tenant, recurso, modelo, tokens e custo) e aplica o limite
 * mensal de requisições do plano. Falha ao registrar nunca derruba a chamada de IA.
 */
class AiUsageMeter
{
    public function __construct(private readonly TenantQuotaService $quotas)
    {
    }

    /** Antes da chamada: recusa quando o tenant já usou o limite mensal de requisições de IA. */
    public function assertAllowed(array $credential): void
    {
        $tenantId = $credential['tenant_id'] ?? null;
        if (! $tenantId) {
            return;
        }
        if (! $this->quotas->allows((int) $tenantId, 'ai_requests')) {
            throw new AiException('Limite mensal de uso de IA do plano atingido. Fale com o suporte para ampliar.', 422, 'quota_exceeded');
        }
    }

    /** @param  array<string, mixed>|null  $response */
    public function record(array $credential, string $endpoint, ?array $response, float $startedAt, ?Throwable $error = null): void
    {
        try {
            $usage = $response['usage'] ?? [];
            $model = (string) ($response['model'] ?? $credential['model'] ?? '');
            $prompt = (int) ($usage['prompt_tokens'] ?? $usage['input_tokens'] ?? 0);
            $completion = (int) ($usage['completion_tokens'] ?? $usage['output_tokens'] ?? 0);

            AiUsageLog::query()->create([
                'tenant_id' => $credential['tenant_id'] ?? null,
                'user_id' => $credential['user_id'] ?? null,
                'feature' => Str::limit($credential['feature'] ?? $this->feature(), 80, ''),
                'provider' => (string) ($credential['provider'] ?? ''),
                'model' => $model !== '' ? Str::limit($model, 120, '') : null,
                'endpoint' => Str::limit($endpoint, 40, ''),
                'credential_source' => $credential['source'] ?? null,
                'prompt_tokens' => $prompt,
                'completion_tokens' => $completion,
                'estimated_cost_usd' => $this->estimate($model, $prompt, $completion),
                'provider_cost_usd' => isset($usage['cost']) && is_numeric($usage['cost']) ? (float) $usage['cost'] : null,
                'status' => $error ? 'error' : 'success',
                'error_code' => $error instanceof AiException ? Str::limit((string) ($error->errorCode ?? 'ai_error'), 40, '') : ($error ? 'exception' : null),
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            ]);
        } catch (Throwable $e) {
            Log::warning('IA: falha ao registrar consumo', ['error' => $e->getMessage()]);
        }
    }

    private function estimate(string $model, int $prompt, int $completion): ?float
    {
        $prices = config('saas.ai_prices', []);
        $price = $prices[$model] ?? null;
        if ($price === null) {
            foreach ($prices as $name => $candidate) {
                if ($model !== '' && str_starts_with($model, $name)) {
                    $price = $candidate;
                    break;
                }
            }
        }
        if ($price === null || ($prompt === 0 && $completion === 0)) {
            return null;
        }

        return round(($prompt * $price[0] + $completion * $price[1]) / 1_000_000, 6);
    }

    /** Rota que chamou a IA (sem ids) ou o comando/job em execução. */
    private function feature(): string
    {
        if (app()->runningInConsole()) {
            $argv = $_SERVER['argv'] ?? [];

            return 'tarefa:'.($argv[1] ?? 'console');
        }
        $path = (string) request()?->path();

        return preg_replace(['#^api/#', '#/\d+(?=/|$)#'], ['', '/{id}'], $path) ?: 'desconhecido';
    }
}
