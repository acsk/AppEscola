<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\AcademicPerformanceService;
use App\Services\Bi\BiFeatureGate;
use Illuminate\Http\JsonResponse;

class BiPerformanceController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly AcademicPerformanceService $performance)
    {
        parent::__construct($gate);
    }

    /** Notas presenciais por disciplina e turma (visão de boletim), com faltas separadas da média. */
    public function show(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success($this->performance->build($scope, $filters), 'Desempenho acadêmico carregado.');
    }
}
