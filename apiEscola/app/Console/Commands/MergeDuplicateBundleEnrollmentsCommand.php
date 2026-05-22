<?php

namespace App\Console\Commands;

use App\Services\MergeDuplicateBundleEnrollmentsService;
use Illuminate\Console\Command;

class MergeDuplicateBundleEnrollmentsCommand extends Command
{
    protected $signature = 'enrollments:merge-duplicate-bundles
                            {--dry-run : Simula a consolidação sem gravar}
                            {--tenant-id= : Limita ao tenant}
                            {--student-id= : Limita ao aluno}
                            {--bundle-id= : Limita ao pacote}';

    protected $description = 'Consolida matrículas duplicadas do mesmo pacote (legado) em uma única matrícula com turmas no pivot';

    public function handle(MergeDuplicateBundleEnrollmentsService $merge): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $tenantId = $this->option('tenant-id') !== null ? (int) $this->option('tenant-id') : null;
        $studentId = $this->option('student-id') !== null ? (int) $this->option('student-id') : null;
        $bundleId = $this->option('bundle-id') !== null ? (int) $this->option('bundle-id') : null;

        if ($dryRun) {
            $this->warn('Modo dry-run: nenhuma alteração será gravada.');
        }

        $result = $merge->run($dryRun, $tenantId, $studentId, $bundleId);

        if ($result['merged_groups'] === 0) {
            $this->info('Nenhum grupo de matrículas duplicadas de pacote encontrado.');

            return self::SUCCESS;
        }

        $this->table(
            ['Grupos', 'Mantidas', 'Removidas', 'Invoices movidas', 'Invoices descartadas'],
            [[
                $result['merged_groups'],
                $result['kept_enrollments'],
                $result['removed_enrollments'],
                $result['invoices_moved'],
                $result['invoices_dropped'],
            ]]
        );

        foreach ($result['details'] as $detail) {
            $this->line(sprintf(
                '  aluno %d | pacote %d | mantida #%s (id %d) | removidas %s | turmas %s',
                $detail['student_id'],
                $detail['bundle_id'],
                $detail['keeper_number'] ?? '-',
                $detail['keeper_id'],
                implode(', ', array_map('strval', $detail['removed_ids'])),
                implode(', ', array_map('strval', $detail['school_class_ids'])),
            ));
        }

        if ($dryRun) {
            $this->newLine();
            $this->comment('Execute sem --dry-run para aplicar as alterações.');
        } else {
            $this->info('Consolidação concluída.');
        }

        return self::SUCCESS;
    }
}
