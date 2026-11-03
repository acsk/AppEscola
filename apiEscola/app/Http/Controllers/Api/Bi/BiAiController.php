<?php

namespace App\Http\Controllers\Api\Bi;

use App\Exceptions\AiException;
use App\Http\Requests\Bi\BiFilterRequest;
use App\Services\Bi\Ai\BiAiService;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Services\Bi\Diagnosis\StudentDiagnosisService;
use App\Services\Bi\Reports\BiReportService;
use App\Services\Bi\Reports\ReportSampleTooSmall;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Rascunhos com IA (Diagnóstico 360°, resumo executivo, insights da escola). */
class BiAiController extends BiController
{
    public function __construct(
        BiFeatureGate $gate,
        private readonly BiAiService $ai,
        private readonly StudentDiagnosisService $diagnosis,
    ) {
        parent::__construct($gate);
    }

    public function status(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        return $this->success($this->ai->status($request->user(), $scope->tenantId), 'Situação da IA.');
    }

    /** Gera um rascunho novo (cada geração fica registrada com autor e modelo). */
    public function generate(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->enabledScope($request);
        $filters = $this->filters($request, $scope);
        $target = $this->target($request, $scope, $filters);

        try {
            $draft = $this->ai->generate($scope, $request->user(), $filters, $target['kind'], $target);
        } catch (AiException $e) {
            return $this->error($e->getMessage(), ['code' => $e->errorCode], $e->status);
        } catch (ReportSampleTooSmall $e) {
            return $this->error($e->getMessage(), ['code' => 'report_sample_too_small', 'min_group' => $e->minGroup], 422);
        }

        return $this->created($draft, 'Rascunho gerado. Revise e valide antes de usar.');
    }

    /** Último rascunho (não descartado) do alvo. */
    public function latest(BiFilterRequest $request): JsonResponse
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $filters = $this->filters($request, $scope);
        $target = $this->target($request, $scope, $filters);

        return $this->success(['draft' => $this->ai->latest($scope->tenantId, $target['kind'], $target['key'])], 'Rascunho carregado.');
    }

    /** Editar o texto (volta a rascunho), validar ou descartar. */
    public function update(Request $request, int $draft): JsonResponse
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $current = $this->ai->find($scope->tenantId, $draft) ?? throw new HttpResponseException($this->error('Rascunho não encontrado.', null, 404));
        $this->assertTargetAccess($scope, $request, $current['kind'], $current['target_key']);
        $data = $request->validate([
            'text' => ['sometimes', 'nullable', 'string', 'max:6000'],
            'status' => ['sometimes', Rule::in(['validated', 'discarded'])],
        ]);

        $this->ai->update($scope->tenantId, $draft, $data, $request->user()->id);

        return $this->success($this->ai->find($scope->tenantId, $draft), ($data['status'] ?? null) === 'validated' ? 'Rascunho validado.' : 'Rascunho atualizado.');
    }

    /** Escopo com IA ligada (plano avançado + escola habilitou + chave cadastrada). */
    private function enabledScope(Request $request): BiAccessScope
    {
        $scope = $this->scope($request, BiFeatureGate::PLAN_ADVANCED);
        $status = $this->ai->status($request->user(), $scope->tenantId);
        if (! $status['enabled']) {
            throw new HttpResponseException($this->error(
                $status['reason'] === 'no_key'
                    ? 'A IA não está configurada para esta escola. Cadastre uma chave em Configurações → Integração com IA.'
                    : 'A IA para rascunhos está desligada. A coordenação pode ligá-la em Critérios.',
                ['code' => 'bi_ai_disabled', 'reason' => $status['reason']],
                403,
            ));
        }

        return $scope;
    }

    /** @return array{kind: string, key: string, student_id?: int, report?: string} */
    private function target(Request $request, BiAccessScope $scope, BiFilters $filters): array
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(BiAiService::KINDS)],
            'student_id' => ['required_if:kind,'.BiAiService::DIAGNOSIS, 'integer'],
            'report' => ['required_if:kind,'.BiAiService::REPORT_SUMMARY, Rule::in(BiReportService::AGGREGATED)],
        ]);

        if ($data['kind'] === BiAiService::DIAGNOSIS) {
            if ($this->diagnosis->referenceClass($scope, $filters, (int) $data['student_id']) === null) {
                throw new HttpResponseException($this->forbidden('Aluno fora do seu escopo de acesso ou sem matrícula ativa no período.'));
            }

            return ['kind' => $data['kind'], 'key' => 'student:'.$data['student_id'], 'student_id' => (int) $data['student_id']];
        }
        if (! $scope->isTenantWide()) {
            throw new HttpResponseException($this->forbidden('Rascunhos da escola são exclusivos da coordenação.'));
        }

        return $data['kind'] === BiAiService::REPORT_SUMMARY
            ? ['kind' => $data['kind'], 'key' => 'report:'.$data['report'], 'report' => $data['report']]
            : ['kind' => $data['kind'], 'key' => 'school'];
    }

    private function assertTargetAccess(BiAccessScope $scope, Request $request, string $kind, string $key): void
    {
        if ($kind !== BiAiService::DIAGNOSIS && ! $scope->isTenantWide()) {
            throw new HttpResponseException($this->forbidden('Rascunhos da escola são exclusivos da coordenação.'));
        }
        if ($kind === BiAiService::DIAGNOSIS && ! $scope->isTenantWide()) {
            $studentId = (int) substr($key, strlen('student:'));
            $filters = BiFilters::fromValidated([]);
            if ($this->diagnosis->referenceClass($scope, $filters, $studentId) === null) {
                throw new HttpResponseException($this->forbidden('Aluno fora do seu escopo de acesso.'));
            }
        }
    }
}
