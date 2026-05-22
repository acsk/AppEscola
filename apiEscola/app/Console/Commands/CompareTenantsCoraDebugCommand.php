<?php

namespace App\Console\Commands;

use App\Models\Enrollment;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\CoraTokenService;
use App\Services\InvoicePaymentSettingsResolver;
use App\Services\PaymentGatewayFactory;
use App\Services\TenantBillingSettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

class CompareTenantsCoraDebugCommand extends Command
{
    protected $signature = 'tenants:debug-cora-compare
                            {tenants=2,3 : IDs separados por vírgula}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--json : Saída apenas JSON}
                            {--save= : Grava JSON em storage/logs}';

    protected $description = 'Compara integração Cora entre tenants (credenciais, billing, listagem API, faturas locais)';

    public function handle(
        CoraTokenService $tokenService,
        PaymentGatewayFactory $gatewayFactory,
        InvoicePaymentSettingsResolver $paymentResolver,
        TenantBillingSettingsService $billingSettings,
    ): int {
        $environment = $this->normalizeEnvironment((string) $this->option('environment'));
        $tenantIdParts = array_filter(
            array_map('trim', explode(',', (string) $this->argument('tenants'))),
            static fn (string $part): bool => $part !== '',
        );
        $tenantIds = array_values(array_unique(array_map('intval', $tenantIdParts)));

        if ($tenantIds === []) {
            $this->error('Informe ao menos um tenant_id.');

            return self::FAILURE;
        }

        $report = [
            'generated_at' => now()->toIso8601String(),
            'environment' => $environment,
            'tenants' => [],
        ];

        foreach ($tenantIds as $tenantId) {
            $report['tenants'][$tenantId] = $this->buildTenantReport(
                $tenantId,
                $environment,
                $tokenService,
                $gatewayFactory,
                $paymentResolver,
                $billingSettings,
            );
        }

        $report['comparison_notes'] = $this->buildComparisonNotes($report['tenants']);

        $savePath = $this->resolveSavePath((string) $this->option('save'));
        if ($savePath !== null) {
            File::ensureDirectoryExists(dirname($savePath));
            File::put($savePath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            if (! $this->option('json')) {
                $this->info("JSON salvo em: {$savePath}");
            }
        }

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->printHumanReport($report);

        return self::SUCCESS;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildTenantReport(
        int $tenantId,
        string $environment,
        CoraTokenService $tokenService,
        PaymentGatewayFactory $gatewayFactory,
        InvoicePaymentSettingsResolver $paymentResolver,
        TenantBillingSettingsService $billingSettings,
    ): array {
        $tenant = Tenant::with(['coraCredentials'])->find($tenantId);

        if (! $tenant) {
            return ['found' => false, 'tenant_id' => $tenantId];
        }

        $credentials = $tenant->coraCredentials
            ->map(fn ($c) => $this->describeCredential($c))
            ->values()
            ->all();

        $activeForEnv = $tenant->coraCredentials
            ->where('active', true)
            ->where('environment', $environment)
            ->sortByDesc('configured_at')
            ->first();

        $hasCredentials = $tokenService->hasTenantCredentials($tenant, $environment);
        $usesGlobalTokenFallback = ! $hasCredentials && trim((string) config('services.cora.token', '')) !== '';

        $paymentScope = $billingSettings->scope($tenant, 'payment');

        $coraList = [
            'ok' => false,
            'error' => null,
            'total' => 0,
            'boleto_count' => 0,
            'with_metadata_enrollment' => 0,
            'with_metadata_invoice' => 0,
            'document_suffix_histogram' => [],
            'sample_recent' => [],
        ];

        if ($hasCredentials || $usesGlobalTokenFallback) {
            try {
                $invoices = $gatewayFactory->resolve('cora')->listInvoices($tenant, $environment, ['limit' => 200]);
                $coraList = $this->analyzeCoraList($invoices);
                $coraList['ok'] = true;
            } catch (\Throwable $e) {
                $coraList['error'] = $e->getMessage();
            }
        } else {
            $coraList['error'] = 'Sem credenciais tenant nem CORA_API_TOKEN global.';
        }

        return [
            'found' => true,
            'tenant_id' => $tenant->id,
            'tenant_name' => $tenant->name,
            'cora_credentials' => [
                'has_tenant_credentials' => $hasCredentials,
                'uses_global_token_fallback' => $usesGlobalTokenFallback,
                'active_for_environment' => $activeForEnv ? $this->describeCredential($activeForEnv) : null,
                'all' => $credentials,
            ],
            'payment_settings' => [
                'default_provider' => $paymentResolver->defaultProviderSlug($tenantId),
                'enabled_methods' => $paymentResolver->enabledMethodsForTenant($tenantId),
                'gateway_charge_methods' => $paymentResolver->gatewayChargeMethodsForTenant($tenantId),
                'default_method' => $paymentResolver->configuredDefaultMethod($tenantId),
                'raw_payment_scope' => $paymentScope,
            ],
            'guardians' => $this->guardianStats($tenantId),
            'enrollments' => $this->enrollmentStats($tenantId),
            'local_invoices' => $this->localInvoiceStats($tenantId),
            'cora_api_list' => $coraList,
        ];
    }

    /**
     * @param \App\Models\TenantCoraCredential $credential
     * @return array<string, mixed>
     */
    private function describeCredential($credential): array
    {
        $certPath = trim((string) $credential->certificate_path);
        $keyPath = trim((string) $credential->private_key_path);
        $certExists = $certPath !== '' && Storage::disk('local')->exists($certPath);
        $keyExists = $keyPath !== '' && Storage::disk('local')->exists($keyPath);

        return [
            'id' => $credential->id,
            'environment' => $credential->environment,
            'active' => (bool) $credential->active,
            'client_id_masked' => $this->maskClientId((string) $credential->client_id),
            'configured_at' => $credential->configured_at?->toIso8601String(),
            'certificate_path' => $certPath !== '' ? basename($certPath) : null,
            'certificate_on_disk' => $certExists,
            'private_key_on_disk' => $keyExists,
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $invoices
     * @return array<string, mixed>
     */
    private function analyzeCoraList(array $invoices): array
    {
        $histogram = [];
        $boletoCount = 0;
        $withEnrollmentMeta = 0;
        $withInvoiceMeta = 0;
        $samples = [];

        foreach ($invoices as $inv) {
            $doc = $this->extractCustomerDocument($inv);
            $suffix = $doc !== '' ? substr($doc, -4) : 'empty';
            $histogram[$suffix] = ($histogram[$suffix] ?? 0) + 1;

            if ($this->isBoletoLike($inv)) {
                $boletoCount++;
            }

            $metadata = $this->extractMetadata($inv);
            if (isset($metadata['enrollment_id']) && $metadata['enrollment_id'] !== null && $metadata['enrollment_id'] !== '') {
                $withEnrollmentMeta++;
            }
            if (isset($metadata['invoice_id']) && $metadata['invoice_id'] !== null && $metadata['invoice_id'] !== '') {
                $withInvoiceMeta++;
            }
        }

        arsort($histogram);

        foreach (array_slice($invoices, 0, 8) as $inv) {
            $metadata = $this->extractMetadata($inv);
            $samples[] = [
                'id' => (string) ($inv['id'] ?? $inv['invoice_id'] ?? ''),
                'status' => (string) ($inv['status'] ?? ''),
                'payment_method' => $this->extractPaymentMethod($inv),
                'customer_document_suffix' => substr($this->extractCustomerDocument($inv), -4),
                'amount' => $inv['total_amount'] ?? $inv['amount'] ?? null,
                'due_date' => (string) ($inv['due_date'] ?? ''),
                'metadata' => $metadata,
            ];
        }

        return [
            'ok' => true,
            'error' => null,
            'total' => count($invoices),
            'boleto_count' => $boletoCount,
            'with_metadata_enrollment' => $withEnrollmentMeta,
            'with_metadata_invoice' => $withInvoiceMeta,
            'document_suffix_histogram' => $histogram,
            'sample_recent' => $samples,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function guardianStats(int $tenantId): array
    {
        $total = Guardian::query()->where('tenant_id', $tenantId)->count();
        $withDocument = Guardian::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('document')
            ->where('document', '!=', '')
            ->count();
        $invalidLength = Guardian::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('document')
            ->get(['id', 'document'])
            ->filter(fn ($g) => strlen(preg_replace('/\D+/', '', (string) $g->document) ?? '') !== 11)
            ->count();

        $financialOnPivot = (int) DB::table('student_guardians')
            ->join('students', 'students.id', '=', 'student_guardians.student_id')
            ->where('students.tenant_id', $tenantId)
            ->where('student_guardians.is_financial_responsible', true)
            ->count();

        return [
            'total' => $total,
            'with_document' => $withDocument,
            'invalid_cpf_length' => $invalidLength,
            'financial_responsible_links' => $financialOnPivot,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function enrollmentStats(int $tenantId): array
    {
        $active = Enrollment::query()->where('tenant_id', $tenantId)->whereNull('deleted_at')->count();
        $withoutFinancial = Enrollment::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereHas('student', function ($q) {
                $q->where('is_minor', true);
            })
            ->whereDoesntHave('student.guardians', function ($q) {
                $q->where('student_guardians.is_financial_responsible', true);
            })
            ->count();

        return [
            'active_count' => $active,
            'minor_without_financial_responsible' => $withoutFinancial,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function localInvoiceStats(int $tenantId): array
    {
        $withCora = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('cora_charge_id')
            ->where('cora_charge_id', '!=', '')
            ->count();

        $withCoraNoEnrollment = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('cora_charge_id')
            ->whereNull('enrollment_id')
            ->count();

        $recent = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('cora_charge_id')
            ->orderByDesc('id')
            ->limit(5)
            ->get(['id', 'enrollment_id', 'amount', 'payment_method', 'cora_charge_id', 'guardian_id'])
            ->map(fn ($inv) => [
                'id' => $inv->id,
                'enrollment_id' => $inv->enrollment_id,
                'guardian_id' => $inv->guardian_id,
                'amount' => (string) $inv->amount,
                'payment_method' => $inv->payment_method,
                'cora_charge_id' => substr((string) $inv->cora_charge_id, 0, 12) . '…',
            ])
            ->all();

        return [
            'with_cora_charge_id' => $withCora,
            'with_cora_but_no_enrollment_id' => $withCoraNoEnrollment,
            'recent_with_cora' => $recent,
        ];
    }

    /**
     * @param array<int|string, array<string, mixed>> $tenants
     * @return array<int, string>
     */
    private function buildComparisonNotes(array $tenants): array
    {
        $notes = [];
        $foundReports = [];

        foreach ($tenants as $tenantId => $data) {
            if (! ($data['found'] ?? false)) {
                $notes[] = "Tenant {$tenantId} não encontrado no banco — ignorado na comparação.";

                continue;
            }

            $foundReports[$tenantId] = $data;
        }

        if (count($foundReports) < 2) {
            if (count($foundReports) === 1 && $notes === []) {
                $notes[] = 'Informe pelo menos dois tenant_ids existentes para comparar.';
            }

            return $notes;
        }

        ksort($foundReports);
        $tenantIds = array_keys($foundReports);
        $idA = $tenantIds[0];
        $idB = $tenantIds[1];
        $reportA = $foundReports[$idA];
        $reportB = $foundReports[$idB];

        $aHasCredentials = (bool) data_get($reportA, 'cora_credentials.has_tenant_credentials', false);
        $bHasCredentials = (bool) data_get($reportB, 'cora_credentials.has_tenant_credentials', false);

        if ($aHasCredentials !== $bHasCredentials) {
            $notes[] = 'Credenciais mTLS por tenant diferem — listagem/emissão podem ir para contas Cora distintas (ou uma usa CORA_API_TOKEN global).';
        }

        $aFallback = (bool) data_get($reportA, 'cora_credentials.uses_global_token_fallback', false);
        $bFallback = (bool) data_get($reportB, 'cora_credentials.uses_global_token_fallback', false);

        if ($aFallback xor $bFallback) {
            $notes[] = 'Um tenant usa fallback CORA_API_TOKEN do .env; o outro usa credencial própria — boletos não se misturam entre contas.';
        }

        $aListOk = (bool) data_get($reportA, 'cora_api_list.ok', false);
        $bListOk = (bool) data_get($reportB, 'cora_api_list.ok', false);

        if ($aListOk && $bListOk) {
            $aMeta = (int) data_get($reportA, 'cora_api_list.with_metadata_enrollment', 0);
            $bMeta = (int) data_get($reportB, 'cora_api_list.with_metadata_enrollment', 0);

            if ($aMeta !== $bMeta && ($aMeta === 0 || $bMeta === 0)) {
                $zeroTenantId = $aMeta === 0 ? $idA : $idB;
                $notes[] = "Tenant {$zeroTenantId} tem 0 boletos com metadata enrollment na Cora: sync depende de CPF do pagador bater com guardian/aluno.";
            }
        }

        $aMinor = (int) data_get($reportA, 'enrollments.minor_without_financial_responsible', 0);
        $bMinor = (int) data_get($reportB, 'enrollments.minor_without_financial_responsible', 0);

        if ($aMinor !== $bMinor) {
            $notes[] = sprintf(
                'Menores sem responsável financeiro: tenant %s = %d, tenant %s = %d. Quanto maior o valor, maior o risco de emissão com CPF incorreto ou falha.',
                $idA,
                $aMinor,
                $idB,
                $bMinor
            );
        }

        return $notes;
    }

    /**
     * @param array<string, mixed> $report
     */
    private function printHumanReport(array $report): void
    {
        $this->info('Comparativo Cora — ambiente ' . $report['environment']);

        foreach ($report['tenants'] as $tenantId => $data) {
            if (! ($data['found'] ?? false)) {
                $this->warn("Tenant {$tenantId}: não encontrado");

                continue;
            }

            $this->newLine();
            $this->line("<fg=cyan>Tenant {$tenantId}</> — {$data['tenant_name']}");

            $cred = $data['cora_credentials'];
            $this->line('  Credenciais: ' . ($cred['has_tenant_credentials'] ? 'OK (mTLS)' : 'AUSENTE')
                . ($cred['uses_global_token_fallback'] ? ' + fallback .env' : ''));

            if ($cred['active_for_environment']) {
                $active = $cred['active_for_environment'];
                $this->line('  Ativa [' . $active['environment'] . ']: client ' . $active['client_id_masked']
                    . ', cert=' . ($active['certificate_on_disk'] ? 'sim' : 'não')
                    . ', key=' . ($active['private_key_on_disk'] ? 'sim' : 'não'));
            } else {
                $this->warn('  Sem credencial ativa para este ambiente.');
            }

            $pay = $data['payment_settings'];
            $this->line('  Pagamento: provider=' . $pay['default_provider']
                . ', métodos=' . implode(',', $pay['enabled_methods'] ?? []));

            $guard = $data['guardians'];
            $this->line("  Responsáveis: {$guard['total']} total, {$guard['financial_responsible_links']} vínculos financeiros, {$guard['invalid_cpf_length']} CPF inválido");

            $enr = $data['enrollments'];
            $this->line("  Matrículas: {$enr['active_count']} ativas, {$enr['minor_without_financial_responsible']} menores sem resp. financeiro");

            $local = $data['local_invoices'];
            $this->line("  Faturas locais com Cora: {$local['with_cora_charge_id']} (sem enrollment_id: {$local['with_cora_but_no_enrollment_id']})");

            $cora = $data['cora_api_list'];
            if ($cora['ok'] ?? false) {
                $this->line("  API Cora: {$cora['total']} cobranças, {$cora['boleto_count']} boleto-like, metadata enrollment: {$cora['with_metadata_enrollment']}");
                $hist = $cora['document_suffix_histogram'] ?? [];
                if ($hist !== []) {
                    $parts = [];
                    foreach (array_slice($hist, 0, 6, true) as $suffix => $count) {
                        $parts[] = "*{$suffix}={$count}";
                    }
                    $this->line('  Sufixos CPF na Cora: ' . implode(', ', $parts));
                }
            } else {
                $this->error('  API Cora: ' . ($cora['error'] ?? 'falha'));
            }
        }

        $notes = $report['comparison_notes'] ?? [];
        if ($notes !== []) {
            $this->newLine();
            $this->info('Notas comparativas:');
            foreach ($notes as $note) {
                $this->line('  • ' . $note);
            }
        }
    }

    private function normalizeEnvironment(string $environment): string
    {
        $normalized = strtolower(trim($environment));

        return in_array($normalized, ['prod', 'production'], true) ? 'prod' : 'stage';
    }

    private function maskClientId(string $clientId): string
    {
        $trimmed = trim($clientId);
        if ($trimmed === '') {
            return '(vazio)';
        }

        if (strlen($trimmed) <= 8) {
            return '***';
        }

        return substr($trimmed, 0, 4) . '…' . substr($trimmed, -4);
    }

    private function resolveSavePath(string $option): ?string
    {
        if ($option === '') {
            return null;
        }

        if (str_starts_with($option, '/')) {
            return $option;
        }

        return storage_path('logs/' . ltrim($option, '/'));
    }

    /**
     * @param array<string, mixed> $invoice
     */
    private function extractCustomerDocument(array $invoice): string
    {
        $candidates = [
            data_get($invoice, 'customer.document.identity'),
            data_get($invoice, 'customer.identity'),
            data_get($invoice, 'customer.document'),
            $invoice['customer_document'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && $value !== '') {
                return preg_replace('/\D+/', '', $value) ?? '';
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $invoice
     * @return array<string, mixed>
     */
    private function extractMetadata(array $invoice): array
    {
        $raw = $invoice['metadata'] ?? data_get($invoice, 'integration.metadata') ?? [];

        return is_array($raw) ? $raw : [];
    }

    /**
     * @param array<string, mixed> $invoice
     */
    private function extractPaymentMethod(array $invoice): string
    {
        $forms = $invoice['payment_forms'] ?? $invoice['payment_method'] ?? null;
        if (is_array($forms)) {
            return implode(',', $forms);
        }

        return (string) $forms;
    }

    /**
     * @param array<string, mixed> $invoice
     */
    private function isBoletoLike(array $invoice): bool
    {
        $method = strtolower($this->extractPaymentMethod($invoice));

        return str_contains($method, 'bank_slip')
            || str_contains($method, 'boleto')
            || str_contains($method, 'hybrid')
            || isset($invoice['payment_options']['bank_slip']);
    }
}
