<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\SaasFeature;
use App\Models\SaasPlan;
use App\Models\TenantFeatureOverride;
use App\Services\Saas\SaasCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasFeatureController extends Controller
{
    public function __construct(private readonly SaasCatalogService $catalog)
    {
    }

    public function index(): JsonResponse
    {
        $plans = SaasPlan::query()->orderBy('order')->get(['id', 'name', 'features', 'status']);
        $overrides = TenantFeatureOverride::query()
            ->selectRaw('feature_key, sum(case when enabled then 1 else 0 end) as enabled_count, sum(case when enabled then 0 else 1 end) as disabled_count')
            ->groupBy('feature_key')->get()->keyBy('feature_key');

        $features = SaasFeature::query()->orderBy('order')->get()->map(fn (SaasFeature $f) => [
            'key' => $f->key,
            'name' => $f->name,
            'description' => $f->description,
            'global_status' => $f->global_status,
            'plans' => $plans->filter(fn ($p) => in_array($f->key, $p->features ?? [], true))->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->values(),
            'overrides' => ['enabled' => (int) ($overrides[$f->key]->enabled_count ?? 0), 'disabled' => (int) ($overrides[$f->key]->disabled_count ?? 0)],
        ]);

        return $this->success(['features' => $features], 'Funcionalidades carregadas com sucesso.');
    }

    public function update(Request $request, SaasFeature $feature): JsonResponse
    {
        $data = $request->validate(['global_status' => ['required', 'in:enabled,beta,disabled']]);

        return $this->success($this->catalog->setFeatureStatus($feature, $data['global_status'], $request->user()), 'Status da funcionalidade atualizado.');
    }
}
