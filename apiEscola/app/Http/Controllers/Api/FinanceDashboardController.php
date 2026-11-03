<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FinancialDashboardService;
use App\Support\FinancePermissions;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class FinanceDashboardController extends Controller
{
    use ScopedByTenant;

    private const MAX_PERIOD_DAYS = 366;

    public function __construct(private readonly FinancialDashboardService $dashboard)
    {
    }

    public function show(Request $request): JsonResponse
    {
        if (! FinancePermissions::allows($request->user(), FinancePermissions::VIEW)) {
            return $this->forbidden('Sem permissão para acessar o financeiro.');
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $this->validationError(
                ['tenant_id' => ['Selecione uma instituição.']],
                'Selecione uma instituição para ver o financeiro.'
            );
        }

        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ]);

        $to = isset($validated['date_to']) ? Carbon::parse($validated['date_to']) : Carbon::today();
        $from = isset($validated['date_from']) ? Carbon::parse($validated['date_from']) : $to->copy()->startOfMonth();

        if ($from->gt($to)) {
            return $this->validationError(
                ['date_from' => ['A data inicial deve ser anterior à final.']],
                'A data inicial deve ser anterior à final.'
            );
        }

        if ((int) $from->diffInDays($to) + 1 > self::MAX_PERIOD_DAYS) {
            return $this->validationError(
                ['date_to' => ['O período pode ter no máximo 366 dias.']],
                'O período pode ter no máximo 366 dias.'
            );
        }

        $body = $this->dashboard->build($tenantId, $from, $to);
        $body['permissions'] = FinancePermissions::forUser($request->user());

        return $this->success($body, 'Visão geral financeira carregada com sucesso.');
    }
}
