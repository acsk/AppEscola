<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ClassStudentsReportService;
use App\Services\FinanceReportService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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
        private readonly FinanceReportService $financeReport,
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

    public function finance(Request $request): JsonResponse
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

        $validated = $request->validate([
            'date_basis' => ['nullable', 'in:due_date,paid_at,created_at'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'status' => ['nullable', 'in:pending,paid,overdue,cancelled'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'type' => ['nullable', 'string', 'max:40'],
            'school_class_id' => ['nullable', 'integer', 'min:1'],
            'course_id' => ['nullable', 'integer', 'min:1'],
            'search' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if (! empty($validated['date_from']) && ! empty($validated['date_to'])) {
            $from = Carbon::parse($validated['date_from'])->startOfMonth();
            $to = Carbon::parse($validated['date_to'])->startOfMonth();
            if ((int) abs($from->diffInMonths($to)) > 24) {
                return $this->validationError(
                    ['date_to' => ['O período pode ter no máximo 24 meses.']],
                    'O período pode ter no máximo 24 meses.'
                );
            }
        }

        return $this->success(
            $this->financeReport->build($tenantId, $validated),
            'Relatório financeiro carregado com sucesso.'
        );
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
