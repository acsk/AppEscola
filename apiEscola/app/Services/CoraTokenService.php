<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class CoraTokenService
{
    /**
    * @return array{
    *     access_token: string,
    *     expires_in: int|null,
    *     refresh_expires_in: int|null,
    *     token_type: string,
    *     not-before-policy: int|null,
    *     scope: string|null,
    *     raw: array
    * }
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function generateForTenant(Tenant $tenant, string $environment = 'stage'): array
    {
        $cora = $this->resolveTenantCredential($tenant, $environment);

        $clientId = (string) ($cora['client_id'] ?? '');
        $environment = (string) ($cora['environment'] ?? 'stage');
        $certPath = (string) ($cora['certificate_path'] ?? $cora['cert_path'] ?? '');
        $keyPath = (string) ($cora['private_key_path'] ?? $cora['key_path'] ?? '');

        if ($clientId === '' || $certPath === '' || $keyPath === '') {
            throw new RuntimeException('Credenciais Cora não configuradas para este tenant.');
        }

        if (! Storage::disk('local')->exists($certPath) || ! Storage::disk('local')->exists($keyPath)) {
            throw new RuntimeException('Arquivos de certificado/chave não encontrados no storage local.');
        }

        $tokenUrl = $this->resolveTokenUrl($environment);

        $response = Http::timeout((int) config('services.cora.timeout', 20))
            ->asForm()
            ->acceptJson()
            ->withOptions([
                'cert' => Storage::disk('local')->path($certPath),
                'ssl_key' => Storage::disk('local')->path($keyPath),
                'verify' => (bool) config('services.cora.verify_ssl', true),
            ])
            ->post($tokenUrl, [
                'grant_type' => 'client_credentials',
                'client_id' => $clientId,
            ])
            ->throw();

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException('Resposta inválida da Cora ao gerar token.');
        }

        $accessToken = (string) ($body['access_token'] ?? '');

        if ($accessToken === '') {
            throw new RuntimeException('Resposta da Cora sem access_token.');
        }

        return [
            'access_token' => $accessToken,
            'expires_in' => isset($body['expires_in']) ? (int) $body['expires_in'] : null,
            'refresh_expires_in' => isset($body['refresh_expires_in']) ? (int) $body['refresh_expires_in'] : null,
            'token_type' => (string) ($body['token_type'] ?? 'Bearer'),
            'not-before-policy' => isset($body['not-before-policy'])
                ? (int) $body['not-before-policy']
                : (isset($body['not_before_policy']) ? (int) $body['not_before_policy'] : null),
            'scope' => isset($body['scope']) ? (string) $body['scope'] : null,
            'raw' => $body,
        ];
    }

    public function hasTenantCredentials(Tenant $tenant, ?string $environment = null): bool
    {
        $cora = $this->resolveTenantCredential($tenant, $environment);

        return ! empty($cora['client_id'])
            && ! empty($cora['certificate_path'] ?? $cora['cert_path'] ?? null)
            && ! empty($cora['private_key_path'] ?? $cora['key_path'] ?? null);
    }

    private function resolveTenantCredential(Tenant $tenant, ?string $environment = null): array
    {
        $query = $tenant->coraCredentials();

        if ($environment !== null) {
            $normalizedEnvironment = strtolower(trim($environment));
            $query->where('environment', in_array($normalizedEnvironment, ['prod', 'production'], true) ? 'prod' : 'stage');
        }

        $credential = $query->orderByDesc('configured_at')->first();

        if ($credential instanceof TenantCoraCredential && $credential->active) {
            return [
                'client_id' => $credential->client_id,
                'environment' => $credential->environment,
                'certificate_path' => $credential->certificate_path,
                'private_key_path' => $credential->private_key_path,
            ];
        }

        $settings = is_array($tenant->settings) ? $tenant->settings : [];
        $cora = is_array($settings['cora'] ?? null) ? $settings['cora'] : [];

        return [
            'client_id' => $cora['client_id'] ?? null,
            'environment' => $cora['environment'] ?? 'stage',
            'certificate_path' => $cora['cert_path'] ?? null,
            'private_key_path' => $cora['key_path'] ?? null,
        ];
    }

    private function resolveTokenUrl(string $environment): string
    {
        $env = strtolower(trim($environment));

        if (in_array($env, ['prod', 'production'], true)) {
            return (string) config('services.cora.token_url_prod', 'https://matls-clients.api.cora.com.br/token');
        }

        return (string) config('services.cora.token_url_stage', 'https://matls-clients.api.stage.cora.com.br/token');
    }
}
