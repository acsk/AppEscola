<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiCriteriaRequest;
use App\Services\Bi\BiCriteria;
use App\Services\Bi\BiFeatureGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiCriteriaController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly BiCriteria $criteria)
    {
        parent::__construct($gate);
    }

    /** Critérios pedagógicos em vigor na escola, com os limites aceitos. */
    public function show(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        return $this->success($this->payload($this->criteria->for($scope->tenantId)), 'Critérios carregados.');
    }

    /** Só administração e coordenação alteram os critérios (valem para toda a escola). */
    public function update(BiCriteriaRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        if (! $scope->isTenantWide()) {
            return $this->forbidden('Somente a coordenação pode alterar os critérios.');
        }

        return $this->success($this->payload($this->criteria->save($scope->tenantId, $request->validated())), 'Critérios salvos.');
    }

    /** @param  array<string, int|float>  $values */
    private function payload(array $values): array
    {
        return [
            'criteria' => $values,
            'limits' => array_map(fn (array $f) => ['min' => $f[0], 'max' => $f[1], 'integer' => $f[2]], BiCriteria::FIELDS),
        ];
    }
}
