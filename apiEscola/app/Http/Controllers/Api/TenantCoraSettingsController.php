<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Services\CoraTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Storage;
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

        $data = $request->validate([
            'client_id' => ['required', 'string', 'max:255'],
            'environment' => ['required', 'string', 'in:stage,prod,production'],
            'certificate' => ['required', 'file', 'max:1024'],
            'private_key' => ['required', 'file', 'max:1024'],
            'test_account_main_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_main_password' => ['nullable', 'string', 'max:255'],
            'test_account_secondary_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_secondary_password' => ['nullable', 'string', 'max:255'],
        ]);

        $normalizedClientId = trim((string) $data['client_id']);

        if ($normalizedClientId === '') {
            return $this->error('client_id inválido para a Cora.', null, 422);
        }

        $environment = $data['environment'] === 'production' ? 'prod' : $data['environment'];

        $baseDir = 'secure/cora/tenants/' . $tenant->id . '/' . ($environment === 'prod' ? 'production' : 'test');

        $certPath = $request->file('certificate')->storeAs($baseDir, 'certificate.pem', 'local');
        $keyPath = $request->file('private_key')->storeAs($baseDir, 'private-key.key', 'local');

        TenantCoraCredential::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
            ],
            [
                'client_id' => $normalizedClientId,
                'certificate_path' => $certPath,
                'private_key_path' => $keyPath,
                'environment' => $environment,
                'active' => true,
                'configured_at' => now(),
                'test_account_main_cpf' => $data['test_account_main_cpf'] ?? null,
                'test_account_main_password' => $data['test_account_main_password'] ?? null,
                'test_account_secondary_cpf' => $data['test_account_secondary_cpf'] ?? null,
                'test_account_secondary_password' => $data['test_account_secondary_password'] ?? null,
            ]
        );

        return $this->success([
            'tenant_id' => $tenant->id,
            'cora' => [
                'environment' => $environment,
                'client_id' => $normalizedClientId,
                'configured' => true,
                'configured_at' => now()->toISOString(),
                'cert_uploaded' => Storage::disk('local')->exists($certPath),
                'key_uploaded' => Storage::disk('local')->exists($keyPath),
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
            'cert_uploaded' => ! empty($credential->certificate_path),
            'key_uploaded' => ! empty($credential->private_key_path),
            'test_account_main_cpf' => $credential->test_account_main_cpf,
            'test_account_main_password' => $credential->test_account_main_password,
            'test_account_secondary_cpf' => $credential->test_account_secondary_cpf,
            'test_account_secondary_password' => $credential->test_account_secondary_password,
        ];
    }
}
