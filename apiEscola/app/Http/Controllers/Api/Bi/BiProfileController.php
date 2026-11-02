<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\Diagnosis\ProfileMatrixService;
use Illuminate\Http\JsonResponse;

class BiProfileController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly ProfileMatrixService $profiles)
    {
        parent::__construct($gate);
    }

    /** Matriz desempenho × dedicação do recorte, com os quadrantes e os alunos classificados. */
    public function show(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $filters = $this->filters($request, $scope);

        return $this->success($this->profiles->build($scope, $filters), 'Perfis carregados.');
    }
}
