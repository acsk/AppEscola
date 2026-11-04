<?php

namespace App\Observers;

use App\Models\Invoice;
use App\Models\InvoiceAuditLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

/**
 * Grava o histórico de cada cobrança, venha a mudança do painel, da API, da sincronização Cora,
 * de comandos ou de webhook. Campos técnicos (payload Cora, carimbos de sincronização) não entram.
 */
class InvoiceAuditObserver
{
    /** Origem forçada enquanto um processamento automático roda (ex.: webhook Cora num comando). */
    private static ?string $forcedSource = null;

    /** Motivo registrado nas mudanças feitas dentro de asSource (ex.: correção em lote). */
    private static ?string $forcedReason = null;

    /**
     * Executa $callback registrando as mudanças com a origem (e, se informado, o motivo) dados.
     *
     * @template T
     * @param  callable(): T  $callback
     * @return T
     */
    public static function asSource(string $source, callable $callback, ?string $reason = null): mixed
    {
        [$previousSource, $previousReason] = [self::$forcedSource, self::$forcedReason];
        self::$forcedSource = $source;
        self::$forcedReason = $reason;

        try {
            return $callback();
        } finally {
            self::$forcedSource = $previousSource;
            self::$forcedReason = $previousReason;
        }
    }

    /** Campos de negócio acompanhados no histórico. */
    private const TRACKED = [
        'student_id',
        'guardian_id',
        'enrollment_id',
        'type',
        'description',
        'amount',
        'due_date',
        'status',
        'paid_at',
        'payment_method',
        'payment_reference',
        'notes',
        'cora_charge_id',
        'cora_status',
    ];

    public function created(Invoice $invoice): void
    {
        $changes = [];
        foreach (self::TRACKED as $field) {
            $value = $this->normalize($field, $invoice->getAttribute($field));
            if ($value !== null) {
                $changes[$field] = ['from' => null, 'to' => $value];
            }
        }

        $this->record($invoice, 'created', $changes, $invoice->edit_reason);
    }

    public function updated(Invoice $invoice): void
    {
        $changes = [];
        foreach (array_keys($invoice->getChanges()) as $field) {
            if (! in_array($field, self::TRACKED, true)) {
                continue;
            }
            $from = $this->normalize($field, $invoice->getOriginal($field));
            $to = $this->normalize($field, $invoice->getAttribute($field));
            if ($from !== $to) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        if ($changes === []) {
            return;
        }

        $reason = $invoice->wasChanged('edit_reason') ? $invoice->edit_reason : null;
        $this->record($invoice, $this->actionFor($changes), $changes, $reason ?? self::$forcedReason);
    }

    public function deleted(Invoice $invoice): void
    {
        $this->record($invoice, 'deleted', null, null);
    }

    public function restored(Invoice $invoice): void
    {
        $this->record($invoice, 'restored', null, null);
    }

    private function actionFor(array $changes): string
    {
        $status = $changes['status']['to'] ?? null;

        if ($status === 'paid') {
            return 'paid';
        }
        if ($status === 'cancelled') {
            return 'cancelled';
        }
        if (isset($changes['cora_charge_id']) && $changes['cora_charge_id']['from'] === null) {
            return 'charge_generated';
        }

        return 'updated';
    }

    private function record(Invoice $invoice, string $action, ?array $changes, ?string $reason): void
    {
        $request = app()->runningInConsole() ? null : request();
        $isWebhook = $request && str_starts_with($request->path(), 'api/webhooks/');
        $userId = Auth::id();
        $supportAccess = $request?->attributes->get('support_access');

        InvoiceAuditLog::create([
            'tenant_id' => $invoice->tenant_id,
            'invoice_id' => $invoice->id,
            'user_id' => $userId,
            'support_access_id' => $supportAccess?->id,
            'action' => $action,
            'source' => self::$forcedSource ?? ($isWebhook ? 'webhook' : ($userId ? 'user' : 'system')),
            'changes' => $changes ?: null,
            'reason' => $reason ? mb_substr($reason, 0, 500) : null,
            'ip' => $request?->ip(),
        ]);
    }

    private function normalize(string $field, mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }

        return match ($field) {
            'amount' => number_format((float) $value, 2, '.', ''),
            'due_date' => Carbon::parse($value)->toDateString(),
            'paid_at' => Carbon::parse($value)->toIso8601String(),
            'student_id', 'guardian_id', 'enrollment_id' => (int) $value,
            default => is_scalar($value) ? (string) $value : $value,
        };
    }
}
