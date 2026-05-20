<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateTenantMobileThemeRequest;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantMobileThemeService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantMobileThemeController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly TenantMobileThemeService $theme,
    ) {}

    /**
     * GET /api/tenant-mobile-theme
     * Painel: schema, defaults e cores do tenant (efetivas + persistidas).
     */
    public function show(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenant = $this->resolveTenant($request);

        return $this->success($this->panelPayload($tenant), 'Tema do app mobile carregado.');
    }

    /**
     * PUT /api/tenant-mobile-theme
     * Painel: salva cores (parcial ou completo).
     */
    public function update(UpdateTenantMobileThemeRequest $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenant = $this->resolveTenant($request);
        $this->ensureCanManage($request, $tenant);

        try {
            $colors = $this->theme->updateSettings(
                $tenant,
                $request->templateId(),
                $request->colorsInput(),
                $request->shouldClearOverrides(),
            );
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success([
            ...$this->panelPayload($tenant->fresh()),
            'colors' => $colors,
        ], 'Tema do app mobile salvo com sucesso.');
    }

    /**
     * POST /api/tenant-mobile-theme/reset
     * Painel: restaura paleta padrão do sistema.
     */
    public function reset(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenant = $this->resolveTenant($request);
        $this->ensureCanManage($request, $tenant);

        $colors = $this->theme->resetColors($tenant);

        return $this->success([
            ...$this->panelPayload($tenant->fresh()),
            'colors' => $colors,
        ], 'Cores restauradas para o padrão do sistema.');
    }

    /**
     * GET /api/aluno/mobile-theme
     * Mobile: cores efetivas + logo do tenant.
     */
    public function forStudent(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || $user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $tenant = Tenant::query()->find($user->tenant_id);
        if (! $tenant) {
            return $this->notFound('Escola não encontrada.');
        }

        return $this->success([
            'tenant_id'    => $tenant->id,
            'tenant_name'  => $tenant->trade_name ?: $tenant->name,
            'logo_url'     => $tenant->photo_url,
            'template_id'  => $this->theme->persistedTemplateId($tenant),
            'colors'       => $this->theme->effectiveColors($tenant),
        ], 'Tema carregado com sucesso.');
    }

    /**
     * @return array<string, mixed>
     */
    private function panelPayload(Tenant $tenant): array
    {
        $templateId = $this->theme->persistedTemplateId($tenant);

        return [
            'tenant_id'              => $tenant->id,
            'logo_url'               => $tenant->photo_url,
            'template_id'            => $templateId,
            'templates'              => $this->theme->templatesForApi(),
            'schema'                 => $this->theme->schema(),
            'defaults'               => $this->theme->defaults(),
            'template_colors'        => $this->theme->templateColors($templateId),
            'colors'                 => $this->theme->effectiveColors($tenant),
            'color_overrides'        => $this->theme->persistedColorOverrides($tenant),
            'persisted_colors'       => $this->theme->persistedColorOverrides($tenant),
        ];
    }

    private function resolveTenant(Request $request): Tenant
    {
        /** @var User|null $user */
        $user = $request->user();

        if ($user && $user->isSuperAdmin() && $request->filled('tenant_id')) {
            return Tenant::findOrFail((int) $request->input('tenant_id'));
        }

        $tenantId = $this->requireTenantId($request);

        return Tenant::findOrFail($tenantId);
    }

    private function ensureCanManage(Request $request, Tenant $tenant): void
    {
        /** @var User|null $user */
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

        throw new AccessDeniedHttpException(
            'Apenas administradores do tenant podem alterar as cores do app mobile.'
        );
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        $role = strtolower((string) ($request->user()->role ?? ''));

        if (! in_array($role, ['admin', 'super_admin', 'professor', 'manager', 'financial'], true)) {
            return $this->forbidden('Sem permissão para acessar o tema do app mobile.');
        }

        return null;
    }
}
