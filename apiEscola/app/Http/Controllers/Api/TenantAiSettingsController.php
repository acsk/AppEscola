<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveTenantAiCredentialRequest;
use App\Models\TenantAiCredential;
use App\Services\Ai\AiCredentialService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Chaves de IA do tenant (Configurações → Integração com IA).
 * Admin gerencia o próprio tenant; super admin informa tenant_id (ele mesmo usa as chaves do .env).
 * A chave nunca é devolvida — só key_hint (4 últimos caracteres).
 */
class TenantAiSettingsController extends Controller
{
    use ScopedByTenant;

    public function __construct(private readonly AiCredentialService $credentials) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        $user = $request->user();

        return $this->success([
            'tenant_id' => $tenantId,
            'providers' => $this->credentials->list($tenantId),
            // Só para o super admin: quais chaves do .env estão disponíveis para ele (sem expor valores).
            'env' => $user->isSuperAdmin() ? array_map(
                fn (string $provider) => [
                    'provider'   => $provider,
                    'configured' => trim((string) config("services.ai.{$provider}.api_key")) !== '',
                    'model'      => (string) config("services.ai.{$provider}.model"),
                ],
                TenantAiCredential::PROVIDERS
            ) : null,
        ]);
    }

    public function update(SaveTenantAiCredentialRequest $request, string $provider): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        $this->assertProvider($provider);

        $data = $request->validated();
        if (trim((string) ($data['api_key'] ?? '')) === '' && ! $this->credentials->exists($tenantId, $provider)) {
            return $this->validationError(['api_key' => ['Informe a chave de API.']]);
        }

        return $this->success($this->credentials->save($tenantId, $provider, $data), 'Chave de IA salva com sucesso.');
    }

    public function destroy(Request $request, string $provider): JsonResponse
    {
        $tenantId = $this->authorizeManage($request);
        $this->assertProvider($provider);

        if (! $this->credentials->delete($tenantId, $provider)) {
            return $this->notFound('Chave de IA não encontrada.');
        }

        return $this->deleted('Chave de IA removida com sucesso.');
    }

    private function authorizeManage(Request $request): int
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        // Admin: sempre o próprio tenant (getTenantId ignora tenant_id do cliente para não super admin).
        return $this->requireTenantId($request);
    }

    private function assertProvider(string $provider): void
    {
        abort_unless(in_array($provider, TenantAiCredential::PROVIDERS, true), 404, 'Provedor de IA não suportado.');
    }
}
