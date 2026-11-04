<?php

namespace App\Services\Payables;

use App\Models\Expense;
use App\Models\ExpenseAuditLog;
use App\Support\BusinessDate;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Leitura de Contas a pagar. "Vencida" e "Aguardando vínculo" são calculadas pela data:
 * - Aguardando vínculo: aprovada, débito automático, vencimento chegou (o banco debita sozinho; falta a saída no extrato);
 * - Vencida: em aprovação ou aprovada, vencimento passou.
 */
class ExpenseQuery
{
    public const SITUATIONS = ['draft', 'pending_approval', 'approved', 'overdue', 'awaiting_link', 'paid', 'cancelled'];

    public static function situation(Expense $expense, ?Carbon $today = null): string
    {
        $today ??= BusinessDate::today();

        return match ($expense->status) {
            'approved' => $expense->auto_debit && $expense->due_date->lte($today)
                ? 'awaiting_link'
                : ($expense->due_date->lt($today) ? 'overdue' : 'approved'),
            'pending_approval' => $expense->due_date->lt($today) ? 'overdue' : 'pending_approval',
            default => $expense->status,
        };
    }

    /** @param  array<string, mixed>  $filters */
    public function list(int $tenantId, array $filters): LengthAwarePaginator
    {
        return $this->filtered($tenantId, $filters)
            ->with(['supplier:id,name', 'category:id,name', 'costCenter:id,name'])
            ->withCount(['attachments', 'bankEntries'])
            ->orderBy('due_date')
            ->orderBy('id')
            ->paginate(min(max((int) ($filters['per_page'] ?? 25), 1), 100));
    }

    /**
     * Cartões do protótipo e despesas por categoria no mês de referência.
     *
     * @return array<string, mixed>
     */
    public function summary(int $tenantId, Carbon $month): array
    {
        $today = BusinessDate::today();
        $base = fn () => Expense::query()->where('tenant_id', $tenantId);
        $open = ['pending_approval', 'approved'];
        $total = fn (Builder $q) => ['count' => (clone $q)->count(), 'amount' => self::decimal((float) (clone $q)->sum('amount'))];

        $tz = config('app.business_timezone', 'America/Sao_Paulo');
        $monthStart = $month->copy()->startOfMonth();
        $monthEnd = $month->copy()->endOfMonth();

        $byCategory = Expense::query()
            ->where('expenses.tenant_id', $tenantId)
            ->whereNotIn('expenses.status', ['draft', 'cancelled'])
            ->whereBetween('expenses.due_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->leftJoin('finance_categories', 'finance_categories.id', '=', 'expenses.category_id')
            ->selectRaw("COALESCE(finance_categories.name, 'Sem categoria') as name, SUM(expenses.amount) as amount")
            ->groupBy('name')
            ->orderByDesc('amount')
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'amount' => self::decimal((float) $r->amount)])
            ->all();

        return [
            'month' => $monthStart->format('Y-m'),
            'due_30_days' => $total($base()->whereIn('status', $open)->whereBetween('due_date', [$today->toDateString(), $today->copy()->addDays(30)->toDateString()])),
            'overdue' => $total($base()->whereIn('status', $open)->where('due_date', '<', $today->toDateString())
                ->where(fn ($q) => $q->where('status', 'pending_approval')->orWhere('auto_debit', false))),
            'pending_approval' => $total($base()->where('status', 'pending_approval')),
            'paid_in_month' => $total($base()->where('status', 'paid')->whereBetween('paid_at', [
                Carbon::parse($monthStart->toDateString(), $tz)->startOfDay()->setTimezone(config('app.timezone')),
                Carbon::parse($monthEnd->toDateString(), $tz)->endOfDay()->setTimezone(config('app.timezone')),
            ])),
            'without_receipt' => $total($base()->whereIn('status', ['approved', 'paid'])->whereNull('system_key')->whereDoesntHave('attachments')),
            'by_category' => $byCategory,
        ];
    }

    /** @return array<string, mixed> */
    public static function present(Expense $expense, ?Carbon $today = null): array
    {
        $today ??= BusinessDate::today();

        return [
            'id' => $expense->id,
            'code' => $expense->code(),
            'description' => $expense->description,
            'supplier' => $expense->supplier ? ['id' => $expense->supplier->id, 'name' => $expense->supplier->name] : null,
            'category' => $expense->category ? ['id' => $expense->category->id, 'name' => $expense->category->name] : null,
            'cost_center' => $expense->costCenter ? ['id' => $expense->costCenter->id, 'name' => $expense->costCenter->name] : null,
            'amount' => (string) $expense->amount,
            'due_date' => $expense->due_date?->toDateString(),
            'days_to_due' => $expense->due_date ? (int) $today->diffInDays($expense->due_date, false) : null,
            'status' => $expense->status,
            'situation' => self::situation($expense, $today),
            'recurrence' => $expense->recurrence,
            'series_id' => $expense->series_id,
            'auto_debit' => (bool) $expense->auto_debit,
            'system_managed' => $expense->system_key !== null,
            'paid_at' => $expense->paid_at?->toISOString(),
            'payment_method' => $expense->payment_method,
            'notes' => $expense->notes,
            'approved_at' => $expense->approved_at?->toISOString(),
            'attachments_count' => (int) ($expense->attachments_count ?? $expense->attachments()->count()),
            'reconciled' => (int) ($expense->bank_entries_count ?? $expense->bankEntries()->count()) > 0,
            'created_at' => $expense->created_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    public static function detail(Expense $expense): array
    {
        $expense->loadMissing(['supplier:id,name', 'category:id,name', 'costCenter:id,name', 'attachments', 'bankEntries']);

        return self::present($expense) + [
            'attachments' => $expense->attachments->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->original_name,
                'mime' => $a->mime,
                'size' => $a->size,
                'created_at' => $a->created_at?->toISOString(),
            ])->all(),
            'bank_entries' => $expense->bankEntries->sortByDesc('occurred_at')->take(50)->map(fn ($e) => [
                'id' => $e->id,
                'amount' => (string) $e->amount,
                'occurred_at' => $e->occurred_at?->toISOString(),
                'description' => $e->description,
                'counterparty_name' => $e->counterparty_name,
            ])->values()->all(),
            'history' => ExpenseAuditLog::query()
                ->where('expense_id', $expense->id)
                ->with('user:id,name')
                ->orderByDesc('id')
                ->limit(50)
                ->get()
                ->map(fn (ExpenseAuditLog $log) => [
                    'id' => $log->id,
                    'action' => $log->action,
                    'changes' => $log->changes,
                    'reason' => $log->reason,
                    'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
                    'created_at' => $log->created_at?->toISOString(),
                ])->all(),
        ];
    }

    /** @param  array<string, mixed>  $filters */
    private function filtered(int $tenantId, array $filters): Builder
    {
        $query = Expense::query()->where('tenant_id', $tenantId);

        foreach (['category_id', 'cost_center_id', 'supplier_id'] as $field) {
            if (! empty($filters[$field])) {
                $query->where($field, (int) $filters[$field]);
            }
        }

        if (($filters['recurrence'] ?? '') === 'recurring') {
            $query->where('recurrence', 'monthly');
        } elseif (($filters['recurrence'] ?? '') === 'one_off') {
            $query->where('recurrence', 'none');
        }

        if (! empty($filters['due_from'])) {
            $query->where('due_date', '>=', $filters['due_from']);
        }
        if (! empty($filters['due_to'])) {
            $query->where('due_date', '<=', $filters['due_to']);
        }

        if (! empty($filters['situation'])) {
            $this->applySituation($query, $filters['situation']);
        }

        // Mesmo critério do cartão "Sem comprovante".
        if (! empty($filters['without_receipt'])) {
            $query->whereIn('status', ['approved', 'paid'])->whereNull('system_key')->whereDoesntHave('attachments');
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $q) use ($search) {
                if (preg_match('/^(?:#|D-?)?0*(\d+)$/i', $search, $m)) {
                    $q->orWhere('id', (int) $m[1]);
                }
                $q->orWhere('description', 'like', '%' . $search . '%')
                    ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', '%' . $search . '%'));
            });
        }

        return $query;
    }

    private function applySituation(Builder $query, string $situation): void
    {
        $today = BusinessDate::today()->toDateString();

        match ($situation) {
            'awaiting_link' => $query->where('status', 'approved')->where('auto_debit', true)->where('due_date', '<=', $today),
            'overdue' => $query->where('due_date', '<', $today)->where(fn ($q) => $q
                ->where('status', 'pending_approval')
                ->orWhere(fn ($a) => $a->where('status', 'approved')->where('auto_debit', false))),
            'approved' => $query->where('status', 'approved')->where('due_date', '>=', $today)
                ->where(fn ($q) => $q->where('auto_debit', false)->orWhere('due_date', '>', $today)),
            'pending_approval' => $query->where('status', 'pending_approval')->where('due_date', '>=', $today),
            default => $query->where('status', $situation),
        };
    }

    private static function decimal(float $value): string
    {
        return number_format($value, 2, '.', '');
    }
}
