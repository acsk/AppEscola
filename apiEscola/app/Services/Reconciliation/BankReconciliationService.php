<?php

namespace App\Services\Reconciliation;

use App\Models\BankStatementEntry;
use App\Models\BankStatementEntryLog;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Cora\CoraPaidInvoicesSyncService;
use App\Services\InvoiceLifecycleService;
use App\Services\InvoiceSettlementService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Decisões de conciliação de uma movimentação do extrato.
 *
 * Automática: só quando a movimentação cita o ID de uma cobrança Cora do sistema e o valor é igual.
 * Valor e data iguais nunca bastam. Manual: sempre com justificativa; cobrança emitida na Cora só é
 * conciliada depois que a Cora confirma o pagamento (mesma regra da baixa manual). Nada aqui
 * movimenta a conta bancária.
 */
class BankReconciliationService
{
    public const STATUSES = ['pending', 'reconciled', 'divergent', 'ignored'];

    public function __construct(
        private readonly CoraPaidInvoicesSyncService $coraSync,
        private readonly InvoiceSettlementService $settlement,
        private readonly InvoiceLifecycleService $lifecycle,
    ) {
    }

    /**
     * IDs de cobrança Cora (inv_...) citados na movimentação.
     *
     * @return array<int, string>
     */
    public static function chargeIdsIn(BankStatementEntry $entry): array
    {
        $text = $entry->description . ' ' . $entry->transaction_id;
        preg_match_all('/\binv_[A-Za-z0-9]+\b/', $text, $matches);

        return array_values(array_unique($matches[0]));
    }

    /** @return 'pending'|'reconciled'|'divergent'|'ignored' */
    public function autoMatch(BankStatementEntry $entry): string
    {
        if ($entry->status !== 'pending') {
            return $entry->status;
        }

        $chargeIds = self::chargeIdsIn($entry);
        if ($chargeIds === []) {
            return 'pending';
        }

        $invoices = Invoice::query()
            ->where('tenant_id', $entry->tenant_id)
            ->whereIn('cora_charge_id', $chargeIds)
            ->get();

        if ($invoices->isEmpty()) {
            return 'pending';
        }
        if ($invoices->count() > 1) {
            return $this->flagDivergent($entry, 'A movimentação cita mais de uma cobrança do sistema.');
        }

        /** @var Invoice $invoice */
        $invoice = $invoices->first();

        if ($entry->direction === 'debit') {
            return $this->flagDivergent($entry, $invoice->status === 'paid'
                ? "Saída ligada à cobrança #{$invoice->id}, que consta como paga (possível estorno)."
                : "Saída ligada à cobrança #{$invoice->id}.");
        }
        if ($this->coraSync->resolveEnvironment($invoice, $entry->environment) !== $entry->environment) {
            return $this->flagDivergent($entry, "Cobrança #{$invoice->id} é de outro ambiente da Cora.");
        }
        if ($invoice->status === 'cancelled') {
            return $this->flagDivergent($entry, "Cobrança #{$invoice->id} está cancelada no sistema.");
        }
        if ($this->linkedElsewhere($invoice->id, $entry->id)) {
            return $this->flagDivergent($entry, "Cobrança #{$invoice->id} já está conciliada com outra movimentação (possível duplicidade).");
        }
        if (self::cents($entry->amount) !== self::cents($invoice->amount)) {
            return $this->flagDivergent($entry, sprintf(
                'Pago %s · cobrança #%d de %s.',
                self::money($entry->amount),
                $invoice->id,
                self::money($invoice->amount),
            ));
        }

        try {
            $this->transition($entry, ['pending'], 'reconciled', 'auto_reconciled', null, null, [
                'match_type' => 'auto',
                'invoice_id' => $invoice->id,
                'divergence' => null,
            ]);
        } catch (QueryException) {
            // Outra movimentação conciliou a mesma cobrança ao mesmo tempo (índice único em invoice_id).
            return $this->flagDivergent($entry, "Cobrança #{$invoice->id} já está conciliada com outra movimentação (possível duplicidade).");
        } catch (RuntimeException) {
            return $entry->refresh()->status;
        }

        // O dinheiro entrou, mas a baixa continua vindo da consulta à Cora, como no webhook.
        if ($invoice->status !== 'paid') {
            try {
                $this->coraSync->syncOne($invoice, $entry->environment, 'bank-reconciliation');
            } catch (Throwable $e) {
                Log::warning('Conciliação bancária: consulta à Cora falhou após conciliar.', [
                    'entry_id' => $entry->id,
                    'invoice_id' => $invoice->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return 'reconciled';
    }

    /**
     * Concilia uma entrada com uma cobrança. Cobrança emitida na Cora: consulta a Cora e só concilia se
     * ela confirmar o pagamento. Cobrança local em aberto: baixa pelo fluxo normal, com a justificativa
     * registrada na auditoria da cobrança.
     */
    public function reconcile(BankStatementEntry $entry, Invoice $invoice, string $justification, User $user): BankStatementEntry
    {
        $this->assertStatus($entry, ['pending', 'divergent']);

        if ($entry->direction !== 'credit') {
            throw new RuntimeException('Só entradas podem ser conciliadas com cobranças.');
        }
        if ((int) $invoice->tenant_id !== (int) $entry->tenant_id) {
            throw new RuntimeException('Cobrança não encontrada.');
        }
        if ($invoice->status === 'cancelled') {
            throw new RuntimeException('Cobrança cancelada não pode ser conciliada.');
        }
        if ($this->linkedElsewhere($invoice->id, $entry->id)) {
            throw new RuntimeException("A cobrança #{$invoice->id} já está conciliada com outra movimentação.");
        }

        if ($invoice->status !== 'paid' && $this->lifecycle->hasGeneratedPaymentCharge($invoice)) {
            // Consulta fora da transação; ConnectionException/RequestException sobem para o controller.
            $this->coraSync->syncOne($invoice, $this->coraSync->resolveEnvironment($invoice, $entry->environment), 'bank-reconciliation');
            if ($invoice->refresh()->status !== 'paid') {
                throw new RuntimeException("A Cora ainda não confirmou o pagamento da cobrança #{$invoice->id}. Nada foi conciliado.");
            }
        }

        $divergence = self::cents($entry->amount) !== self::cents($invoice->amount)
            ? sprintf('Pago %s · cobrança #%d de %s.', self::money($entry->amount), $invoice->id, self::money($invoice->amount))
            : null;

        return $this->transition(
            $entry,
            ['pending', 'divergent'],
            'reconciled',
            'reconciled',
            $user,
            $justification,
            ['match_type' => 'manual', 'invoice_id' => $invoice->id, 'divergence' => $divergence],
            function (BankStatementEntry $locked) use ($invoice, $justification) {
                $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();

                if ($this->linkedElsewhere($lockedInvoice->id, $locked->id)) {
                    throw new RuntimeException("A cobrança #{$lockedInvoice->id} já está conciliada com outra movimentação.");
                }
                if ($lockedInvoice->status === 'paid') {
                    return;
                }
                if (! $this->settlement->allowsManualSettlement($lockedInvoice)) {
                    throw new RuntimeException((string) ($this->settlement->manualSettlementBlockReason($lockedInvoice)
                        ?? 'Baixa não permitida para esta cobrança.'));
                }

                $lockedInvoice->edit_reason = mb_substr('Conciliação bancária: ' . $justification, 0, 500);
                $this->settlement->settle($lockedInvoice, [
                    'paid_at' => $locked->occurred_at,
                    'payment_method' => $locked->transaction_type === 'PIX' ? 'pix' : 'transfer',
                ]);
            },
        );
    }

    public function ignore(BankStatementEntry $entry, string $justification, User $user): BankStatementEntry
    {
        return $this->transition($entry, ['pending', 'divergent'], 'ignored', 'ignored', $user, $justification);
    }

    public function markDivergent(BankStatementEntry $entry, string $justification, User $user): BankStatementEntry
    {
        return $this->transition($entry, ['pending'], 'divergent', 'divergent', $user, $justification, [
            'divergence' => 'Marcada manualmente.',
        ]);
    }

    /** Volta para pendente. Não desfaz a baixa da cobrança: isso continua sendo feito na própria cobrança. */
    public function undo(BankStatementEntry $entry, string $justification, User $user): BankStatementEntry
    {
        return $this->transition($entry, ['reconciled', 'divergent', 'ignored'], 'pending', 'undone', $user, $justification, [
            'match_type' => null,
            'invoice_id' => null,
            'divergence' => null,
        ]);
    }

    private function flagDivergent(BankStatementEntry $entry, string $reason): string
    {
        try {
            $this->transition($entry, ['pending'], 'divergent', 'auto_divergent', null, null, ['divergence' => $reason]);
        } catch (RuntimeException) {
            return $entry->refresh()->status;
        }

        return 'divergent';
    }

    /**
     * Troca a situação sob trava, conferindo a situação atual, e grava o histórico.
     *
     * @param  array<int, string>  $from
     * @param  array<string, mixed>  $attributes
     * @param  (callable(BankStatementEntry): void)|null  $inside  Executado na mesma transação, antes da troca
     */
    private function transition(
        BankStatementEntry $entry,
        array $from,
        string $to,
        string $action,
        ?User $user,
        ?string $justification,
        array $attributes = [],
        ?callable $inside = null,
    ): BankStatementEntry {
        $updated = DB::transaction(function () use ($entry, $from, $to, $action, $user, $justification, $attributes, $inside) {
            $locked = BankStatementEntry::query()->whereKey($entry->id)->lockForUpdate()->firstOrFail();
            $this->assertStatus($locked, $from);

            if ($inside !== null) {
                $inside($locked);
            }

            $previous = $locked->status;
            $locked->update(array_merge([
                'status' => $to,
                'justification' => $justification,
                'reviewed_by' => $user?->id,
                'reviewed_at' => now(),
            ], $attributes));

            BankStatementEntryLog::create([
                'tenant_id' => $locked->tenant_id,
                'entry_id' => $locked->id,
                'user_id' => $user?->id,
                'action' => $action,
                'from_status' => $previous,
                'to_status' => $to,
                'invoice_id' => $locked->invoice_id,
                'justification' => $justification,
            ]);

            return $locked;
        });

        $entry->setRawAttributes($updated->getAttributes(), true);

        return $entry;
    }

    /** @param  array<int, string>  $allowed */
    private function assertStatus(BankStatementEntry $entry, array $allowed): void
    {
        if (! in_array($entry->status, $allowed, true)) {
            throw new RuntimeException('A movimentação mudou de situação. Atualize a tela e tente novamente.');
        }
    }

    private function linkedElsewhere(int $invoiceId, int $entryId): bool
    {
        return BankStatementEntry::query()
            ->where('invoice_id', $invoiceId)
            ->where('id', '!=', $entryId)
            ->exists();
    }

    public static function cents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }

    public static function money(mixed $amount): string
    {
        return 'R$ ' . number_format((float) $amount, 2, ',', '.');
    }
}
