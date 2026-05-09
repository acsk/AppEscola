<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\TenantUploadSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TenantUploadSettingsController extends Controller
{
    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();

        if (! $user || ! $user->isSuperAdmin()) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para super admin.');
        }
    }

    public function show(Request $request, Tenant $tenant, TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        return $this->success([
            'tenant_id' => $tenant->id,
            'uploads' => $uploadSettings->getForTenant($tenant),
        ]);
    }

    public function update(Request $request, Tenant $tenant, TenantUploadSettingsService $uploadSettings): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $availableDisks = array_keys((array) config('filesystems.disks', []));

        $data = $request->validate([
            'disk' => ['sometimes', 'string', Rule::in($availableDisks)],
            'base_path' => ['sometimes', 'string', 'max:255', 'regex:/^[A-Za-z0-9_\/-]+$/', 'not_regex:/\.\./'],
        ]);

        $settings = is_array($tenant->settings) ? $tenant->settings : [];
        $uploads = is_array($settings['uploads'] ?? null) ? $settings['uploads'] : [];

        if (array_key_exists('disk', $data)) {
            $uploads['disk'] = $data['disk'];
        }

        if (array_key_exists('base_path', $data)) {
            $uploads['base_path'] = $uploadSettings->normalizeBasePath($data['base_path']);
        }

        $settings['uploads'] = $uploads;

        $tenant->update([
            'settings' => $settings,
        ]);

        return $this->success([
            'tenant_id' => $tenant->id,
            'uploads' => $uploadSettings->getForTenant($tenant->fresh()),
        ], 'Configuração de uploads atualizada com sucesso.');
    }
}