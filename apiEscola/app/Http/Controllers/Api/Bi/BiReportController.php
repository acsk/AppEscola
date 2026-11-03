<?php

namespace App\Http\Controllers\Api\Bi;

use App\Http\Requests\Bi\BiFilterRequest;
use App\Models\Subject;
use App\Services\Bi\BiAccessScope;
use App\Services\Bi\BiFeatureGate;
use App\Services\Bi\BiFilters;
use App\Services\Bi\Reports\BiReportService;
use App\Services\Bi\Reports\ReportSampleTooSmall;
use App\Services\Bi\StudentEvolutionService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Relatórios e indicadores: dados de cada relatório (prévia ou exportação) e auditoria.
 * Com `export=pdf|xlsx`, a exportação é registrada em bi_export_logs antes de devolver os dados.
 */
class BiReportController extends BiController
{
    /** Formatos aceitos por relatório. */
    private const FORMATS = [
        BiReportService::INDIVIDUAL => ['pdf'],
        BiReportService::CLASS_REPORT => ['pdf', 'xlsx'],
        BiReportService::SUBJECT => ['pdf', 'xlsx'],
        BiReportService::INSTITUTIONAL => ['pdf', 'xlsx'],
        BiReportService::RESULTS => ['pdf'],
    ];

    public function __construct(
        BiFeatureGate $gate,
        private readonly BiReportService $reports,
        private readonly StudentEvolutionService $evolution,
    ) {
        parent::__construct($gate);
    }

    public function show(BiFilterRequest $request, string $report): JsonResponse
    {
        $scope = $this->scope($request);
        $filters = $this->filters($request, $scope);
        $tenantId = $scope->tenantId;
        $params = $request->validate([
            'export' => ['nullable', Rule::in(self::FORMATS[$report])],
            'student_id' => [$report === BiReportService::INDIVIDUAL ? 'required' : 'prohibited', 'integer', Rule::exists('students', 'id')->where('tenant_id', $tenantId)->whereNull('deleted_at')],
            'report_class_id' => [$report === BiReportService::CLASS_REPORT ? 'required' : 'prohibited', 'integer', Rule::exists('school_classes', 'id')->where('tenant_id', $tenantId)->whereNull('deleted_at')],
            'report_subject_id' => [$report === BiReportService::SUBJECT ? 'required' : 'prohibited', 'integer', Rule::exists('subjects', 'id')->where('tenant_id', $tenantId)->whereNull('deleted_at')],
        ]);

        if (in_array($report, BiReportService::AGGREGATED, true) && ! $this->reports->canSeeAggregated($scope)) {
            return $this->forbidden('Relatórios institucionais são exclusivos da coordenação.');
        }

        try {
            [$data, $label] = match ($report) {
                BiReportService::INDIVIDUAL => $this->individual($scope, $filters, (int) $params['student_id']),
                BiReportService::CLASS_REPORT => $this->classReport($scope, $filters, (int) $params['report_class_id']),
                BiReportService::SUBJECT => $this->subject($scope, $filters, (int) $params['report_subject_id']),
                BiReportService::INSTITUTIONAL => [$this->reports->institutional($scope, $filters), 'Institucional · '.$this->periodLabel($filters)],
                BiReportService::RESULTS => [$this->reports->results($scope, $filters), 'Resultados · '.$this->periodLabel($filters)],
            };
        } catch (ReportSampleTooSmall $e) {
            return $this->error($e->getMessage(), ['code' => 'report_sample_too_small', 'min_group' => $e->minGroup], 422);
        }

        if (! empty($params['export'])) {
            $data['export_id'] = DB::table('bi_export_logs')->insertGetId([
                'tenant_id' => $tenantId,
                'user_id' => $request->user()->id,
                'report' => $report,
                'format' => $params['export'],
                'subject_label' => mb_substr($label, 0, 190),
                'filters' => json_encode($filters->toArray() + array_intersect_key($params, array_flip(['student_id', 'report_class_id', 'report_subject_id']))),
                'ip' => $request->ip(),
                'exported_at' => now(),
            ]);
        }

        return $this->success($data, 'Relatório carregado.');
    }

    /** Exportações recentes: coordenação vê as da escola; os demais, as próprias. */
    public function exports(Request $request): JsonResponse
    {
        $scope = $this->scope($request);

        $items = DB::table('bi_export_logs as l')
            ->leftJoin('users as u', 'u.id', '=', 'l.user_id')
            ->where('l.tenant_id', $scope->tenantId)
            ->when(! $scope->isTenantWide(), fn ($q) => $q->where('l.user_id', $scope->userId))
            ->orderByDesc('l.exported_at')
            ->limit(20)
            ->get(['l.id', 'l.report', 'l.format', 'l.subject_label', 'l.exported_at', 'u.name as user'])
            ->map(fn ($r) => (array) $r + ['exported_at_iso' => Carbon::parse($r->exported_at)->toIso8601String()]);

        return $this->success(['items' => $items], 'Exportações carregadas.');
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function individual(BiAccessScope $scope, BiFilters $filters, int $studentId): array
    {
        if (! $this->evolution->inScope($scope, $filters, $studentId)) {
            throw new HttpResponseException($this->forbidden('Aluno fora do seu escopo de acesso ou sem matrícula ativa no período.'));
        }

        return [$this->reports->individual($scope, $filters, $studentId), 'Individual · '.DB::table('students')->where('id', $studentId)->value('name')];
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function classReport(BiAccessScope $scope, BiFilters $filters, int $classId): array
    {
        if (! $scope->allowsClass($classId)) {
            throw new HttpResponseException($this->forbidden('Turma fora do seu escopo de acesso.'));
        }

        return [$this->reports->classReport($scope, $filters, $classId), 'Turma · '.DB::table('school_classes')->where('id', $classId)->value('name')];
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function subject(BiAccessScope $scope, BiFilters $filters, int $subjectId): array
    {
        if (! $scope->allowsSubject($subjectId)) {
            throw new HttpResponseException($this->forbidden('Disciplina fora do seu escopo de acesso.'));
        }
        $subject = Subject::query()->findOrFail($subjectId);

        return [$this->reports->subjectReport($scope, $filters, $subject), 'Disciplina · '.$subject->name];
    }

    private function periodLabel(BiFilters $filters): string
    {
        return $filters->from->format('d/m/Y').' a '.$filters->to->format('d/m/Y');
    }
}
