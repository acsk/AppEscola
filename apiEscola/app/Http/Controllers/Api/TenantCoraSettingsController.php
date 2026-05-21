<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Services\CoraCredentialService;
use App\Services\CoraTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantCoraSettingsController extends Controller
{
    private function ensureCanManageTenant(Request $request, Tenant $tenant): void
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        if ((int) $user->tenant_id !== (int) $tenant->id) {
            throw new AccessDeniedHttpException('Admin só pode acessar configurações do próprio tenant.');
        }
    }

    public function show(Request $request, Tenant $tenant): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);

        $credentials = $tenant->coraCredentials()->orderBy('environment')->get();

        return $this->success([
            'tenant_id' => $tenant->id,
            'cora' => [
                'stage' => $this->toCredentialPayload($credentials->firstWhere('environment', 'stage')),
                'prod' => $this->toCredentialPayload($credentials->firstWhere('environment', 'prod')),
            ],
        ]);
    }

    public function upload(Request $request, Tenant $tenant): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);

        try {
            $result = app(CoraCredentialService::class)->persistFromRequest($tenant, $request);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $credential = $result['credential'];
        $environment = $result['environment'];

        return $this->success([
            'tenant_id' => $tenant->id,
            'cora' => [
                'environment' => $environment,
                'client_id' => $credential->client_id,
                'configured' => true,
                'configured_at' => $credential->configured_at?->toISOString(),
                'cert_uploaded' => $result['cert_uploaded'],
                'key_uploaded' => $result['key_uploaded'],
            ],
        ], 'Credenciais Cora salvas com sucesso.');
    }

    public function token(Request $request, Tenant $tenant, CoraTokenService $tokenService): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);

        $environment = (string) $request->input('environment', 'stage');

        try {
            $token = $tokenService->generateForTenant($tenant, $environment);
        } catch (ConnectionException|RequestException $e) {
            return response()->json([
                'type' => 'error',
                'message' => 'Erro de comunicação com a Cora.',
                'body' => ['error' => $e->getMessage(), 'environment' => $environment],
            ], 502);
        } catch (\RuntimeException $e) {
            return response()->json([
                'type' => 'error',
                'message' => $e->getMessage(),
                'body' => ['environment' => $environment],
            ], 422);
        }

        return $this->success([
            'environment' => $environment,
            'access_token' => $token['access_token'],
            'expires_in' => $token['expires_in'],
            'refresh_expires_in' => $token['refresh_expires_in'],
            'token_type' => $token['token_type'],
            'not-before-policy' => $token['not-before-policy'],
            'scope' => $token['scope'],
        ], 'Token Cora gerado com sucesso.');
    }

    private function toCredentialPayload($credential): array
    {
        if (! $credential) {
            return [
                'environment' => null,
                'client_id' => null,
                'configured' => false,
                'configured_at' => null,
                'cert_uploaded' => false,
                'key_uploaded' => false,
                'test_account_main_cpf' => null,
                'test_account_main_password' => null,
                'test_account_secondary_cpf' => null,
                'test_account_secondary_password' => null,
            ];
        }

        return [
            'environment' => $credential->environment,
            'client_id' => $credential->client_id,
            'configured' => (bool) $credential->active,
            'configured_at' => $credential->configured_at?->toISOString(),
            'cert_uploaded' => app(CoraCredentialService::class)->credentialHasStoredFiles($credential),
            'key_uploaded' => app(CoraCredentialService::class)->credentialHasStoredFiles($credential),
            'test_account_main_cpf' => $credential->test_account_main_cpf,
            'test_account_main_password' => $credential->test_account_main_password,
            'test_account_secondary_cpf' => $credential->test_account_secondary_cpf,
            'test_account_secondary_password' => $credential->test_account_secondary_password,
        ];
    }
}
