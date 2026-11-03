<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\EngagementService;
use Illuminate\Http\JsonResponse;

class BiEngagementController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly EngagementService $engagement)
    {
        parent::__construct($gate);
    }

    /** Frequência, dias ativos, índice de Engajamento, série semanal, distribuição, turmas e menor engajamento. */
    public function show(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $filters = $this->filters($request, $scope);

        return $this->success($this->engagement->build($scope, $filters), 'Frequência e engajamento carregados.');
    }
}
