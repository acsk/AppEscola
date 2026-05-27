<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ClassStudentsReportService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    use ScopedByTenant;

    private const STAFF_ROLES = [
        'super_admin',
        'admin',
        'manager',
        'financial',
        'secretaria',
        'professor',
    ];

    public function __construct(
        private readonly ClassStudentsReportService $classStudentsReport,
    ) {
    }

    public function classStudents(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessStaff($request)) {
            return $denied;
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $this->validationError(
                ['tenant_id' => ['Informe o tenant no login ou envie ?tenant_id= na requisição.']],
                'tenant_id é obrigatório para esta operação.'
            );
        }

        $report = $this->classStudentsReport->paginate($tenantId, [
            'school_class_id' => $request->filled('school_class_id') ? (int) $request->query('school_class_id') : null,
            'course_id' => $request->filled('course_id') ? (int) $request->query('course_id') : null,
            'period' => $request->query('period'),
            'weekday' => $request->query('weekday'),
            'search' => $request->query('search'),
            'per_page' => $request->query('per_page'),
        ]);

        return $this->success([
            'items' => $report->items(),
            'meta' => [
                'current_page' => $report->currentPage(),
                'last_page' => $report->lastPage(),
                'per_page' => $report->perPage(),
                'total' => $report->total(),
            ],
        ], 'Relatório de turmas carregado com sucesso.');
    }

    private function denyUnlessStaff(Request $request): ?JsonResponse
    {
        $role = $request->user()?->role;

        if (! in_array($role, self::STAFF_ROLES, true)) {
            return $this->forbidden('Sem permissão para acessar relatórios.');
        }

        return null;
    }
}
