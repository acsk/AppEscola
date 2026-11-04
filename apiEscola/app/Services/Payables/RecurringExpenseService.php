<?php

namespace App\Services\Payables;

use App\Models\Expense;
use App\Observers\ExpenseAuditObserver;
use App\Support\BusinessDate;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;

/**
 * Gera as próximas competências das despesas mensais até 30 dias à frente. O índice único
 * (series_id, due_date) impede duplicar a mesma competência, mesmo com duas execuções ao mesmo tempo.
 * Para encerrar uma série, basta tirar a recorrência da última despesa dela.
 */
class RecurringExpenseService
{
    private const HORIZON_DAYS = 30;

    /** Limite de competências por série numa execução (série esquecida há muito tempo). */
    private const MAX_PER_SERIES = 12;

    public function generate(?int $tenantId = null, ?Carbon $today = null): int
    {
        $today ??= BusinessDate::today();
        $horizon = $today->copy()->addDays(self::HORIZON_DAYS);
        $created = 0;

        $latestIds = Expense::query()
            ->whereNotNull('series_id')
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->selectRaw('MAX(id) as id')
            ->groupBy('series_id')
            ->pluck('id');

        foreach (Expense::query()->whereIn('id', $latestIds)->get() as $latest) {
            $latest = $this->latestOfSeries($latest);
            $root = Expense::query()->find($latest->series_id) ?? $latest;

            for ($i = 0; $i < self::MAX_PER_SERIES && $latest->recurrence === 'monthly'; $i++) {
                $due = $this->nextDueDate($latest, (int) $root->due_date->day);
                if ($due->gt($horizon)) {
                    break;
                }
                $next = $this->nextOccurrence($latest, $due);
                if ($next === null) {
                    $latest = $this->latestOfSeries($latest);
                    break;
                }
                $created++;
                $latest = $next;
            }
        }

        return $created;
    }

    /** Mesmo dia da primeira despesa da série; em meses mais curtos, o último dia do mês. */
    private function nextDueDate(Expense $latest, int $day): Carbon
    {
        $month = $latest->due_date->copy()->startOfMonth()->addMonthNoOverflow();

        return $month->copy()->day(min($day, $month->daysInMonth));
    }

    private function nextOccurrence(Expense $latest, Carbon $due): ?Expense
    {
        // Competência recorrente já autorizada segue aprovada; senão volta para rascunho.
        $status = in_array($latest->status, ['approved', 'paid'], true) ? 'approved' : 'draft';

        try {
            return ExpenseAuditObserver::withReason(
                "Gerada pela recorrência mensal da {$latest->code()}" . ($status === 'approved' ? ' (aprovação mantida).' : '.'),
                fn () => Expense::query()->create([
                    'tenant_id' => $latest->tenant_id,
                    'description' => $latest->description,
                    'supplier_id' => $latest->supplier_id,
                    'category_id' => $latest->category_id,
                    'cost_center_id' => $latest->cost_center_id,
                    'amount' => $latest->amount,
                    'due_date' => $due->toDateString(),
                    'status' => $status,
                    'recurrence' => 'monthly',
                    'series_id' => $latest->series_id,
                    'auto_debit' => $latest->auto_debit,
                    'notes' => $latest->notes,
                    'approved_at' => $status === 'approved' ? now() : null,
                ]),
            );
        } catch (QueryException) {
            return null; // Competência já existe (outra execução criou).
        }
    }

    private function latestOfSeries(Expense $expense): Expense
    {
        return Expense::query()
            ->where('series_id', $expense->series_id)
            ->orderByDesc('due_date')
            ->orderByDesc('id')
            ->first() ?? $expense;
    }
}
