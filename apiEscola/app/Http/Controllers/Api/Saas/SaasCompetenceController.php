<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\Saas\SaasCompetenceService;
use App\Support\BusinessDate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasCompetenceController extends Controller
{
    public function __construct(private readonly SaasCompetenceService $competences)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', BusinessDate::today()->year);
        if ($year < 2000 || $year > 2100) {
            return $this->validationError(['year' => ['Informe um ano válido.']], 'Ano inválido.');
        }

        return $this->success($this->competences->year($year), 'Fechamento do ano carregado com sucesso.');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'competence' => ['required', 'date_format:Y-m'],
        ], [], [
            'tenant_id' => 'instituição',
            'competence' => 'competência',
        ]);

        $close = $this->competences->close(Tenant::query()->findOrFail($data['tenant_id']), $data['competence'], $request->user());

        return $this->success([
            'tenant_id' => $close->tenant_id,
            'competence' => $close->competence->format('Y-m'),
            'app_students' => $close->app_students,
            'total' => number_format((float) $close->total, 2, '.', ''),
        ], 'Mês fechado com sucesso.');
    }
}
