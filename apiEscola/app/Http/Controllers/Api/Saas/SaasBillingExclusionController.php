<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Tenant;
use App\Services\Saas\SaasBillingExclusionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasBillingExclusionController extends Controller
{
    public function __construct(private readonly SaasBillingExclusionService $exclusions)
    {
    }

    public function index(Request $request, Tenant $tenant): JsonResponse
    {
        return $this->success(
            $this->exclusions->present($tenant, (string) $request->query('search', '')),
            'Alunos de teste carregados com sucesso.',
        );
    }

    public function update(Request $request, Tenant $tenant, Student $student): JsonResponse
    {
        if ((int) $student->tenant_id !== (int) $tenant->id) {
            return $this->notFound('Aluno não encontrado nesta instituição.');
        }

        $data = $request->validate([
            'excluded' => ['required', 'boolean'],
        ], [], [
            'excluded' => 'aluno de teste',
        ]);

        $excluded = (bool) $data['excluded'];

        return $this->success(
            $this->exclusions->set($tenant, $student, $excluded, $request->user()),
            $excluded ? 'Aluno marcado como teste e fora da cobrança.' : 'Aluno voltou a contar na cobrança.',
        );
    }
}
