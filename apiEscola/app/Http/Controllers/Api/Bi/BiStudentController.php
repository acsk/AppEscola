<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Http\Requests\Bi\BiStudentRequest;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\StudentEvolutionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class BiStudentController extends BiController
{
    private const PER_PAGE = 25;

    public function __construct(BiFeatureGate $gate, private readonly StudentEvolutionService $evolution)
    {
        parent::__construct($gate);
    }

    /** Alunos do recorte com médias, banco, frequência, evolução e motivos de atenção (paginado). */
    public function index(BiStudentRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success($this->evolution->list(
            $scope,
            $filters,
            $request->validated('filter') ?? StudentEvolutionService::FILTER_ALL,
            $request->validated('search'),
            (int) ($request->validated('page') ?? 1),
            (int) ($request->validated('per_page') ?? self::PER_PAGE),
        ), 'Alunos carregados.');
    }

    /** Evolução de um aluno: avaliações comparáveis × colegas, disciplinas e assuntos. */
    public function evolution(BiFilterRequest $request, int $student): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        $exists = DB::table('students')->where('tenant_id', $scope->tenantId)->whereNull('deleted_at')->where('id', $student)->exists();
        if (! $exists) {
            return $this->error('Aluno não encontrado.', null, 404);
        }

        if (! $this->evolution->inScope($scope, $filters, $student)) {
            return $this->forbidden('Aluno fora do seu escopo de acesso ou sem matrícula ativa no período.');
        }

        return $this->success($this->evolution->evolution($scope, $filters, $student), 'Evolução do aluno carregada.');
    }
}
