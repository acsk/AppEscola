<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\SaasAuditLog;
use App\Models\SaasFeature;
use App\Models\Tenant;
use App\Models\TenantFeatureOverride;
use App\Models\TenantQuotaOverride;
use App\Services\Saas\SaasAuditService;
use App\Services\Saas\SaasEntitlementService;
use App\Services\Saas\TenantQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super admin: funcionalidades, limites e auditoria de um tenant. */
class SaasTenantEntitlementController extends Controller
{
    public function __construct(
        private readonly SaasEntitlementService $entitlements,
        private readonly TenantQuotaService $quotas,
        private readonly SaasAuditService $audit,
    ) {
    }

    public function features(Tenant $tenant): JsonResponse
    {
        $resolved = $this->entitlements->forTenant($tenant->id);
        $overrides = TenantFeatureOverride::query()->where('tenant_id', $tenant->id)->get()->keyBy('feature_key');

        return $this->success([
            'legacy' => $resolved['legacy'],
            'plan' => $resolved['plan'],
            'features' => SaasFeature::query()->orderBy('order')->get()->map(fn (SaasFeature $f) => [
                'key' => $f->key,
                'name' => $f->name,
                'description' => $f->description,
                'global_status' => $f->global_status,
                'enabled' => $resolved['features'][$f->key]['enabled'] ?? false,
                'source' => $resolved['features'][$f->key]['source'] ?? 'plan',
                'override' => isset($overrides[$f->key]) ? ['enabled' => $overrides[$f->key]->enabled, 'reason' => $overrides[$f->key]->reason] : null,
            ]),
        ], 'Funcionalidades carregadas com sucesso.');
    }

    public function setFeature(Request $request, Tenant $tenant, SaasFeature $feature): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean'], 'reason' => ['nullable', 'string', 'max:255']]);
        TenantFeatureOverride::query()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'feature_key' => $feature->key],
            ['enabled' => (bool) $data['enabled'], 'reason' => $data['reason'] ?? null, 'user_id' => $request->user()->id],
        );
        $this->audit->log($request->user(), $tenant->id, 'feature.override', ($data['enabled'] ? 'Liberou ' : 'Bloqueou ').$feature->name.' para a instituição'.(! empty($data['reason']) ? ": {$data['reason']}" : ''));
        $this->entitlements->flush($tenant->id);

        return $this->success(null, 'Exceção salva para a instituição.');
    }

    public function clearFeature(Request $request, Tenant $tenant, SaasFeature $feature): JsonResponse
    {
        TenantFeatureOverride::query()->where('tenant_id', $tenant->id)->where('feature_key', $feature->key)->delete();
        $this->audit->log($request->user(), $tenant->id, 'feature.override_removed', "{$feature->name} voltou a seguir o plano");
        $this->entitlements->flush($tenant->id);

        return $this->success(null, 'A funcionalidade voltou a seguir o plano.');
    }

    public function quotas(Tenant $tenant): JsonResponse
    {
        $overrides = TenantQuotaOverride::query()->where('tenant_id', $tenant->id)->get()->keyBy('resource');

        return $this->success([
            'legacy' => $this->entitlements->forTenant($tenant->id)['legacy'],
            'items' => collect($this->quotas->report($tenant->id))->map(fn ($row) => $row + [
                'override' => isset($overrides[$row['resource']]) ? ['limit' => $overrides[$row['resource']]->limit_value, 'reason' => $overrides[$row['resource']]->reason] : null,
            ]),
        ], 'Consumo carregado com sucesso.');
    }

    public function setQuota(Request $request, Tenant $tenant, string $resource): JsonResponse
    {
        abort_unless(array_key_exists($resource, TenantQuotaService::RESOURCES), 404, 'Recurso desconhecido.');
        $data = $request->validate(['limit' => ['nullable', 'integer', 'min:0', 'max:10000000'], 'reason' => ['nullable', 'string', 'max:255']], [], ['limit' => 'limite']);
        TenantQuotaOverride::query()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'resource' => $resource],
            ['limit_value' => $data['limit'] ?? null, 'reason' => $data['reason'] ?? null, 'user_id' => $request->user()->id],
        );
        $label = TenantQuotaService::RESOURCES[$resource][0];
        $this->audit->log($request->user(), $tenant->id, 'quota.override', "Limite de {$label}: ".($data['limit'] ?? 'ilimitado'), ['resource' => $resource, 'limit' => $data['limit'] ?? null]);
        $this->entitlements->flush($tenant->id);

        return $this->success(null, 'Limite atualizado para a instituição.');
    }

    public function clearQuota(Request $request, Tenant $tenant, string $resource): JsonResponse
    {
        abort_unless(array_key_exists($resource, TenantQuotaService::RESOURCES), 404, 'Recurso desconhecido.');
        TenantQuotaOverride::query()->where('tenant_id', $tenant->id)->where('resource', $resource)->delete();
        $this->audit->log($request->user(), $tenant->id, 'quota.override_removed', 'Limite de '.TenantQuotaService::RESOURCES[$resource][0].' voltou ao do plano');
        $this->entitlements->flush($tenant->id);

        return $this->success(null, 'O limite voltou a seguir o plano.');
    }

    public function audit(Tenant $tenant): JsonResponse
    {
        return $this->success([
            'items' => SaasAuditLog::query()->with('user:id,name')->where('tenant_id', $tenant->id)->latest('id')->limit(100)->get()->map(fn (SaasAuditLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'description' => $log->description,
                'user' => $log->user?->name,
                'ip' => $log->ip,
                'created_at' => $log->created_at?->toISOString(),
            ]),
        ], 'Auditoria carregada com sucesso.');
    }
}
