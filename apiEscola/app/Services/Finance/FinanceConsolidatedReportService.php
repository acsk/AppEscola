<?php

namespace App\Services\Finance;

use App\Models\BankStatementEntry;
use App\Models\Expense;
use App\Models\FinanceCategory;
use App\Models\Invoice;
use App\Services\Reconciliation\BankReconciliationService;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;

/**
 * Relatório consolidado: resultado por mês (recebido − pago), despesas por categoria, posição de contas a
 * receber/pagar e conciliações pendentes. O mensal vem do mesmo cálculo do Fluxo de caixa (mesmos números).
 */
class FinanceConsolidatedReportService
{
    /** Limite de movimentações pendentes listadas (o total vem sempre completo). */
    private const PENDING_ITEMS_LIMIT = 500;

    public function __construct(private readonly CashFlowService $cashFlow)
    {
    }

    /** @return array<string, mixed> */
    public function build(int $tenantId, Carbon $from, Carbon $to, string $environment): array
    {
        $flow = $this->cashFlow->build($tenantId, 'monthly', $from, $to, [], $environment);
        $from = Carbon::parse($flow['period']['from']);
        $to = Carbon::parse($flow['period']['to']);

        $months = array_map(fn (array $b) => [
            'month' => substr($b['start'], 0, 7),
            'label' => $b['label'],
            'state' => $b['state'],
            'revenue' => $b['realized_in'],
            'expenses' => $b['realized_out'],
            'result' => $b['realized_in'] === null ? null : self::money((float) $b['realized_in'] - (float) $b['realized_out']),
        ], $flow['buckets']);

        $today = BusinessDate::today();

        return [
            'period' => $flow['period'],
            'today' => $today->toDateString(),
            'months' => $months,
            'totals' => [
                'revenue' => $flow['realized']['inflow'],
                'expenses' => $flow['realized']['outflow'],
                'result' => $flow['realized']['net'],
            ],
            'expenses_by_category' => $this->expensesByCategory($tenantId, $from, $to),
            'position' => $this->position($tenantId, $today),
            'reconciliation' => $this->pendingReconciliation($tenantId, $environment),
        ];
    }

    /** Despesas pagas no período, por categoria. */
    private function expensesByCategory(int $tenantId, Carbon $from, Carbon $to): array
    {
        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        $names = FinanceCategory::query()->where('tenant_id', $tenantId)->pluck('name', 'id');

        $rows = Expense::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'paid')
            ->whereBetween('paid_at', [
                Carbon::parse($from->toDateString(), $tz)->startOfDay()->setTimezone(config('app.timezone')),
                Carbon::parse($to->toDateString(), $tz)->endOfDay()->setTimezone(config('app.timezone')),
            ])
            ->selectRaw('category_id, COUNT(*) as total, SUM(amount) as amount')
            ->groupBy('category_id')
            ->get();

        return $rows
            ->map(fn ($r) => [
                'name' => $r->category_id ? ($names[$r->category_id] ?? 'Sem categoria') : 'Sem categoria',
                'count' => (int) $r->total,
                'amount' => self::money((float) $r->amount),
            ])
            ->sortByDesc(fn ($r) => (float) $r['amount'])
            ->values()
            ->all();
    }

    /** Posição de hoje: o que está em aberto e o que já venceu, a receber e a pagar. */
    private function position(int $tenantId, Carbon $today): array
    {
        $invoices = fn () => Invoice::query()->where('tenant_id', $tenantId)->whereNull('deleted_at')->excludingImportedFromCoraSync()->whereIn('status', ['pending', 'overdue']);
        $expenses = fn () => Expense::query()->where('tenant_id', $tenantId)->whereIn('status', ['pending_approval', 'approved']);
        $total = fn ($q) => ['count' => (clone $q)->count(), 'amount' => self::money((float) (clone $q)->sum('amount'))];

        return [
            'receivable_open' => $total($invoices()),
            'receivable_overdue' => $total($invoices()->where('due_date', '<', $today->toDateString())),
            'payable_open' => $total($expenses()),
            'payable_overdue' => $total($expenses()->where('due_date', '<', $today->toDateString())),
        ];
    }

    /** Movimentações do extrato ainda sem decisão (pendentes ou divergentes), desde o início da operação. */
    private function pendingReconciliation(int $tenantId, string $environment): array
    {
        $since = BankReconciliationService::operatingSince($tenantId);
        $base = fn () => BankStatementEntry::query()
            ->where('tenant_id', $tenantId)
            ->where('environment', $environment)
            ->whereIn('status', ['pending', 'divergent'])
            ->when($since, fn ($q) => $q->where('occurred_at', '>=', Carbon::parse($since->toDateString(), config('app.business_timezone', 'America/Sao_Paulo'))->startOfDay()->setTimezone(config('app.timezone'))))
            ->when(! $since, fn ($q) => $q->whereRaw('1 = 0'));

        $summary = $base()->selectRaw('direction, status, COUNT(*) as total, SUM(amount) as amount')->groupBy('direction', 'status')->get()
            ->map(fn ($r) => ['direction' => $r->direction, 'status' => $r->status, 'count' => (int) $r->total, 'amount' => self::money((float) $r->amount)])
            ->all();

        $items = $base()->orderByDesc('occurred_at')->limit(self::PENDING_ITEMS_LIMIT)
            ->get(['occurred_at', 'direction', 'transaction_type', 'description', 'counterparty_name', 'amount', 'status', 'divergence'])
            ->map(fn (BankStatementEntry $e) => [
                'occurred_at' => $e->occurred_at?->toISOString(),
                'direction' => $e->direction,
                'transaction_type' => $e->transaction_type,
                'description' => $e->description,
                'counterparty_name' => $e->counterparty_name,
                'amount' => (string) $e->amount,
                'status' => $e->status,
                'divergence' => $e->divergence,
            ])->all();

        return ['summary' => $summary, 'items' => $items, 'items_limited' => count($items) === self::PENDING_ITEMS_LIMIT];
    }

    private static function money(float $value): string
    {
        return number_format(round($value, 2), 2, '.', '');
    }
}
