<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\TeachingEffectivenessService;
use Illuminate\Http\JsonResponse;

class BiEffectivenessController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly TeachingEffectivenessService $effectiveness)
    {
        parent::__construct($gate);
    }

    /** Evolução por turma × disciplina (período atual × anterior); professor só como contexto. */
    public function show(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $filters = $this->filters($request, $scope);

        return $this->success($this->effectiveness->build($scope, $filters), 'Efetividade do ensino carregada.');
    }
}
