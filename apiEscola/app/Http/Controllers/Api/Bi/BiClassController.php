<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\ClassAnalyticsService;
use Illuminate\Http\JsonResponse;

class BiClassController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly ClassAnalyticsService $analytics)
    {
        parent::__construct($gate);
    }

    /** Comparação entre as turmas do recorte (média por modalidade, banco, frequência, participação, atenção). */
    public function index(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success($this->analytics->compare($scope, $filters), 'Turmas carregadas.');
    }

    /** Alunos da turma com indicadores individuais e motivos de atenção. */
    public function show(BiFilterRequest $request, int $schoolClass): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        if (! $this->analytics->exists($scope, $schoolClass)) {
            return $this->error('Turma não encontrada.', null, 404);
        }

        if (! $scope->allowsClass($schoolClass)) {
            return $this->forbidden('Turma fora do seu escopo de acesso.');
        }

        return $this->success($this->analytics->detail($scope, $filters, $schoolClass), 'Turma carregada.');
    }
}
