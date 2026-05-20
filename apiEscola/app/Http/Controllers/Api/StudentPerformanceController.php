<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Services\StudentPerformanceService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentPerformanceController extends Controller
{
    use ScopedByTenant;

    public function __construct(private readonly StudentPerformanceService $performance)
    {
    }

    /**
     * Métricas de aproveitamento do aluno autenticado (role: aluno).
     */
    public function forAuthenticatedStudent(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'aluno') {
            return $this->forbidden('Este endpoint é exclusivo para alunos.');
        }

        $student = Student::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $student) {
            return $this->forbidden('Aluno não encontrado ou inativo.');
        }

        return $this->success(
            $this->performance->build(
                $student,
                $this->resolveMonths($request),
                $this->resolveSubjectId($request),
            ),
            'Métricas de aproveitamento carregadas.'
        );
    }

    /**
     * Métricas de aproveitamento de um aluno (painel admin/professor).
     */
    public function forStudent(Request $request, Student $student): JsonResponse
    {
        $this->authorizeTenant($request, $student->tenant_id);

        $user = $request->user();

        if (! in_array($user->role, ['admin', 'super_admin', 'professor'], true)) {
            return $this->forbidden('Sem permissão para visualizar o desempenho deste aluno.');
        }

        return $this->success(
            $this->performance->build(
                $student,
                $this->resolveMonths($request),
                $this->resolveSubjectId($request),
            ),
            'Métricas de aproveitamento carregadas.'
        );
    }

    private function resolveMonths(Request $request): int
    {
        $months = (int) $request->query('months', 6);

        return max(1, min(24, $months));
    }

    private function resolveSubjectId(Request $request): ?int
    {
        if (! $request->filled('subject_id')) {
            return null;
        }

        return (int) $request->query('subject_id');
    }
}
