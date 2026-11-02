<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\AssessmentAnalyticsService;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\Sources\AssessmentResults;
use Illuminate\Http\JsonResponse;

class BiAssessmentController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly AssessmentAnalyticsService $analytics)
    {
        parent::__construct($gate);
    }

    /** Indicadores, evolução mensal e lista de avaliações do período. */
    public function index(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success($this->analytics->overview($scope, $filters), 'Análise de simulados carregada.');
    }

    /** Detalhe de uma avaliação: distribuição de notas, turmas, disciplinas, assuntos e alunos. */
    public function show(BiFilterRequest $request, string $modality, int $assessment): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        if (! $this->analytics->exists($scope, $modality, $assessment)) {
            return $this->error('Avaliação não encontrada.', null, 404);
        }

        if ($modality === AssessmentResults::PRESENCIAL && ! $this->analytics->allowsPresencial($scope, $assessment)) {
            return $this->forbidden('Avaliação de turma fora do seu escopo de acesso.');
        }

        return $this->success($this->analytics->detail($scope, $filters, $modality, $assessment), 'Avaliação carregada.');
    }
}
