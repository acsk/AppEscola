<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\OverviewService;
use Illuminate\Http\JsonResponse;

class BiOverviewController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly OverviewService $overview)
    {
        parent::__construct($gate);
    }

    /** Dashboard executivo: indicadores do período, evolução mensal, disciplinas críticas e alunos em atenção. */
    public function show(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success($this->overview->build($scope, $filters), 'Visão geral carregada.');
    }
}
