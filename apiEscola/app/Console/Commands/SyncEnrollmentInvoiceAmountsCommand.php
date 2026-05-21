<?php

namespace App\Console\Commands;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Services\EnrollmentInvoiceAmountSyncService;
use Illuminate\Console\Command;

class SyncEnrollmentInvoiceAmountsCommand extends Command
{
    protected $signature = 'enrollments:sync-invoice-amounts
                            {reference : ID ou número da matrícula (ex.: MAT-2-00003)}
                            {--dry-run : Exibe alterações sem gravar}';

    protected $description = 'Recalcula valores de cobranças pendentes/vencidas conforme mensalidade e desconto da matrícula';

    public function handle(EnrollmentInvoiceAmountSyncService $sync): int
    {
        $reference = trim((string) $this->argument('reference'));
        $dryRun = (bool) $this->option('dry-run');

        $enrollment = $this->resolveEnrollment($reference);

        if (! $enrollment) {
            $this->error("Matrícula não encontrada: {$reference}");

            return self::FAILURE;
        }

        $enrollment->load('coursePlan');

        $this->info("Matrícula: {$enrollment->enrollment_number} (id {$enrollment->id})");
        $this->line('  Mensalidade (base): R$ ' . number_format($enrollment->baseMonthlyAmount(), 2, ',', '.'));
        $this->line('  Desconto: R$ ' . number_format((float) ($enrollment->discount_amount ?? 0), 2, ',', '.'));
        $this->line('  Mensalidade líquida: R$ ' . number_format($enrollment->netMonthlyAmount(), 2, ',', '.'));

        $plan = $enrollment->coursePlan;
        if ($plan && $plan->enrollment_fee_amount !== null) {
            $netFee = max((float) $plan->enrollment_fee_amount - (float) ($enrollment->discount_amount ?? 0), 0);
            $this->line('  Taxa de matrícula líquida: R$ ' . number_format($netFee, 2, ',', '.'));
        }

        $pending = Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->whereIn('type', ['monthly', 'enrollment_fee'])
            ->whereIn('status', ['pending', 'overdue'])
            ->orderBy('due_date')
            ->get();

        if ($pending->isEmpty()) {
            $this->warn('Nenhuma cobrança pendente ou vencida para ajustar.');

            return self::SUCCESS;
        }

        $targets = $this->buildTargets($enrollment, $pending);

        if ($targets === []) {
            $this->info('Todas as cobranças pendentes/vencidas já estão com o valor correto.');

            return self::SUCCESS;
        }

        $this->newLine();
        $this->table(
            ['Invoice', 'Tipo', 'Vencimento', 'Status', 'Atual', 'Novo'],
            array_map(fn (array $row) => [
                $row['id'],
                $row['type'],
                $row['due_date'],
                $row['status'],
                'R$ ' . number_format($row['current'], 2, ',', '.'),
                'R$ ' . number_format($row['target'], 2, ',', '.'),
            ], $targets)
        );

        if ($dryRun) {
            $this->warn('Modo dry-run: nenhuma alteração foi gravada.');

            return self::SUCCESS;
        }

        $updated = $sync->syncPendingInvoices($enrollment);

        $this->info("Atualizada(s) {$updated} cobrança(s).");

        return self::SUCCESS;
    }

    private function resolveEnrollment(string $reference): ?Enrollment
    {
        if (ctype_digit($reference)) {
            return Enrollment::query()->find((int) $reference);
        }

        return Enrollment::query()
            ->where('enrollment_number', $reference)
            ->first();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Invoice>  $invoices
     * @return array<int, array{id: int, type: string, due_date: string, status: string, current: float, target: float}>
     */
    private function buildTargets(Enrollment $enrollment, $invoices): array
    {
        $netMonthly = $enrollment->netMonthlyAmount();
        $plan = $enrollment->coursePlan;
        $netFee = null;

        if ($plan && $plan->enrollment_fee_amount !== null) {
            $netFee = max((float) $plan->enrollment_fee_amount - (float) ($enrollment->discount_amount ?? 0), 0);
        }

        $targets = [];

        foreach ($invoices as $invoice) {
            $target = match ($invoice->type) {
                'monthly' => $netMonthly,
                'enrollment_fee' => $netFee,
                default => null,
            };

            if ($target === null) {
                continue;
            }

            $current = (float) $invoice->amount;

            if (abs($current - $target) < 0.001) {
                continue;
            }

            $targets[] = [
                'id' => $invoice->id,
                'type' => $invoice->type,
                'due_date' => $invoice->due_date?->toDateString() ?? '—',
                'status' => $invoice->status,
                'current' => $current,
                'target' => $target,
            ];
        }

        return $targets;
    }
}
