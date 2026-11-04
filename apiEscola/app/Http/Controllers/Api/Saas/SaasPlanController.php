<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveSaasPlanRequest;
use App\Models\SaasFeature;
use App\Models\SaasPlan;
use App\Services\Saas\SaasCatalogService;
use App\Services\Saas\TenantQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasPlanController extends Controller
{
    public function __construct(private readonly SaasCatalogService $catalog)
    {
    }

    public function index(): JsonResponse
    {
        return $this->success([
            'plans' => SaasPlan::query()->withCount('subscriptions')->orderBy('order')->orderBy('price_monthly')->get(),
            'features' => SaasFeature::query()->orderBy('order')->get(['key', 'name', 'description', 'global_status']),
            'resources' => collect(TenantQuotaService::RESOURCES)->map(fn ($r, $key) => ['key' => $key, 'label' => $r[0], 'unit' => $r[1], 'monthly' => $r[2]])->values(),
        ], 'Planos carregados com sucesso.');
    }

    public function store(SaveSaasPlanRequest $request): JsonResponse
    {
        return $this->created($this->catalog->savePlan(null, $request->validated(), $request->user()), 'Plano criado com sucesso.');
    }

    public function update(SaveSaasPlanRequest $request, SaasPlan $plan): JsonResponse
    {
        return $this->success($this->catalog->savePlan($plan, $request->validated(), $request->user()), 'Plano atualizado com sucesso.');
    }

    public function destroy(Request $request, SaasPlan $plan): JsonResponse
    {
        $this->catalog->deletePlan($plan, $request->user());

        return $this->deleted('Plano excluído com sucesso.');
    }
}
