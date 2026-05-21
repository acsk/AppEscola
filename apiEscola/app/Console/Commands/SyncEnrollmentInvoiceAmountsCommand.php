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
                            {--dry-run : Exibe alterações sem gravar}
                            {--fix-base-from-plan : Corrige monthly_amount para o equivalente mensal do plano}';

    protected $description = 'Recalcula valores de cobranças pendentes/vencidas conforme mensalidade e desconto da matrícula';

    public function handle(EnrollmentInvoiceAmountSyncService $sync): int
    {
        $reference = trim((string) $this->argument('reference'));
        $dryRun = (bool) $this->option('dry-run');
        $fixBase = (bool) $this->option('fix-base-from-plan');

        $enrollment = $this->resolveEnrollment($reference);

        if (! $enrollment) {
            $this->error("Matrícula não encontrada: {$reference}");

            return self::FAILURE;
        }

        $enrollment->load('coursePlan');
        $plan = $enrollment->coursePlan;

        if ($fixBase) {
            if (! $plan) {
                $this->error('Esta matrícula não possui plano (course_plan_id). Não é possível corrigir a base pelo plano.');

                return self::FAILURE;
            }

            $planBase = round($plan->monthlyEquivalent(), 2);
            $storedBase = $enrollment->monthly_amount !== null
                ? round((float) $enrollment->monthly_amount, 2)
                : null;

            if ($storedBase === null || abs($storedBase - $planBase) >= 0.01) {
                $this->warn(sprintf(
                    'monthly_amount na matrícula: R$ %s → plano: R$ %s',
                    $storedBase !== null ? number_format($storedBase, 2, ',', '.') : '(vazio)',
                    number_format($planBase, 2, ',', '.')
                ));

                if ($dryRun) {
                    $this->line('  (dry-run) A base seria atualizada para o valor do plano.');
                } else {
                    $enrollment->update(['monthly_amount' => $planBase]);
                    $enrollment->refresh();
                    $this->info('  monthly_amount corrigido conforme o plano.');
                }
            } else {
                $this->info('  monthly_amount já coincide com o plano.');
            }
        } elseif ($plan && $enrollment->monthly_amount !== null) {
            $planBase = round($plan->monthlyEquivalent(), 2);
            $storedBase = round((float) $enrollment->monthly_amount, 2);

            if (abs($storedBase - $planBase) >= 0.01) {
                $this->warn(sprintf(
                    'Atenção: monthly_amount (R$ %s) difere do plano (R$ %s). Use --fix-base-from-plan para corrigir.',
                    number_format($storedBase, 2, ',', '.'),
                    number_format($planBase, 2, ',', '.')
                ));
            }
        }

        $this->info("Matrícula: {$enrollment->enrollment_number} (id {$enrollment->id})");

        if ($plan) {
            $this->line('  Plano: ' . $plan->name . ' — equivalente mensal do plano: R$ ' . number_format($plan->monthlyEquivalent(), 2, ',', '.'));
        }

        $this->line('  Mensalidade (base na matrícula): R$ ' . number_format($enrollment->baseMonthlyAmount(), 2, ',', '.'));
        $this->line('  Desconto: R$ ' . number_format((float) ($enrollment->discount_amount ?? 0), 2, ',', '.'));
        $this->line('  Mensalidade líquida (cobranças): R$ ' . number_format($enrollment->netMonthlyAmount(), 2, ',', '.'));

        if ($plan && $plan->enrollment_fee_amount !== null) {
            $netFee = max((float) $plan->enrollment_fee_amount - (float) ($enrollment->discount_amount ?? 0), 0);
            $this->line('  Taxa de matrícula líquida: R$ ' . number_format($netFee, 2, ',', '.'));
        }

        $allInvoices = Invoice::query()
            ->where('enrollment_id', $enrollment->id)
            ->whereIn('type', ['monthly', 'enrollment_fee'])
            ->orderBy('due_date')
            ->get();

        if ($allInvoices->isEmpty()) {
            $this->warn('Nenhuma cobrança (mensalidade/taxa) cadastrada para esta matrícula.');
            $this->line('  Ao gerar o lote, o valor será: R$ ' . number_format($enrollment->netMonthlyAmount(), 2, ',', '.'));

            return self::SUCCESS;
        }

        $this->newLine();
        $this->info('Cobranças existentes:');
        $this->table(
            ['ID', 'Tipo', 'Vencimento', 'Status', 'Valor'],
            $allInvoices->map(fn (Invoice $inv) => [
                $inv->id,
                $inv->type,
                $inv->due_date?->toDateString() ?? '—',
                $inv->status,
                'R$ ' . number_format((float) $inv->amount, 2, ',', '.'),
            ])->all()
        );

        $pending = $allInvoices->filter(
            fn (Invoice $inv) => in_array($inv->status, ['pending', 'overdue'], true)
        );

        if ($pending->isEmpty()) {
            $this->warn('Nenhuma cobrança pendente ou vencida para ajustar (pagas/canceladas não são alteradas).');

            return self::SUCCESS;
        }

        $targets = $this->buildTargets($enrollment, $pending);

        if ($targets === []) {
            $this->info('Todas as cobranças pendentes/vencidas já estão com o valor líquido atual (R$ '
                . number_format($enrollment->netMonthlyAmount(), 2, ',', '.') . ').');

            return self::SUCCESS;
        }

        $this->newLine();
        $this->info('Ajustes necessários nas cobranças pendentes/vencidas:');
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
