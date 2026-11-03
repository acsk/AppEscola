<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Http\Requests\Bi\InterventionRequest;
use App\Models\PedagogicalIntervention;
use App\Models\PedagogicalInterventionEvent;
use App\Models\User;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiCriteria;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Services\Bi\Interventions\InterventionService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Acompanhamento pedagógico (BI avançado). Secretaria acessa só as intervenções atribuídas a ela. */
class BiInterventionController extends BiController
{
    public function __construct(BiFeatureGate $gate, private readonly InterventionService $interventions)
    {
        parent::__construct($gate);
    }

    public function summary(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->interventionScope($request);

        return $this->success($this->interventions->summary($scope, $this->filters($request, $scope)), 'Resumo carregado.');
    }

    public function suggestions(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->interventionScope($request);

        return $this->success($this->interventions->suggestions($scope, $this->filters($request, $scope)), 'Sugestões carregadas.');
    }

    public function index(Request $request): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $tab = $request->validate(['tab' => ['nullable', Rule::in(InterventionService::TABS)]])['tab'] ?? InterventionService::TAB_ACTIVE;

        return $this->success($this->interventions->list($scope, $tab), 'Intervenções carregadas.');
    }

    public function effectiveness(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->interventionScope($request);

        return $this->success($this->interventions->effectiveness($scope, $this->filters($request, $scope)), 'Efetividade carregada.');
    }

    /** Tipos, motivos e equipe que pode ser responsável. */
    public function options(Request $request): JsonResponse
    {
        $scope = $this->interventionScope($request);

        return $this->success([
            'types' => collect(PedagogicalIntervention::TYPES)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'reasons' => collect(PedagogicalIntervention::REASONS)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'responsibles' => User::query()
                ->where('tenant_id', $scope->tenantId)
                ->whereIn('role', ['admin', 'coordenador', 'professor', 'secretaria'])
                ->orderBy('name')
                ->get(['id', 'name', 'role']),
            'can_create' => $scope->isTenantWide() || $scope->role === 'professor',
        ], 'Opções carregadas.');
    }

    public function show(Request $request, int $intervention): JsonResponse
    {
        $scope = $this->interventionScope($request);

        return $this->success($this->interventions->show($scope, $this->find($scope, $intervention)), 'Intervenção carregada.');
    }

    public function store(InterventionRequest $request): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $data = $request->validated();
        if (! $this->interventions->canCreateFor($scope, array_map('intval', $data['student_ids']))) {
            return $this->forbidden('Você só pode criar intervenções para alunos das suas turmas.');
        }

        $created = $this->interventions->create($scope, $data);

        return $this->created($this->interventions->show($scope, $created->fresh()), 'Intervenção registrada.');
    }

    public function update(InterventionRequest $request, int $intervention): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $model = $this->managed($scope, $intervention);
        $this->assertOpen($model);

        $this->interventions->update($scope, $model, $request->validated());

        return $this->success($this->interventions->show($scope, $model->fresh()), 'Intervenção atualizada.');
    }

    /** Registra a reavaliação: mede o "depois" e conclui. */
    public function complete(Request $request, int $intervention): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $model = $this->managed($scope, $intervention);
        $this->assertOpen($model);
        $note = $request->validate(['note' => ['nullable', 'string', 'max:2000']])['note'] ?? null;

        $this->interventions->complete($scope, $model, $note);

        return $this->success($this->interventions->show($scope, $model->fresh()), 'Reavaliação registrada.');
    }

    /** Nota ou progresso na linha do tempo. */
    public function event(Request $request, int $intervention): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $model = $this->managed($scope, $intervention);
        $data = $request->validate([
            'type' => ['required', Rule::in([PedagogicalInterventionEvent::NOTE, PedagogicalInterventionEvent::PROGRESS])],
            'description' => ['required', 'string', 'max:2000'],
        ]);

        $this->interventions->addEvent($scope, $model, $data['type'], $data['description']);

        return $this->success($this->interventions->show($scope, $model->fresh()), 'Registro adicionado.');
    }

    /** Descarta a sugestão de um aluno por um tempo (some da lista; volta se o indicador continuar). */
    public function dismiss(Request $request, int $student): JsonResponse
    {
        $scope = $this->interventionScope($request);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:255']])['reason'];
        if (! $this->interventions->canCreateFor($scope, [$student])) {
            return $this->forbidden('Aluno fora do seu escopo de acesso.');
        }

        $this->interventions->dismiss($scope, $student, $reason);

        return $this->success(null, 'Sugestão descartada por '.config('bi.suggestion_dismiss_days', 30).' dias.');
    }

    /** Papéis do BI ou papéis só de acompanhamento (secretaria), com o plano avançado. */
    private function interventionScope(Request $request): BiAccessScope
    {
        $user = $request->user();
        if (! in_array($user->role, config('bi.intervention_only_roles', []), true)) {
            return $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null || ! $this->gate->allows($this->gate->settings($tenantId), BiFeatureGate::PLAN_ADVANCED)) {
            throw new HttpResponseException($this->error('Recurso da Inteligência Educacional não habilitado para esta escola.', ['code' => 'bi_feature_disabled'], 403));
        }
        app(BiCriteria::class)->apply($tenantId);

        return BiAccessScope::for($user, $tenantId);
    }

    private function find(BiAccessScope $scope, int $id): PedagogicalIntervention
    {
        $model = $this->interventions->visible($scope)->find($id);
        if ($model === null) {
            throw new HttpResponseException($this->error('Intervenção não encontrada.', null, 404));
        }

        return $model;
    }

    private function managed(BiAccessScope $scope, int $id): PedagogicalIntervention
    {
        $model = $this->find($scope, $id);
        if (! $this->interventions->canManage($scope, $model)) {
            throw new HttpResponseException($this->forbidden('Somente a coordenação ou o responsável podem alterar esta intervenção.'));
        }

        return $model;
    }

    private function assertOpen(PedagogicalIntervention $model): void
    {
        if (! in_array($model->status, PedagogicalIntervention::OPEN, true)) {
            throw new HttpResponseException($this->error('Intervenção já encerrada.', null, 422));
        }
    }
}
