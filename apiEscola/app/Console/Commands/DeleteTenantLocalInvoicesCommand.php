<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\InvoiceLifecycleService;
use Illuminate\Console\Command;
use RuntimeException;
use Throwable;

class DeleteTenantLocalInvoicesCommand extends Command
{
    protected $signature = 'invoices:delete-local
                            {tenant=2 : ID do tenant}
                            {--dry-run : Lista o que seria excluído, sem gravar}
                            {--force : Executa sem confirmação interativa}';

    protected $description = 'Exclui (soft delete) cobranças criadas apenas no sistema de um tenant — sem importação Cora e sem boleto/PIX gerado';

    public function handle(InvoiceLifecycleService $lifecycle): int
    {
        $tenantId = (int) $this->argument('tenant');
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        $tenant = Tenant::query()->find($tenantId);

        if (! $tenant) {
            $this->error("Tenant {$tenantId} não encontrado.");

            return self::FAILURE;
        }

        $this->info('Tenant: ' . $tenant->id . ($tenant->name ? " — {$tenant->name}" : ''));

        $candidates = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->orderBy('id')
            ->get();

        if ($candidates->isEmpty()) {
            $this->warn('Nenhuma cobrança ativa encontrada para este tenant.');

            return self::SUCCESS;
        }

        $toDelete = [];
        $skipped = [];

        foreach ($candidates as $invoice) {
            $permissions = $lifecycle->permissions($invoice);

            if ($permissions['can_delete']) {
                $toDelete[] = [
                    'id' => $invoice->id,
                    'status' => $invoice->status,
                    'description' => $invoice->description,
                    'due_date' => $invoice->due_date?->toDateString() ?? '—',
                    'amount' => number_format((float) $invoice->amount, 2, ',', '.'),
                    'enrollment_id' => $invoice->enrollment_id ?? '—',
                ];

                continue;
            }

            $skipped[] = [
                'id' => $invoice->id,
                'status' => $invoice->status,
                'description' => mb_substr((string) $invoice->description, 0, 40),
                'reason' => $permissions['delete_block_reason']
                    ?? ($permissions['is_local_invoice'] ? '—' : 'Não é cobrança local'),
            ];
        }

        $this->newLine();
        $this->info('Cobranças locais elegíveis para exclusão: ' . count($toDelete));

        if ($toDelete !== []) {
            $this->table(
                ['ID', 'Status', 'Vencimento', 'Valor', 'Matrícula', 'Descrição'],
                array_map(fn (array $row) => [
                    $row['id'],
                    $row['status'],
                    $row['due_date'],
                    $row['amount'],
                    $row['enrollment_id'],
                    mb_substr($row['description'], 0, 50),
                ], $toDelete)
            );
        }

        if ($skipped !== []) {
            $this->newLine();
            $this->warn('Ignoradas (' . count($skipped) . ') — não atendem critério de cobrança local excluível:');
            $this->table(
                ['ID', 'Status', 'Descrição', 'Motivo'],
                $skipped
            );
        }

        if ($toDelete === []) {
            $this->warn('Nada a excluir.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->warn('Modo dry-run: nenhuma cobrança foi excluída.');

            return self::SUCCESS;
        }

        if (! $force && ! $this->confirm(
            'Confirma exclusão de ' . count($toDelete) . " cobrança(s) locais do tenant {$tenantId}?",
            false
        )) {
            $this->line('Operação cancelada.');

            return self::SUCCESS;
        }

        $deleted = 0;
        $deletedIds = [];
        $failed = [];

        foreach ($toDelete as $row) {
            $invoiceId = (int) $row['id'];

            try {
                $invoice = Invoice::query()->find($invoiceId);

                if (! $invoice) {
                    $failed[] = [
                        'id' => $invoiceId,
                        'reason' => 'Cobrança não encontrada (já excluída ou inexistente).',
                    ];

                    continue;
                }

                $lifecycle->assertCanDelete($invoice);
                $invoice->delete();

                $deleted++;
                $deletedIds[] = $invoiceId;
            } catch (Throwable $e) {
                $failed[] = [
                    'id' => $invoiceId,
                    'reason' => $this->formatFailureReason($e),
                ];
            }
        }

        $this->printExecutionSummary($deleted, $deletedIds, $failed);

        if ($failed !== [] && $deleted === 0) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, int>  $deletedIds
     * @param  array<int, array{id: int, reason: string}>  $failed
     */
    private function printExecutionSummary(int $deleted, array $deletedIds, array $failed): void
    {
        if ($deletedIds !== []) {
            $this->newLine();
            $this->info("Excluídas com sucesso ({$deleted}): " . implode(', ', $deletedIds));
        }

        if ($failed !== []) {
            $this->newLine();
            $this->warn('Falhas na exclusão (' . count($failed) . '):');
            $this->table(['ID', 'Motivo'], $failed);
        }

        if ($deleted > 0 && $failed === []) {
            $this->info("Todas as {$deleted} cobrança(s) elegíveis foram excluídas (soft delete).");

            return;
        }

        if ($deleted > 0 && $failed !== []) {
            $this->warn(
                'Exclusão parcial: ' . count($failed) . ' cobrança(s) falharam (permissão alterada, FK ou erro de banco). '
                . 'As listadas acima como excluídas foram removidas com sucesso.'
            );

            return;
        }

        if ($failed !== []) {
            $this->error('Nenhuma cobrança foi excluída.');
        }
    }

    private function formatFailureReason(Throwable $e): string
    {
        $message = trim($e->getMessage());

        if ($message === '') {
            $message = 'Erro desconhecido.';
        }

        if ($e instanceof RuntimeException) {
            return $message;
        }

        if ($this->output->isVerbose()) {
            return $message . ' [' . $e::class . ']';
        }

        return 'Erro ao excluir: ' . $message;
    }
}
