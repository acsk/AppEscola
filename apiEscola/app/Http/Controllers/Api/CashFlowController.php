<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Finance\CashFlowService;
use App\Services\Finance\FinanceConsolidatedReportService;
use App\Support\FinancePermissions;
use App\Traits\AuthorizesFinance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/** Financeiro > Fluxo de caixa: realizado × previsto calculado pelo sistema (não é saldo do banco). */
class CashFlowController extends Controller
{
    use AuthorizesFinance;

    public function __construct(
        private readonly CashFlowService $cashFlow,
        private readonly FinanceConsolidatedReportService $consolidated,
    ) {
    }

    /** Relatório consolidado por mês (até 24 meses). */
    public function consolidated(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate([
            'month_from' => ['required', 'date_format:Y-m'],
            'month_to' => ['required', 'date_format:Y-m'],
        ]);

        $from = Carbon::createFromFormat('Y-m-d', $data['month_from'] . '-01')->startOfDay();
        $to = Carbon::createFromFormat('Y-m-d', $data['month_to'] . '-01')->endOfMonth()->startOfDay();
        if ($from->gt($to) || $from->diffInMonths($to) >= 24) {
            return $this->validationError(['month_to' => ['Escolha de 1 a 24 meses.']], 'Escolha de 1 a 24 meses.');
        }

        return $this->success(
            $this->consolidated->build($tenantId, $from, $to, app()->environment('production') ? 'prod' : 'stage'),
            'Relatório consolidado carregado com sucesso.',
        );
    }

    public function show(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate([
            'granularity' => ['nullable', Rule::in(CashFlowService::GRANULARITIES)],
            'date_from' => ['nullable', 'date_format:Y-m-d', 'required_with:date_to'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'required_with:date_from', 'after_or_equal:date_from'],
            'category_id' => ['nullable', 'integer'],
            'cost_center_id' => ['nullable', 'integer'],
        ]);

        try {
            $body = $this->cashFlow->build(
                $tenantId,
                $data['granularity'] ?? 'weekly',
                isset($data['date_from']) ? Carbon::parse($data['date_from']) : null,
                isset($data['date_to']) ? Carbon::parse($data['date_to']) : null,
                ['category_id' => $data['category_id'] ?? null, 'cost_center_id' => $data['cost_center_id'] ?? null],
                app()->environment('production') ? 'prod' : 'stage',
            );
        } catch (InvalidArgumentException $e) {
            return $this->validationError(['date_to' => [$e->getMessage()]], $e->getMessage());
        }

        return $this->success($body, 'Fluxo de caixa carregado com sucesso.');
    }
}
