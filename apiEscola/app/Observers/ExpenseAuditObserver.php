<?php

namespace App\Observers;

use App\Models\Expense;
use App\Models\ExpenseAuditLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

/** Histórico de cada despesa: quem mudou, o quê e por quê (painel, conciliação ou rotina). */
class ExpenseAuditObserver
{
    private static ?string $reason = null;

    private const TRACKED = [
        'description',
        'supplier_id',
        'category_id',
        'cost_center_id',
        'amount',
        'due_date',
        'status',
        'recurrence',
        'auto_debit',
        'paid_at',
        'payment_method',
        'notes',
    ];

    private const STATUS_ACTION = [
        'pending_approval' => 'submitted',
        'approved' => 'approved',
        'paid' => 'paid',
        'cancelled' => 'cancelled',
    ];

    /**
     * Executa $callback registrando o motivo nas mudanças.
     *
     * @template T
     * @param  callable(): T  $callback
     * @return T
     */
    public static function withReason(?string $reason, callable $callback): mixed
    {
        $previous = self::$reason;
        self::$reason = $reason;

        try {
            return $callback();
        } finally {
            self::$reason = $previous;
        }
    }

    public static function log(Expense $expense, string $action, ?array $changes = null, ?string $reason = null): void
    {
        $request = app()->runningInConsole() ? null : request();

        ExpenseAuditLog::create([
            'tenant_id' => $expense->tenant_id,
            'expense_id' => $expense->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'changes' => $changes ?: null,
            'reason' => ($reason ?? self::$reason) ? mb_substr((string) ($reason ?? self::$reason), 0, 500) : null,
            'ip' => $request?->ip(),
        ]);
    }

    public function created(Expense $expense): void
    {
        $changes = [];
        foreach (self::TRACKED as $field) {
            $value = $this->normalize($field, $expense->getAttribute($field));
            if ($value !== null) {
                $changes[$field] = ['from' => null, 'to' => $value];
            }
        }

        self::log($expense, 'created', $changes);
    }

    public function updated(Expense $expense): void
    {
        $changes = [];
        foreach (array_keys($expense->getChanges()) as $field) {
            if (! in_array($field, self::TRACKED, true)) {
                continue;
            }
            $from = $this->normalize($field, $expense->getOriginal($field));
            $to = $this->normalize($field, $expense->getAttribute($field));
            if ($from !== $to) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        if ($changes === []) {
            return;
        }

        $action = isset($changes['status']) ? (self::STATUS_ACTION[$changes['status']['to']] ?? 'updated') : 'updated';
        self::log($expense, $action, $changes);
    }

    private function normalize(string $field, mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof Carbon || $value instanceof \DateTimeInterface) {
            return $field === 'due_date' ? $value->format('Y-m-d') : Carbon::instance($value)->toISOString();
        }
        if ($field === 'amount') {
            return number_format((float) $value, 2, '.', '');
        }
        if ($field === 'auto_debit') {
            return (bool) $value;
        }

        return is_numeric($value) && str_ends_with($field, '_id') ? (int) $value : $value;
    }
}
