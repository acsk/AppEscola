<?php

namespace App\Console\Commands;

use App\Models\Enrollment;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\Student;
use App\Services\CoraEnrollmentInvoiceSyncService;
use App\Services\PaymentGatewayFactory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class DebugPayerCpfCommand extends Command
{
    protected $signature = 'debug:payer-cpf
                            {reference : CPF (só dígitos), guardian_id, enrollment_number (ex.: MAT-2-00003) ou enrollment_id}
                            {--tenant= : Filtrar por tenant_id}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--cora : Consultar e diagnosticar boletos na API Cora}
                            {--json : Saída apenas JSON}
                            {--save= : Grava JSON em storage/logs (nome do arquivo)}';

    protected $description = 'Diagnóstico de CPF do pagador (guardian/aluno) vs cobranças locais e Cora';

    public function handle(
        CoraEnrollmentInvoiceSyncService $coraSync,
        PaymentGatewayFactory $gatewayFactory,
    ): int {
        $reference = trim((string) $this->argument('reference'));
        $tenantFilter = $this->option('tenant') !== null && $this->option('tenant') !== ''
            ? (int) $this->option('tenant')
            : null;
        $environment = $this->normalizeEnvironment((string) $this->option('environment'));

        $context = $this->resolveReference($reference, $tenantFilter);
        if ($context === null) {
            $this->error("Referência não encontrada: {$reference}");

            return self::FAILURE;
        }

        $cpfDigits = $context['cpf_digits'];
        $guardians = $this->findGuardiansByDocumentDigits($cpfDigits, $tenantFilter);
        $enrollments = $this->resolveEnrollments($context, $guardians, $tenantFilter);
        $students = $this->collectStudents($guardians, $enrollments, $cpfDigits, $tenantFilter);

        $payload = [
            'generated_at' => now()->toIso8601String(),
            'reference_input' => $reference,
            'cpf_digits' => $cpfDigits,
            'cpf_formatted' => $this->formatCpf($cpfDigits),
            'tenant_filter' => $tenantFilter,
            'context' => $context,
            'guardians' => $guardians,
            'students' => $students,
            'enrollments' => $enrollments,
            'cpf_analysis' => $this->buildCpfAnalysis($cpfDigits, $guardians, $students, $enrollments),
            'invoices' => $this->buildInvoicesReport($enrollments, $cpfDigits),
        ];

        if ($this->option('cora') && $enrollments !== []) {
            $payload['cora'] = $this->buildCoraReport($coraSync, $gatewayFactory, $enrollments[0], $environment, $cpfDigits);
        }

        $savePath = $this->resolveSavePath((string) $this->option('save'), $cpfDigits);
        if ($savePath !== null) {
            File::ensureDirectoryExists(dirname($savePath));
            File::put($savePath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            if (! $this->option('json')) {
                $this->info("JSON salvo em: {$savePath}");
            }
        }

        if ($this->option('json')) {
            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->printHumanReport($payload);

        $this->newLine();
        $this->line('Dica: use --cora para cruzar com a API Cora; --json ou --save=payer-cpf-debug.json para exportar.');

        return self::SUCCESS;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function resolveReference(string $reference, ?int $tenantFilter): ?array
    {
        if (preg_match('/^MAT-\d+-\d+$/i', $reference)) {
            $enrollment = Enrollment::query()
                ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                ->where('enrollment_number', strtoupper($reference))
                ->first();

            if (! $enrollment) {
                return null;
            }

            $enrollment->loadMissing(['student.guardians']);

            return [
                'kind' => 'enrollment_number',
                'enrollment_id' => $enrollment->id,
                'enrollment_number' => $enrollment->enrollment_number,
                'tenant_id' => $enrollment->tenant_id,
                'student_id' => $enrollment->student_id,
                'cpf_digits' => $this->resolvePrimaryCpfFromEnrollment($enrollment),
            ];
        }

        if (ctype_digit($reference)) {
            $numeric = (int) $reference;

            $guardian = Guardian::query()
                ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                ->find($numeric);

            if ($guardian) {
                return [
                    'kind' => 'guardian_id',
                    'guardian_id' => $guardian->id,
                    'tenant_id' => $guardian->tenant_id,
                    'cpf_digits' => $this->digitsOnly((string) $guardian->document),
                ];
            }

            $enrollment = Enrollment::query()
                ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                ->find($numeric);

            if ($enrollment) {
                $enrollment->loadMissing(['student.guardians']);

                return [
                    'kind' => 'enrollment_id',
                    'enrollment_id' => $enrollment->id,
                    'enrollment_number' => $enrollment->enrollment_number,
                    'tenant_id' => $enrollment->tenant_id,
                    'student_id' => $enrollment->student_id,
                    'cpf_digits' => $this->resolvePrimaryCpfFromEnrollment($enrollment),
                ];
            }

            if (strlen($reference) === 11) {
                return [
                    'kind' => 'cpf',
                    'cpf_digits' => $reference,
                ];
            }
        }

        $cpfDigits = $this->digitsOnly($reference);
        if (strlen($cpfDigits) === 11) {
            return [
                'kind' => 'cpf',
                'cpf_digits' => $cpfDigits,
            ];
        }

        return null;
    }

    private function resolvePrimaryCpfFromEnrollment(Enrollment $enrollment): string
    {
        $financial = $enrollment->student?->guardians
            ?->first(fn ($g) => (bool) data_get($g, 'pivot.is_financial_responsible', false));

        if ($financial && $this->digitsOnly((string) $financial->document) !== '') {
            return $this->digitsOnly((string) $financial->document);
        }

        return $this->digitsOnly((string) ($enrollment->student?->document ?? ''));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function findGuardiansByDocumentDigits(string $cpfDigits, ?int $tenantFilter): array
    {
        if ($cpfDigits === '') {
            return [];
        }

        $rows = Guardian::query()
            ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
            ->whereNotNull('document')
            ->where('document', '!=', '')
            ->whereRaw(
                "REPLACE(REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), ' ', ''), '/', '') = ?",
                [$cpfDigits]
            )
            ->withCount('students')
            ->orderBy('id')
            ->get();

        return $rows->map(fn (Guardian $g) => [
            'id' => $g->id,
            'tenant_id' => $g->tenant_id,
            'name' => $g->name,
            'document_raw' => $g->document,
            'document_digits' => $this->digitsOnly((string) $g->document),
            'document_formatted' => $this->formatCpf($this->digitsOnly((string) $g->document)),
            'email' => $g->email,
            'phone' => $g->phone,
            'relationship' => $g->relationship,
            'students_count' => $g->students_count,
            'deleted_at' => $g->deleted_at?->toISOString(),
        ])->values()->all();
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  list<array<string, mixed>>  $guardians
     * @return list<array<string, mixed>>
     */
    private function resolveEnrollments(array $context, array $guardians, ?int $tenantFilter): array
    {
        $ids = [];

        if (! empty($context['enrollment_id'])) {
            $ids[] = (int) $context['enrollment_id'];
        }

        $guardianIds = array_map(static fn (array $g) => (int) $g['id'], $guardians);
        if ($guardianIds !== []) {
            $studentIds = Student::query()
                ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                ->whereHas('guardians', fn ($q) => $q->whereIn('guardians.id', $guardianIds))
                ->pluck('id')
                ->all();

            if ($studentIds !== []) {
                $ids = array_merge(
                    $ids,
                    Enrollment::query()
                        ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                        ->whereIn('student_id', $studentIds)
                        ->pluck('id')
                        ->all()
                );
            }
        }

        if (! empty($context['student_id'])) {
            $ids = array_merge(
                $ids,
                Enrollment::query()
                    ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                    ->where('student_id', (int) $context['student_id'])
                    ->pluck('id')
                    ->all()
            );
        }

        $ids = array_values(array_unique(array_filter($ids)));

        if ($ids === []) {
            return [];
        }

        return Enrollment::query()
            ->whereIn('id', $ids)
            ->with(['student.guardians', 'schoolClass.course'])
            ->orderBy('id')
            ->get()
            ->map(fn (Enrollment $e) => $this->mapEnrollment($e))
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $guardians
     * @param  list<array<string, mixed>>  $enrollments
     * @return list<array<string, mixed>>
     */
    private function collectStudents(array $guardians, array $enrollments, string $cpfDigits, ?int $tenantFilter): array
    {
        $studentIds = [];

        foreach ($enrollments as $row) {
            if (! empty($row['student_id'])) {
                $studentIds[] = (int) $row['student_id'];
            }
        }

        $guardianIds = array_map(static fn (array $g) => (int) $g['id'], $guardians);
        if ($guardianIds !== []) {
            $studentIds = array_merge(
                $studentIds,
                Student::query()
                    ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                    ->whereHas('guardians', fn ($q) => $q->whereIn('guardians.id', $guardianIds))
                    ->pluck('id')
                    ->all()
            );
        }

        if ($cpfDigits !== '') {
            $studentIds = array_merge(
                $studentIds,
                Student::query()
                    ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                    ->whereNotNull('document')
                    ->get()
                    ->filter(fn (Student $s) => $this->digitsOnly((string) $s->document) === $cpfDigits)
                    ->pluck('id')
                    ->all()
            );
        }

        $studentIds = array_values(array_unique($studentIds));
        if ($studentIds === []) {
            return [];
        }

        return Student::query()
            ->whereIn('id', $studentIds)
            ->with(['guardians'])
            ->orderBy('id')
            ->get()
            ->map(function (Student $student) use ($cpfDigits) {
                $studentCpf = $this->digitsOnly((string) ($student->document ?? ''));

                return [
                    'id' => $student->id,
                    'tenant_id' => $student->tenant_id,
                    'name' => $student->name,
                    'enrollment_number' => $student->enrollment_number,
                    'document_raw' => $student->document,
                    'document_digits' => $studentCpf,
                    'document_formatted' => $studentCpf !== '' ? $this->formatCpf($studentCpf) : null,
                    'is_minor' => (bool) $student->is_minor,
                    'cpf_equals_target' => $cpfDigits !== '' && $studentCpf === $cpfDigits,
                    'guardians' => $student->guardians->map(fn ($g) => [
                        'id' => $g->id,
                        'name' => $g->name,
                        'document_digits' => $this->digitsOnly((string) ($g->document ?? '')),
                        'is_financial_responsible' => (bool) data_get($g, 'pivot.is_financial_responsible', false),
                        'cpf_equals_target' => $cpfDigits !== ''
                            && $this->digitsOnly((string) ($g->document ?? '')) === $cpfDigits,
                    ])->values()->all(),
                ];
            })
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapEnrollment(Enrollment $enrollment): array
    {
        $financial = $enrollment->student?->guardians
            ?->first(fn ($g) => (bool) data_get($g, 'pivot.is_financial_responsible', false));

        return [
            'id' => $enrollment->id,
            'tenant_id' => $enrollment->tenant_id,
            'enrollment_number' => $enrollment->enrollment_number,
            'status' => $enrollment->status,
            'student_id' => $enrollment->student_id,
            'student_name' => $enrollment->student?->name,
            'student_document_digits' => $this->digitsOnly((string) ($enrollment->student?->document ?? '')),
            'school_class' => $enrollment->schoolClass?->name,
            'course' => $enrollment->schoolClass?->course?->name,
            'financial_guardian' => $financial ? [
                'id' => $financial->id,
                'name' => $financial->name,
                'document_digits' => $this->digitsOnly((string) ($financial->document ?? '')),
            ] : null,
            'expected_payer_for_cora' => $this->describeExpectedCoraPayer($enrollment),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function describeExpectedCoraPayer(Enrollment $enrollment): array
    {
        $student = $enrollment->student;
        $financial = $student?->guardians
            ?->first(fn ($g) => (bool) data_get($g, 'pivot.is_financial_responsible', false));

        if ($financial) {
            return [
                'source' => 'financial_guardian',
                'guardian_id' => $financial->id,
                'name' => $financial->name,
                'document_digits' => $this->digitsOnly((string) ($financial->document ?? '')),
            ];
        }

        if ($student) {
            return [
                'source' => 'student_as_payer',
                'student_id' => $student->id,
                'name' => $student->name,
                'document_digits' => $this->digitsOnly((string) ($student->document ?? '')),
            ];
        }

        return ['source' => 'unknown', 'document_digits' => ''];
    }

    /**
     * @param  list<array<string, mixed>>  $guardians
     * @param  list<array<string, mixed>>  $students
     * @param  list<array<string, mixed>>  $enrollments
     * @return array<string, mixed>
     */
    private function buildCpfAnalysis(string $targetCpf, array $guardians, array $students, array $enrollments): array
    {
        $documents = [];
        $notes = [];

        if ($targetCpf !== '') {
            $documents['target'] = $targetCpf;
        }

        foreach ($guardians as $g) {
            $documents['guardian_' . $g['id']] = $g['document_digits'];
        }

        foreach ($students as $s) {
            if (($s['document_digits'] ?? '') !== '') {
                $documents['student_' . $s['id']] = $s['document_digits'];
            }
        }

        foreach ($enrollments as $e) {
            $expected = $e['expected_payer_for_cora']['document_digits'] ?? '';
            if ($expected !== '') {
                $documents['enrollment_' . $e['id'] . '_expected_payer'] = $expected;
            }
            $studentDoc = $e['student_document_digits'] ?? '';
            if ($studentDoc !== '') {
                $documents['enrollment_' . $e['id'] . '_student'] = $studentDoc;
            }
        }

        $unique = array_values(array_unique(array_filter($documents)));

        if (count($guardians) > 1) {
            $notes[] = 'Mais de um cadastro de responsável com o mesmo CPF no escopo consultado.';
        }

        if ($targetCpf !== '' && count($unique) === 1 && $unique[0] === $targetCpf) {
            $notes[] = 'Todos os documentos relevantes batem com o CPF alvo (comportamento esperado para boleto no nome do responsável financeiro).';
        } elseif (count($unique) > 1) {
            $notes[] = 'Há documentos diferentes entre aluno, responsável e pagador esperado — revisar vínculos.';
        }

        $studentSharesCpf = array_filter($students, static fn (array $s) => ! empty($s['cpf_equals_target']));
        if ($studentSharesCpf !== []) {
            $notes[] = 'O CPF do alvo também está no cadastro do aluno (pode ser intencional ou duplicidade aluno=responsável).';
        }

        return [
            'target_cpf_digits' => $targetCpf,
            'target_cpf_formatted' => $this->formatCpf($targetCpf),
            'guardian_records_with_same_cpf' => count($guardians),
            'unique_documents_found' => $unique,
            'all_documents_match_target' => $targetCpf !== ''
                && $unique !== []
                && count($unique) === 1
                && $unique[0] === $targetCpf,
            'notes' => $notes,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $enrollments
     * @return list<array<string, mixed>>
     */
    private function buildInvoicesReport(array $enrollments, string $targetCpf): array
    {
        $enrollmentIds = array_map(static fn (array $e) => (int) $e['id'], $enrollments);
        if ($enrollmentIds === []) {
            return [];
        }

        return Invoice::query()
            ->whereIn('enrollment_id', $enrollmentIds)
            ->with(['guardian', 'student.guardians'])
            ->orderBy('due_date')
            ->get()
            ->map(function (Invoice $invoice) use ($targetCpf) {
                $expected = $this->expectedPayerForInvoice($invoice);
                $coraCustomer = $this->extractCoraCustomerDocument($invoice);

                return [
                    'id' => $invoice->id,
                    'enrollment_id' => $invoice->enrollment_id,
                    'type' => $invoice->type,
                    'description' => $invoice->description,
                    'amount' => $invoice->amount,
                    'due_date' => $invoice->due_date?->toDateString(),
                    'status' => $invoice->status,
                    'guardian_id' => $invoice->guardian_id,
                    'cora_charge_id' => $invoice->cora_charge_id,
                    'cora_status' => $invoice->cora_status,
                    'expected_payer' => $expected,
                    'cora_customer_document_digits' => $coraCustomer,
                    'cora_customer_document_formatted' => $coraCustomer !== '' ? $this->formatCpf($coraCustomer) : null,
                    'expected_matches_cora' => $expected['document_digits'] !== ''
                        && $coraCustomer !== ''
                        && $expected['document_digits'] === $coraCustomer,
                    'target_cpf_matches_expected' => $targetCpf !== ''
                        && $expected['document_digits'] === $targetCpf,
                    'target_cpf_matches_cora' => $targetCpf !== ''
                        && $coraCustomer === $targetCpf,
                ];
            })
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function expectedPayerForInvoice(Invoice $invoice): array
    {
        if ($invoice->guardian) {
            return [
                'source' => 'invoice.guardian_id',
                'guardian_id' => $invoice->guardian->id,
                'name' => $invoice->guardian->name,
                'document_digits' => $this->digitsOnly((string) ($invoice->guardian->document ?? '')),
            ];
        }

        $financial = $invoice->student?->guardians
            ?->first(fn ($g) => (bool) data_get($g, 'pivot.is_financial_responsible', false));

        if ($financial) {
            return [
                'source' => 'student.financial_guardian',
                'guardian_id' => $financial->id,
                'name' => $financial->name,
                'document_digits' => $this->digitsOnly((string) ($financial->document ?? '')),
            ];
        }

        return [
            'source' => 'student',
            'student_id' => $invoice->student_id,
            'name' => $invoice->student?->name,
            'document_digits' => $this->digitsOnly((string) ($invoice->student?->document ?? '')),
        ];
    }

    private function extractCoraCustomerDocument(Invoice $invoice): string
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $candidates = [
            data_get($payload, 'customer.document.identity'),
            data_get($payload, 'customer.document.number'),
            data_get($payload, 'customer.document'),
            data_get($payload, 'customer.tax_document'),
            data_get($payload, 'customer.identity'),
            $payload['customer_document'] ?? null,
            $payload['customer_cpf'] ?? null,
        ];

        foreach ($candidates as $value) {
            $digits = $this->digitsOnly((string) $value);
            if ($digits !== '') {
                return $digits;
            }
        }

        return '';
    }

    /**
     * @param  array<string, mixed>  $enrollmentRow
     * @return array<string, mixed>
     */
    private function buildCoraReport(
        CoraEnrollmentInvoiceSyncService $coraSync,
        PaymentGatewayFactory $gatewayFactory,
        array $enrollmentRow,
        string $environment,
        string $targetCpf,
    ): array {
        $enrollment = Enrollment::query()
            ->with(['tenant', 'student.guardians', 'invoices'])
            ->find((int) $enrollmentRow['id']);

        if (! $enrollment) {
            return ['error' => 'Matrícula não encontrada para consulta Cora.'];
        }

        $report = [
            'environment' => $environment,
            'payer_documents_masked' => $coraSync->maskedPayerDocumentsForEnrollment($enrollment),
        ];

        try {
            $preview = $coraSync->previewExternalBoletoCharges($enrollment, $environment);
            $report['external_preview_summary'] = [
                'external_total' => $preview['external_total'] ?? null,
                'external_boleto_total' => $preview['external_boleto_total'] ?? null,
                'external_for_enrollment' => $preview['external_for_enrollment'] ?? null,
                'external_matches_payer' => $preview['external_matches_payer'] ?? null,
                'fetch_error' => $preview['fetch_error'] ?? null,
            ];
            $report['provider_boleto_list'] = array_values(array_filter(
                $preview['provider_boleto_list'] ?? [],
                static fn (array $row) => stripos((string) ($row['description'] ?? ''), 'parcela 9') !== false
                    || ($targetCpf !== '' && ! empty($row['matches_payer']))
                    || ! empty($row['for_this_enrollment'])
            ));
            $report['boleto_diagnosis_sample'] = $coraSync->diagnoseAllBoletoInvoices($enrollment, $environment, 40);
            $report['list_debug_snapshot'] = $coraSync->buildListInvoicesDebugSnapshot($enrollment, $environment);
        } catch (\Throwable $e) {
            $report['fetch_error'] = $e->getMessage();
        }

        $parcelaInvoice = $enrollment->invoices
            ->first(fn (Invoice $inv) => stripos((string) $inv->description, 'parcela 9') !== false
                && $inv->cora_charge_id);

        if ($parcelaInvoice && $parcelaInvoice->cora_charge_id && $enrollment->tenant) {
            try {
                $external = $gatewayFactory->resolve('cora')->getInvoiceById(
                    $enrollment->tenant,
                    (string) $parcelaInvoice->cora_charge_id,
                    $environment
                );
                $report['parcela_9_detail'] = $coraSync->diagnoseInvoiceForEnrollment($enrollment, $external);
                $report['parcela_9_local_invoice_id'] = $parcelaInvoice->id;
            } catch (\Throwable $e) {
                $report['parcela_9_detail_error'] = $e->getMessage();
            }
        }

        return $report;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function printHumanReport(array $payload): void
    {
        $this->info('── CPF alvo ──');
        $this->line('  Dígitos: ' . ($payload['cpf_digits'] ?? '(vazio)'));
        $this->line('  Formatado: ' . ($payload['cpf_formatted'] ?? '—'));
        $this->line('  Entrada: ' . ($payload['reference_input'] ?? '—') . ' (' . ($payload['context']['kind'] ?? '?') . ')');

        $analysis = $payload['cpf_analysis'] ?? [];
        $this->newLine();
        $this->info('── Análise do CPF ──');
        $this->line('  Responsáveis com esse CPF: ' . ($analysis['guardian_records_with_same_cpf'] ?? 0));
        $this->line('  Documentos únicos: ' . json_encode($analysis['unique_documents_found'] ?? [], JSON_UNESCAPED_UNICODE));
        $this->line('  Todos batem com o alvo: ' . (! empty($analysis['all_documents_match_target']) ? 'sim' : 'não'));
        foreach ($analysis['notes'] ?? [] as $note) {
            $this->line('  • ' . $note);
        }

        $guardians = $payload['guardians'] ?? [];
        if ($guardians !== []) {
            $this->newLine();
            $this->info('── Responsáveis (guardians) ──');
            $this->table(
                ['id', 'tenant', 'nome', 'CPF', 'e-mail', 'alunos'],
                array_map(static fn (array $g) => [
                    $g['id'],
                    $g['tenant_id'],
                    $g['name'],
                    $g['document_formatted'] ?? $g['document_digits'],
                    $g['email'] ?? '—',
                    $g['students_count'] ?? 0,
                ], $guardians)
            );
        }

        $students = $payload['students'] ?? [];
        if ($students !== []) {
            $this->newLine();
            $this->info('── Alunos vinculados ──');
            $this->table(
                ['id', 'nome', 'matr. escola', 'CPF aluno', '= alvo?', 'menor?'],
                array_map(static fn (array $s) => [
                    $s['id'],
                    $s['name'],
                    $s['enrollment_number'] ?? '—',
                    $s['document_formatted'] ?? '(vazio)',
                    ! empty($s['cpf_equals_target']) ? 'sim' : 'não',
                    ! empty($s['is_minor']) ? 'sim' : 'não',
                ], $students)
            );
        }

        $enrollments = $payload['enrollments'] ?? [];
        if ($enrollments !== []) {
            $this->newLine();
            $this->info('── Matrículas ──');
            foreach ($enrollments as $e) {
                $payer = $e['expected_payer_for_cora'] ?? [];
                $this->line(sprintf(
                    '  #%s %s — %s / %s — pagador Cora: %s (CPF %s)',
                    $e['id'],
                    $e['enrollment_number'] ?? '—',
                    $e['student_name'] ?? '—',
                    $e['school_class'] ?? '—',
                    $payer['name'] ?? '—',
                    $this->formatCpf((string) ($payer['document_digits'] ?? '')) ?: '(vazio)'
                ));
            }
        }

        $invoices = $payload['invoices'] ?? [];
        if ($invoices !== []) {
            $this->newLine();
            $this->info('── Cobranças locais ──');
            $this->table(
                ['id', 'tipo', 'venc.', 'valor', 'status', 'Cora ID', 'CPF esperado', 'CPF Cora', 'bate?'],
                array_map(static fn (array $inv) => [
                    $inv['id'],
                    $inv['type'],
                    $inv['due_date'] ?? '—',
                    $inv['amount'],
                    $inv['status'],
                    $inv['cora_charge_id'] ? substr((string) $inv['cora_charge_id'], 0, 12) . '…' : '—',
                    $inv['expected_payer']['document_digits'] ?? '—',
                    $inv['cora_customer_document_digits'] ?? '—',
                    ! empty($inv['expected_matches_cora']) ? 'sim' : 'não',
                ], $invoices)
            );
        }

        $cora = $payload['cora'] ?? null;
        if (is_array($cora)) {
            $this->newLine();
            $this->info('── Cora (--cora) ──');
            if (! empty($cora['fetch_error'])) {
                $this->error('  ' . $cora['fetch_error']);
            }
            $summary = $cora['external_preview_summary'] ?? [];
            if ($summary !== []) {
                $this->line('  Boletos listados: ' . ($summary['external_boleto_total'] ?? '?'));
                $this->line('  Desta matrícula: ' . ($summary['external_for_enrollment'] ?? '?'));
                $this->line('  Mesmo CPF pagador: ' . ($summary['external_matches_payer'] ?? '?'));
            }
            if (! empty($cora['parcela_9_detail'])) {
                $d = $cora['parcela_9_detail'];
                $this->line('  Parcela 9/9 — charge ' . ($d['charge_id'] ?? '?')
                    . ' | CPF Cora: ' . ($d['customer_document_masked'] ?? '?')
                    . ' | link: ' . ($d['link_reason'] ?? '?'));
            }
        }
    }

    private function normalizeEnvironment(string $environment): string
    {
        $environment = strtolower(trim($environment));

        return $environment === 'production' ? 'prod' : $environment;
    }

    private function digitsOnly(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function formatCpf(string $digits): ?string
    {
        if (strlen($digits) !== 11) {
            return $digits !== '' ? $digits : null;
        }

        return substr($digits, 0, 3) . '.' . substr($digits, 3, 3) . '.' . substr($digits, 6, 3)
            . '-' . substr($digits, 9, 2);
    }

    private function resolveSavePath(string $option, string $cpfDigits): ?string
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
            $suffix = $cpfDigits !== '' ? $cpfDigits : 'ref';
            $filename = 'payer-cpf-debug-' . $suffix . '-' . now()->format('Ymd-His') . '-' . $filename;
        }

        return storage_path('logs/' . ltrim($filename, '/'));
    }
}
