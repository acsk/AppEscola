<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Observers\InvoiceAuditObserver;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * Corrige baixas gravadas antes da correção de fuso: a data sem horário ("2026-11-03") virava meia-noite
 * UTC, que em Brasília é 21h do dia anterior. Leva para 03:00 UTC (início do dia em Brasília).
 * Por padrão só lista; --apply pede confirmação e registra cada mudança na auditoria da cobrança.
 */
class FixMidnightPaidAtCommand extends Command
{
    protected $signature = 'invoices:fix-midnight-paid-at
                            {--tenant= : Filtrar por tenant_id}
                            {--apply : Grava a correção (sem isto, só lista)}
                            {--force : Não pede confirmação (uso não interativo)}';

    protected $description = 'Corrige o "Pago em" gravado à meia-noite UTC (aparecia como 21h do dia anterior)';

    private const REASON = 'Correção de fuso: data do pagamento gravada à meia-noite UTC (21h do dia anterior em Brasília) passou para o dia correto.';

    public function handle(): int
    {
        $query = fn (): Builder => Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereTime('paid_at', '=', '00:00:00')
            ->when($this->option('tenant'), fn ($q, $id) => $q->where('tenant_id', (int) $id));

        $total = $query()->count();
        if ($total === 0) {
            $this->info('Nenhuma cobrança com "Pago em" à meia-noite UTC.');

            return self::SUCCESS;
        }

        $this->table(['Tenant', 'Origem', 'Cobranças'], $query()
            ->selectRaw("tenant_id, CASE WHEN cora_charge_id IS NULL OR cora_charge_id = '' THEN 'baixa manual' ELSE 'Cora' END as origem, COUNT(*) as total")
            ->groupBy('tenant_id', 'origem')
            ->orderBy('tenant_id')
            ->get()
            ->map(fn ($r) => [$r->tenant_id, $r->origem, $r->total])
            ->all());

        $this->table(['Cobrança', 'Gravado (UTC)', 'Aparecia em Brasília', 'Fica'], $query()
            ->orderByDesc('paid_at')
            ->limit(15)
            ->get(['id', 'paid_at'])
            ->map(fn (Invoice $i) => [
                "#{$i->id}",
                $i->paid_at->utc()->format('d/m/Y H:i'),
                $i->paid_at->copy()->setTimezone('America/Sao_Paulo')->format('d/m/Y H:i'),
                $i->paid_at->copy()->addHours(3)->setTimezone('America/Sao_Paulo')->format('d/m/Y H:i'),
            ])
            ->all());

        if (! $this->option('apply')) {
            $this->line("{$total} cobrança(s) seriam corrigidas. Nada foi gravado; rode com --apply para corrigir.");

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("Corrigir {$total} cobrança(s)?", false)) {
            $this->warn('Cancelado. Nada foi gravado.');

            return self::SUCCESS;
        }

        $fixed = 0;
        InvoiceAuditObserver::asSource('system', function () use ($query, &$fixed) {
            $query()->select(['id'])->chunkById(200, function ($chunk) use (&$fixed) {
                foreach ($chunk as $row) {
                    $invoice = Invoice::query()->find($row->id);
                    // Confere de novo: só mexe se continua à meia-noite UTC (rodar duas vezes não soma 6 h).
                    if (! $invoice || $invoice->paid_at?->utc()->format('H:i:s') !== '00:00:00') {
                        continue;
                    }
                    $invoice->update(['paid_at' => $invoice->paid_at->copy()->addHours(3)]);
                    $fixed++;
                }
            });
        }, self::REASON);

        $this->info("{$fixed} cobrança(s) corrigida(s). Cada mudança está na auditoria da cobrança.");

        return self::SUCCESS;
    }
}
