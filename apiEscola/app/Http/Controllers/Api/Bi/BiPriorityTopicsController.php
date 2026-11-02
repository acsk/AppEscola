<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiPriorityTopicsRequest;
use App\Models\ExamType;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\PriorityTopics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiPriorityTopicsController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly PriorityTopics $priorities)
    {
        parent::__construct($gate);
    }

    /** Assuntos do tenant com o peso no concurso. */
    public function show(Request $request, int $examType): JsonResponse
    {
        $scope = $this->scope($request);
        if (! ExamType::query()->whereKey($examType)->exists()) {
            return $this->error('Concurso não encontrado.', null, 404);
        }

        return $this->success($this->priorities->forExamType($scope->tenantId, $examType), 'Assuntos prioritários carregados.');
    }

    /** Substitui os prioritários do concurso (só administração e coordenação). */
    public function update(BiPriorityTopicsRequest $request, int $examType): JsonResponse
    {
        $scope = $this->scope($request);
        if (! $scope->isTenantWide()) {
            return $this->forbidden('Somente a coordenação pode alterar os assuntos prioritários.');
        }
        if (! ExamType::query()->whereKey($examType)->exists()) {
            return $this->error('Concurso não encontrado.', null, 404);
        }

        $weights = collect($request->validated('topics'))->mapWithKeys(fn ($t) => [(int) $t['topic_id'] => (int) $t['weight']])->all();
        $this->priorities->save($scope->tenantId, $examType, $weights);

        return $this->success($this->priorities->forExamType($scope->tenantId, $examType), 'Assuntos prioritários salvos.');
    }
}
