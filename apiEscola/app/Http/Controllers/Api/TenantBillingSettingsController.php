<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\TenantBillingSettingsService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantBillingSettingsController extends Controller
{
    use ScopedByTenant;

    public function __construct(private readonly TenantBillingSettingsService $service)
    {
    }

    /**
     * GET /api/tenant-billing-settings/schema
     * Retorna o catálogo de configurações (chaves, tipos, defaults, opções e labels).
     * Útil para o front montar a tela de configurações dinamicamente.
     */
    public function schema(Request $request): JsonResponse
    {
        $tenant = $this->resolveTenant($request);

        return $this->success([
            'schema' => $this->service->schemaForTenant($tenant),
            'defaults' => $this->service->defaultsForTenant($tenant),
            'scope_descriptions' => $this->service->scopeDescriptions(),
            'provider_capabilities' => $this->service->providerCapabilities(),
            'tenant_id' => $tenant->id,
            'mode' => 'persisted',
            'settings' => $this->service->persistedAllValues($tenant),
            'persisted_settings' => $this->service->persistedAll($tenant),
        ]);
    }

    /**
     * GET /api/tenant-billing-settings
     * Retorna as configurações efetivas (stored merged com defaults) do tenant atual.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant = $this->resolveTenant($request);
        $mode = strtolower((string) $request->query('mode', 'persisted'));

        if ($mode !== 'effective') {
            return $this->success([
                'tenant_id' => $tenant->id,
                'mode' => 'persisted',
                'settings' => $this->service->persistedAllValues($tenant),
                'persisted_settings' => $this->service->persistedAll($tenant),
            ]);
        }

        return $this->success([
            'tenant_id' => $tenant->id,
            'mode' => 'effective',
            'settings' => $this->service->all($tenant),
            'settings_meta' => $this->service->allWithMeta($tenant),
            'persisted_settings' => $this->service->persistedAll($tenant),
        ]);
    }

    /**
     * GET /api/tenant-billing-settings/{scope}
     */
    public function show(Request $request, string $scope): JsonResponse
    {
        $tenant = $this->resolveTenant($request);
        $mode = strtolower((string) $request->query('mode', 'persisted'));

        if ($mode !== 'effective') {
            try {
                $persistedValues = $this->service->persistedScopeValues($tenant, $scope);
            } catch (InvalidArgumentException $e) {
                return $this->error($e->getMessage(), null, 404);
            }

            return $this->success([
                'tenant_id' => $tenant->id,
                'scope' => $scope,
                'mode' => 'persisted',
                'values' => $persistedValues,
                'persisted_values' => $this->service->persistedScope($tenant, $scope),
            ]);
        }

        try {
            $values = $this->service->scope($tenant, $scope);
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), null, 404);
        }

        return $this->success([
            'tenant_id' => $tenant->id,
            'scope' => $scope,
            'mode' => 'effective',
            'values' => $values,
            'values_meta' => $this->service->scopeWithMeta($tenant, $scope),
            'persisted_values' => $this->service->persistedScope($tenant, $scope),
        ]);
    }

    /**
     * PUT /api/tenant-billing-settings/{scope}
     * Atualiza várias chaves do escopo em lote.
     */
    public function update(Request $request, string $scope): JsonResponse
    {
        $tenant = $this->resolveTenant($request);
        $this->ensureCanManage($request, $tenant);

        $values = $request->validate([
            'values' => ['required', 'array'],
        ])['values'];

        try {
            $updated = $this->service->updateScope($tenant, $scope, $values);
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success([
            'tenant_id' => $tenant->id,
            'scope' => $scope,
            'values' => $updated,
            'persisted_values' => $this->service->persistedScope($tenant->fresh(), $scope),
        ], 'Configurações atualizadas com sucesso.');
    }

    /**
     * POST /api/tenant-billing-settings/{scope}/reset
     * Restaura o escopo aos valores padrão.
     */
    public function reset(Request $request, string $scope): JsonResponse
    {
        $tenant = $this->resolveTenant($request);
        $this->ensureCanManage($request, $tenant);

        try {
            $values = $this->service->resetScope($tenant, $scope);
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success([
            'tenant_id' => $tenant->id,
            'scope' => $scope,
            'values' => $values,
            'persisted_values' => $this->service->persistedScope($tenant->fresh(), $scope),
        ], 'Configurações restauradas para o padrão.');
    }

    private function resolveTenant(Request $request): Tenant
    {
        $user = $request->user();

        if ($user && $user->isSuperAdmin() && $request->filled('tenant_id')) {
            return Tenant::findOrFail((int) $request->query('tenant_id'));
        }

        $tenantId = $this->getTenantId($request);
        if (! $tenantId) {
            throw new AccessDeniedHttpException('Tenant não identificado.');
        }

        return Tenant::findOrFail($tenantId);
    }

    private function ensureCanManage(Request $request, Tenant $tenant): void
    {
        $user = $request->user();

        if (! $user) {
            throw new AccessDeniedHttpException('Não autenticado.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        $userRole = strtolower((string) ($user->role ?? ''));
        $isSameTenant = (int) $user->tenant_id === (int) $tenant->id;

        if ($isSameTenant && in_array($userRole, ['admin', 'manager', 'financial'], true)) {
            return;
        }

        throw new AccessDeniedHttpException('Apenas administradores do tenant podem alterar estas configurações.');
    }
}
