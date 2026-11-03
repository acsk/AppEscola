<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiCriteriaRequest;
use App\Models\TenantSetting;
use App\Services\Bi\Ai\BiAiService;
use App\Services\Bi\BiCriteria;
use App\Services\Bi\BiFeatureGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiCriteriaController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly BiCriteria $criteria, private readonly BiAiService $ai)
    {
        parent::__construct($gate);
    }

    /** Critérios pedagógicos em vigor na escola, com os limites aceitos. */
    public function show(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        return $this->success($this->payload($this->criteria->for($scope->tenantId), $request, $scope->tenantId), 'Critérios carregados.');
    }

    /** Só administração e coordenação alteram os critérios (valem para toda a escola). */
    public function update(BiCriteriaRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        if (! $scope->isTenantWide()) {
            return $this->forbidden('Somente a coordenação pode alterar os critérios.');
        }

        $data = $request->validated();
        if (array_key_exists('ai_enabled', $data)) {
            if ($data['ai_enabled'] && ! $this->ai->status($request->user(), $scope->tenantId)['available']) {
                return $this->error('Para ligar a IA, cadastre uma chave em Configurações → Integração com IA (plano avançado).', ['code' => 'bi_ai_unavailable'], 422);
            }
            TenantSetting::query()->updateOrCreate(
                ['tenant_id' => $scope->tenantId, 'module' => BiFeatureGate::MODULE, 'key' => 'ai_enabled'],
                ['value' => TenantSetting::wrapValue((bool) $data['ai_enabled'])],
            );
        }

        return $this->success($this->payload($this->criteria->save($scope->tenantId, $data), $request, $scope->tenantId), 'Critérios salvos.');
    }

    /** @param  array<string, int|float>  $values */
    private function payload(array $values, Request $request, int $tenantId): array
    {
        return [
            'criteria' => $values,
            'ai' => $this->ai->status($request->user(), $tenantId),
            'limits' => array_map(fn (array $f) => ['min' => $f[0], 'max' => $f[1], 'integer' => $f[2]], BiCriteria::FIELDS),
        ];
    }
}
