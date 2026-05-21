<?php

namespace App\Services\Asaas;

use App\Models\Tenant;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AsaasHttpClient
{
    public function __construct(private readonly AsaasConfigResolver $config)
    {
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     *
     * @throws ConnectionException
     * @throws RequestException
     */
    public function get(Tenant $tenant, string $path, string $environment = 'stage', array $query = []): array
    {
        return $this->request('get', $tenant, $path, $environment, query: $query);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     *
     * @throws ConnectionException
     * @throws RequestException
     */
    public function post(Tenant $tenant, string $path, string $environment = 'stage', array $payload = []): array
    {
        return $this->request('post', $tenant, $path, $environment, payload: $payload);
    }

    /**
     * @return array<string, mixed>
     *
     * @throws ConnectionException
     * @throws RequestException
     */
    public function delete(Tenant $tenant, string $path, string $environment = 'stage'): array
    {
        return $this->request('delete', $tenant, $path, $environment);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     *
     * @throws ConnectionException
     * @throws RequestException
     */
    private function request(
        string $method,
        Tenant $tenant,
        string $path,
        string $environment = 'stage',
        array $payload = [],
        array $query = [],
    ): array {
        $baseUrl = $this->config->resolveBaseUrl($tenant, $environment);
        $url = $baseUrl . '/' . ltrim($path, '/');
        $requestId = (string) Str::uuid();

        Log::info('Asaas HTTP request', [
            'request_id' => $requestId,
            'tenant_id' => $tenant->id,
            'method' => strtoupper($method),
            'url' => $url,
            'environment' => $environment,
        ]);

        try {
            $pending = $this->pendingRequest($tenant, $environment);
            $response = match (strtolower($method)) {
                'get' => $pending->get($url, $query),
                'delete' => $pending->delete($url),
                default => $pending->post($url, $payload),
            };

            $response->throw();
        } catch (RequestException $e) {
            Log::warning('Asaas HTTP request failed', [
                'request_id' => $requestId,
                'tenant_id' => $tenant->id,
                'method' => strtoupper($method),
                'url' => $url,
                'status' => $e->response?->status(),
                'errors' => $e->response?->json('errors'),
            ]);

            throw $e;
        }

        $body = $response->json();

        Log::info('Asaas HTTP response', [
            'request_id' => $requestId,
            'tenant_id' => $tenant->id,
            'method' => strtoupper($method),
            'url' => $url,
            'status' => $response->status(),
        ]);

        return is_array($body) ? $body : [];
    }

    private function pendingRequest(Tenant $tenant, string $environment): PendingRequest
    {
        $retryTimes = max(0, (int) config('asaas.retry.times', 3));
        $retrySleep = max(100, (int) config('asaas.retry.sleep_ms', 500));

        return Http::timeout((int) config('asaas.timeout', 25))
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'access_token' => $this->config->resolveApiKey($tenant, $environment),
                'User-Agent' => (string) config('asaas.user_agent', 'AppEscola/1.0'),
            ])
            ->retry(
                $retryTimes,
                $retrySleep,
                static function ($exception): bool {
                    if ($exception instanceof ConnectionException) {
                        return true;
                    }

                    if ($exception instanceof RequestException) {
                        $status = $exception->response?->status() ?? 0;

                        return $status >= 500 || $status === 429;
                    }

                    return false;
                },
                throw: false
            );
    }
}
