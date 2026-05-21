<?php

namespace App\Console\Commands;

use App\Models\Enrollment;
use App\Services\EnrollmentContractChargesService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class DebugEnrollmentContractChargesCommand extends Command
{
    protected $signature = 'enrollments:debug-contract-charges
                            {reference : ID ou número da matrícula (ex.: MAT-2-00003 ou 5)}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--invoice-types=monthly : Tipos separados por vírgula (monthly,enrollment_fee)}
                            {--json : Imprime apenas JSON completo (stdout)}
                            {--save= : Grava JSON em arquivo (caminho absoluto ou relativo a storage/logs)}';

    protected $description = 'Diagnóstico da pré-visualização de cobranças do contrato (local + Cora) para uso em produção via SSH';

    public function handle(EnrollmentContractChargesService $contractCharges): int
    {
        $reference = trim((string) $this->argument('reference'));
        $environment = $this->normalizeEnvironment((string) $this->option('environment'));
        $invoiceTypes = $this->parseInvoiceTypes((string) $this->option('invoice-types'));

        $enrollment = $this->resolveEnrollment($reference);

        if (! $enrollment) {
            $this->error("Matrícula não encontrada: {$reference}");

            return self::FAILURE;
        }

        $this->info("Diagnóstico — {$enrollment->enrollment_number} (id {$enrollment->id}), tenant {$enrollment->tenant_id}, Cora [{$environment}]");

        try {
            $preview = $contractCharges->preview($enrollment, $environment, $invoiceTypes, true);
        } catch (\Throwable $e) {
            $this->error('Falha ao montar pré-visualização: ' . $e->getMessage());

            return self::FAILURE;
        }

        $debug = $preview['debug'] ?? null;

        if (! is_array($debug)) {
            $this->error('Bloco debug ausente na pré-visualização. Verifique deploy da API.');

            return self::FAILURE;
        }

        $payload = [
            'preview_summary' => $preview['summary'] ?? [],
            'warnings' => $preview['warnings'] ?? [],
            'to_generate' => $preview['to_generate'] ?? [],
            'provider_boleto_list' => $preview['provider_boleto_list'] ?? [],
            'provider_boleto_school_groups' => $preview['provider_boleto_school_groups'] ?? [],
            'debug' => $debug,
        ];

        $savePath = $this->resolveSavePath((string) $this->option('save'), $enrollment->id);

        if ($savePath !== null) {
            File::ensureDirectoryExists(dirname($savePath));
            File::put($savePath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->info("JSON salvo em: {$savePath}");
        }

        if ($this->option('json')) {
            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->printHumanReport($payload);

        $this->newLine();
        $this->line('Dica: use --json ou --save=contract-charges-debug.json para exportar o relatório completo.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function printHumanReport(array $payload): void
    {
        $debug = $payload['debug'];
        $local = $debug['local'] ?? [];
        $cora = $debug['cora'] ?? [];
        $api = $cora['api'] ?? [];
        $amounts = $local['amounts'] ?? [];
        $summary = $payload['preview_summary'] ?? [];

        $this->newLine();
        $this->info('── Matrícula (local) ──');
        $this->line('  Contrato: ' . ($local['contract_dates']['start_date'] ?? '?')
            . ' → ' . ($local['contract_dates']['end_date'] ?? $local['contract_dates']['computed_end_date'] ?? '?'));
        $this->line('  Dia vencimento: ' . ($local['payment_due_day'] ?? '?'));
        $this->line('  Base: R$ ' . ($amounts['base_monthly_amount'] ?? '?')
            . ' | Desconto: R$ ' . ($amounts['discount_amount'] ?? '?')
            . ' | Líquido: R$ ' . ($amounts['net_monthly_amount'] ?? '?'));
        $this->line('  Cobranças no sistema: ' . ($local['local_invoices_count'] ?? 0));
        $this->line('  Lote já gerado: ' . ($local['charges_generated_at'] ? 'sim (' . $local['charges_generated_at'] . ')' : 'não'));

        $payer = $local['payer_documents_masked'] ?? [];
        $this->line('  CPF aluno (mascarado): ' . ($payer['student_document_masked'] ?? '(vazio)'));
        foreach ($payer['guardians'] ?? [] as $guardian) {
            $this->line('  CPF responsável #' . ($guardian['id'] ?? '?') . ': ' . ($guardian['document_masked'] ?? '(vazio)'));
        }

        $planned = $local['to_generate_planned'] ?? [];
        if ($planned !== []) {
            $this->newLine();
            $this->info('── Parcelas planejadas (gerar local) ──');
            $this->table(
                ['Chave', 'Vencimento', 'Valor', 'Existe?', 'Cora na data?'],
                array_map(static fn (array $row) => [
                    $row['key'] ?? '—',
                    $row['due_date'] ?? '—',
                    'R$ ' . ($row['amount'] ?? '—'),
                    ! empty($row['already_exists']) ? 'sim' : 'não',
                    ! empty($row['provider_has_boleto']) ? 'sim' : 'não',
                ], $planned)
            );
        }

        $warnings = $payload['warnings'] ?? [];
        if ($warnings !== []) {
            $this->newLine();
            $this->warn('Avisos:');
            foreach ($warnings as $warning) {
                $this->line('  • ' . $warning);
            }
        }

        $this->newLine();
        $this->info('── Cora (API listagem) ──');

        if (! empty($cora['fetch_error'])) {
            $this->error('  Erro: ' . $cora['fetch_error']);
        }

        $this->line('  Itens na listagem: ' . ($api['listed_count'] ?? '?'));
        $this->line('  Boletos: ' . ($api['boleto_count'] ?? '?'));
        $this->line('  Com CPF na listagem: ' . ($api['with_customer_document_in_list'] ?? '?')
            . ' | Sem CPF: ' . ($api['without_customer_document_in_list'] ?? '?'));
        $this->line('  Vinculados à matrícula: ' . ($summary['external_for_enrollment'] ?? $cora['summary']['external_for_enrollment'] ?? '?'));
        $this->line('  Mesmo CPF pagador: ' . ($summary['external_matches_payer'] ?? $cora['summary']['external_matches_payer'] ?? '?'));
        $this->line('  Lista sync (provider_boleto_list): ' . ($summary['external_boleto_school_groups'] ?? 0) . ' grupos escola, '
            . count($payload['provider_boleto_list'] ?? []) . ' linha(s) desta matrícula');

        if (! empty($api['payment_method_counts'])) {
            $this->line('  Métodos: ' . json_encode($api['payment_method_counts'], JSON_UNESCAPED_UNICODE));
        }

        if (! empty($api['status_counts'])) {
            $this->line('  Status: ' . json_encode($api['status_counts'], JSON_UNESCAPED_UNICODE));
        }

        if (! empty($api['first_invoice_top_level_keys'])) {
            $this->line('  Chaves 1º item: ' . implode(', ', $api['first_invoice_top_level_keys']));
        }

        $diagnosis = $cora['boleto_diagnosis'] ?? [];
        if ($diagnosis !== []) {
            $this->newLine();
            $this->info('── Boletos Cora (amostra até 30) ──');
            $this->table(
                ['charge_id', 'Venc.', 'Valor', 'Matrícula?', 'CPF?', 'link_reason'],
                array_map(static fn (array $row) => [
                    $row['charge_id'] ?? '—',
                    $row['due_date'] ?? '—',
                    'R$ ' . ($row['amount'] ?? '—'),
                    ! empty($row['for_this_enrollment']) ? 'sim' : 'não',
                    ! empty($row['matches_payer']) ? 'sim' : 'não',
                    $row['link_reason'] ?? '—',
                ], $diagnosis)
            );

            $reasonCounts = [];
            foreach ($diagnosis as $row) {
                $reason = (string) ($row['link_reason'] ?? 'unknown');
                $reasonCounts[$reason] = ($reasonCounts[$reason] ?? 0) + 1;
            }
            $this->line('  Motivos (amostra): ' . json_encode($reasonCounts, JSON_UNESCAPED_UNICODE));
        }

        $schoolGroups = $payload['provider_boleto_school_groups'] ?? [];
        if ($schoolGroups !== []) {
            $this->newLine();
            $this->info('── Outros na escola (agrupados) ──');
            $this->table(
                ['Vencimento', 'Valor', 'Qtd', 'Status'],
                array_map(static fn (array $g) => [
                    $g['due_date'] ?? '—',
                    'R$ ' . ($g['amount'] ?? '—'),
                    $g['count'] ?? 1,
                    $g['status'] ?? '—',
                ], $schoolGroups)
            );
        }

        $hydrate = $cora['hydrate_samples'] ?? [];
        if ($hydrate !== []) {
            $this->newLine();
            $this->info('── Hidratação (listagem vs GET por ID) ──');
            $this->table(
                ['charge_id', 'CPF listagem', 'CPF detalhe', 'Matr. list.', 'Matr. detalhe', 'Motivo detalhe'],
                array_map(static function (array $sample) {
                    $list = $sample['list'] ?? [];
                    $detail = $sample['detail'] ?? [];

                    return [
                        $sample['charge_id'] ?? '—',
                        $list['customer_document_masked'] ?? '—',
                        $detail['customer_document_masked'] ?? ($sample['detail_fetch_error'] ?? '—'),
                        ! empty($list['for_this_enrollment']) ? 'sim' : 'não',
                        ! empty($detail['for_this_enrollment']) ? 'sim' : 'não',
                        $detail['link_reason'] ?? '—',
                    ];
                }, $hydrate)
            );
        } elseif (($api['without_customer_document_in_list'] ?? 0) > 0) {
            $this->newLine();
            $this->warn('  Nenhuma amostra de hidratação (todos os boletos da amostra já tinham CPF na listagem, ou não há boleto).');
        }
    }

    private function normalizeEnvironment(string $environment): string
    {
        $environment = strtolower(trim($environment));

        return $environment === 'production' ? 'prod' : $environment;
    }

    /**
     * @return array<int, string>
     */
    private function parseInvoiceTypes(string $raw): array
    {
        $types = array_values(array_filter(array_map(
            static fn ($part) => strtolower(trim((string) $part)),
            explode(',', $raw)
        )));

        return $types === [] ? ['monthly'] : $types;
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

    private function resolveSavePath(string $option, int $enrollmentId): ?string
    {
        $option = trim($option);
        if ($option === '') {
            return null;
        }

        if (str_starts_with($option, '/')) {
            return $option;
        }

        $filename = $option;
        if (! str_ends_with(strtolower($filename), '.json')) {
            $filename .= '.json';
        }

        if (! str_contains($filename, DIRECTORY_SEPARATOR)) {
            $filename = 'contract-charges-debug-' . $enrollmentId . '-' . now()->format('Ymd-His') . '-' . $filename;
        }

        return storage_path('logs/' . ltrim($filename, '/'));
    }
}
