<?php

namespace App\Services\Reconciliation;

use App\Models\BankStatementEntry;
use App\Models\BankStatementEntryLog;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Cora\CoraPaidInvoicesSyncService;
use App\Services\Cora\CoraTransactionId;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Decisões de conciliação de uma movimentação do extrato.
 *
 * Só entram cobranças com ID Cora geradas por este sistema (as importadas pela sincronização Cora e
 * as locais sem ID ficam de fora, como em Contas a receber).
 * Automática: só por ID (o ID do pagamento no extrato ou o ID da cobrança citado), nunca por valor e
 * data. Manual: sempre com justificativa, e só depois que a Cora confirma
 * o pagamento. Nada aqui movimenta a conta bancária.
 */
class BankReconciliationService
{
    public const STATUSES = ['pending', 'reconciled', 'divergent', 'ignored'];

    /** @var array<int, array<string, array{invoice_id: int, total_paid: int|null}>> */
    private array $paymentIndex = [];

    public function __construct(private readonly CoraPaidInvoicesSyncService $coraSync)
    {
    }

    /** Cobranças que entram na conciliação: com ID Cora e geradas por este sistema (não importadas). */
    public static function reconcilableInvoices(int $tenantId): Builder
    {
        return Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('cora_charge_id')
            ->where('cora_charge_id', '!=', '')
            ->excludingImportedFromCoraSync();
    }

    /**
     * Dia (fuso da operação) da primeira cobrança Cora gerada pelo sistema. Antes disso nenhuma
     * movimentação pode ser pagamento de cobrança do sistema; null = ainda não opera com a Cora.
     */
    public static function operatingSince(int $tenantId): ?Carbon
    {
        $first = self::reconcilableInvoices($tenantId)->min('created_at');

        return $first
            ? Carbon::parse(Carbon::parse($first)->setTimezone(config('app.business_timezone', 'America/Sao_Paulo'))->toDateString())
            : null;
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

    /** Esquece o índice de pagamentos (chamar no início de cada sincronização). */
    public function forgetPaymentIndex(): void
    {
        $this->paymentIndex = [];
    }

    /**
     * Tenta conciliar sozinho, sempre por ID, nunca por valor/data:
     * 1) o ID da transação do extrato (trx_/ent_) é o pagamento registrado na cobrança (payments[].id),
     *    confirmado em produção pelo cora:check-payment-link;
     * 2) ou a movimentação cita o ID da cobrança (inv_...).
     *
     * @return 'pending'|'reconciled'|'divergent'|'ignored'
     */
    public function autoMatch(BankStatementEntry $entry): string
    {
        if ($entry->status !== 'pending') {
            return $entry->status;
        }

        if ($entry->direction === 'credit' && ($payment = $this->findPayment($entry)) !== null) {
            return $this->matchByPayment($entry, $payment);
        }

        $chargeIds = self::chargeIdsIn($entry);
        if ($chargeIds === []) {
            return 'pending';
        }

        $invoices = self::reconcilableInvoices($entry->tenant_id)
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
        if ($reason = $this->linkBlocker($entry, $invoice)) {
            return $this->flagDivergent($entry, $reason);
        }
        if (self::cents($entry->amount) !== self::cents($invoice->amount)) {
            return $this->flagDivergent($entry, sprintf(
                'Pago %s · cobrança #%d de %s.',
                self::money($entry->amount),
                $invoice->id,
                self::money($invoice->amount),
            ));
        }

        return $this->linkAuto($entry, $invoice, null);
    }

    /** @param  array{invoice_id: int, total_paid: int|null}  $payment */
    private function matchByPayment(BankStatementEntry $entry, array $payment): string
    {
        $invoice = Invoice::query()->find($payment['invoice_id']);
        if (! $invoice) {
            return 'pending';
        }
        if ($reason = $this->linkBlocker($entry, $invoice)) {
            return $this->flagDivergent($entry, $reason);
        }

        $paid = self::cents($entry->amount);
        $sameAsInvoice = $paid === self::cents($invoice->amount);

        // O ID prova que é o pagamento desta cobrança; o valor pode ter juros/multa (total pago na Cora).
        if (! $sameAsInvoice && $paid !== $payment['total_paid']) {
            return $this->flagDivergent($entry, sprintf(
                'Pagamento da cobrança #%d (ID confere), mas o valor não: pago %s · cobrança de %s.',
                $invoice->id,
                self::money($entry->amount),
                self::money($invoice->amount),
            ), ['invoice_id' => $invoice->id]);
        }

        return $this->linkAuto($entry, $invoice, $sameAsInvoice ? null : sprintf(
            'Pago %s com juros/multa · cobrança #%d de %s.',
            self::money($entry->amount),
            $invoice->id,
            self::money($invoice->amount),
        ));
    }

    /** Motivo que impede ligar a entrada à cobrança, ou null. */
    private function linkBlocker(BankStatementEntry $entry, Invoice $invoice): ?string
    {
        if ($this->coraSync->resolveEnvironment($invoice, $entry->environment) !== $entry->environment) {
            return "Cobrança #{$invoice->id} é de outro ambiente da Cora.";
        }
        if ($invoice->status === 'cancelled') {
            return "Cobrança #{$invoice->id} está cancelada no sistema.";
        }
        if ($this->linkedElsewhere($invoice->id, $entry->id)) {
            return "Cobrança #{$invoice->id} já está conciliada com outra movimentação (possível duplicidade).";
        }

        return null;
    }

    private function linkAuto(BankStatementEntry $entry, Invoice $invoice, ?string $note): string
    {
        try {
            $this->transition($entry, ['pending'], 'reconciled', 'auto_reconciled', null, null, [
                'match_type' => 'auto',
                'invoice_id' => $invoice->id,
                'divergence' => $note,
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

    /** @return array{invoice_id: int, total_paid: int|null}|null */
    private function findPayment(BankStatementEntry $entry): ?array
    {
        $index = $this->paymentIndex((int) $entry->tenant_id);
        if ($index === []) {
            return null;
        }

        foreach ([$entry->transaction_id, $entry->external_id] as $id) {
            foreach (CoraTransactionId::uuidCandidates($id) as $uuid) {
                if (isset($index[$uuid])) {
                    return $index[$uuid];
                }
            }
        }

        return null;
    }

    /**
     * payments[].id (UUID) → cobrança, só das cobranças geradas pelo sistema.
     *
     * @return array<string, array{invoice_id: int, total_paid: int|null}>
     */
    private function paymentIndex(int $tenantId): array
    {
        if (isset($this->paymentIndex[$tenantId])) {
            return $this->paymentIndex[$tenantId];
        }

        $map = [];
        self::reconcilableInvoices($tenantId)
            ->whereNotNull('cora_payload')
            ->select(['id', 'cora_payload'])
            ->lazyById(500)
            ->each(function (Invoice $invoice) use (&$map) {
                foreach ((array) data_get($invoice->cora_payload, 'payments', []) as $payment) {
                    $uuid = CoraTransactionId::normalizeUuid(data_get($payment, 'id'));
                    if ($uuid !== null) {
                        $total = data_get($payment, 'total_paid');
                        $map[$uuid] = ['invoice_id' => (int) $invoice->id, 'total_paid' => is_numeric($total) ? (int) $total : null];
                    }
                }
            });

        return $this->paymentIndex[$tenantId] = $map;
    }

    /**
     * Concilia uma entrada com uma cobrança Cora gerada pelo sistema. Se ela ainda não está paga,
     * consulta a Cora e só concilia quando a Cora confirma o pagamento; a baixa vem dessa consulta.
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
        if (! self::reconcilableInvoices($entry->tenant_id)->whereKey($invoice->id)->exists()) {
            throw new RuntimeException('Só cobranças geradas pelo sistema na Cora podem ser conciliadas.');
        }
        if ($invoice->status === 'cancelled') {
            throw new RuntimeException('Cobrança cancelada não pode ser conciliada.');
        }
        if ($this->linkedElsewhere($invoice->id, $entry->id)) {
            throw new RuntimeException("A cobrança #{$invoice->id} já está conciliada com outra movimentação.");
        }

        if ($invoice->status !== 'paid') {
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
            function (BankStatementEntry $locked) use ($invoice) {
                $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();

                if ($this->linkedElsewhere($lockedInvoice->id, $locked->id)) {
                    throw new RuntimeException("A cobrança #{$lockedInvoice->id} já está conciliada com outra movimentação.");
                }
                if ($lockedInvoice->status !== 'paid') {
                    throw new RuntimeException("A cobrança #{$lockedInvoice->id} não está paga. Nada foi conciliado.");
                }
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

    /** @param  array<string, mixed>  $attributes  Ex.: invoice_id quando o ID prova o vínculo mas o valor não bate */
    private function flagDivergent(BankStatementEntry $entry, string $reason, array $attributes = []): string
    {
        try {
            $this->transition($entry, ['pending'], 'divergent', 'auto_divergent', null, null, ['divergence' => $reason] + $attributes);
        } catch (QueryException) {
            // Cobrança ligada a outra movimentação no meio do caminho: marca sem o vínculo.
            return $attributes === [] ? $entry->refresh()->status : $this->flagDivergent($entry, $reason);
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
