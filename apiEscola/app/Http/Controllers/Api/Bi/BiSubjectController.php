<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiSubjectRequest;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\SubjectAnalyticsService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;

class BiSubjectController extends BiController
{
    private const ERRORS_DEFAULT_LIMIT = 5;

    public function __construct(BiFeatureGate $gate, private readonly SubjectAnalyticsService $subjects)
    {
        parent::__construct($gate);
    }

    /** Disciplinas com respostas no período (abas da tela). */
    public function index(BiSubjectRequest $request): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);

        return $this->success(
            ['subjects' => $this->subjects->subjects($scope, $filters, $request->source())],
            'Disciplinas carregadas.',
        );
    }

    /** Indicadores, mapa de calor turma × assunto e ranking de assuntos da disciplina. */
    public function show(BiSubjectRequest $request, int $subject): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);
        $model = $this->subject($scope, $subject);

        return $this->success($this->subjects->build($scope, $filters, $model, $request->source()), 'Disciplina carregada.');
    }

    /** Erros recorrentes de um assunto: questões com maior taxa de erro e alternativas marcadas. */
    public function errors(BiSubjectRequest $request, int $subject, int $topic): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);
        $model = $this->subject($scope, $subject);
        $topicModel = SubjectTopic::query()
            ->where('tenant_id', $scope->tenantId)
            ->where('subject_id', $model->id)
            ->find($topic);

        if ($topicModel === null) {
            throw new HttpResponseException($this->error('Assunto não encontrado nesta disciplina.', null, 404));
        }

        return $this->success(
            $this->subjects->errors($scope, $filters, $model, $topicModel, $request->source(), (int) ($request->validated('limit') ?? self::ERRORS_DEFAULT_LIMIT)),
            'Erros recorrentes carregados.',
        );
    }

    /** Disciplina do tenant; professor só acessa as que leciona. */
    private function subject(BiAccessScope $scope, int $id): Subject
    {
        $subject = Subject::query()->where('tenant_id', $scope->tenantId)->find($id);

        if ($subject === null) {
            throw new HttpResponseException($this->error('Disciplina não encontrada.', null, 404));
        }

        if (! $scope->allowsSubject($subject->id)) {
            throw new HttpResponseException($this->forbidden('Disciplina fora do seu escopo de acesso.'));
        }

        return $subject;
    }
}
