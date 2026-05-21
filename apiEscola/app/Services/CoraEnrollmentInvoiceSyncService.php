<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class CoraEnrollmentInvoiceSyncService
{
    public function __construct(private readonly PaymentGatewayFactory $factory)
    {
    }

    /**
     * @param array<int, string> $chargeIds
     * @return array<string, mixed>
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function syncEnrollmentCharges(
        Enrollment $enrollment,
        string $environment = 'prod',
        array $chargeIds = [],
        bool $createMissing = true
    ): array {
        $enrollment->loadMissing([
            'tenant',
            'student',
            'student.guardians',
            'invoices' => fn ($query) => $query->withTrashed()->orderBy('due_date'),
        ]);

        /** @var Tenant|null $tenant */
        $tenant = $enrollment->tenant;

        if (! $tenant) {
            throw new RuntimeException('Tenant da matricula nao encontrado para sincronizacao Cora.');
        }

        $externalInvoices = $this->factory->resolve('cora')->listInvoices($tenant, $environment, [
            'limit' => 200,
        ]);

        $studentDocument = $this->digitsOnly((string) ($enrollment->student?->document ?? ''));
        $guardianDocuments = array_values(array_filter(array_map(
            fn ($guardian) => $this->digitsOnly((string) ($guardian->document ?? '')),
            $enrollment->student?->guardians?->all() ?? []
        )));

        $this->writeSyncDebug('sync-start', [
            'tenant_id' => $tenant->id,
            'enrollment_id' => $enrollment->id,
            'environment' => $environment,
            'external_total_before_filters' => count($externalInvoices),
            'requested_charge_ids' => $chargeIds,
            'student_document' => $studentDocument,
            'guardian_documents' => $guardianDocuments,
            'external_preview' => array_map(fn (array $inv) => [
                'id' => $this->extractExternalChargeId($inv),
                'status' => (string) ($inv['status'] ?? ''),
                'customer_document' => $this->extractCustomerDocument($inv),
                'amount' => $this->extractAmount($inv),
                'due_date' => (string) ($inv['due_date'] ?? ''),
            ], array_slice($externalInvoices, 0, 20)),
        ]);

        if ($externalInvoices === []) {
            Log::warning('Cora sync sem invoices retornadas', [
                'tenant_id' => $tenant->id,
                'enrollment_id' => $enrollment->id,
                'environment' => $environment,
                'student_document' => $this->digitsOnly((string) ($enrollment->student?->document ?? '')),
                'guardian_documents' => array_values(array_filter(array_map(
                    fn ($guardian) => $this->digitsOnly((string) ($guardian->document ?? '')),
                    $enrollment->student?->guardians?->all() ?? []
                ))),
            ]);
        }

        if ($chargeIds !== []) {
            $allowedChargeIds = array_values(array_unique(array_filter(array_map('strval', $chargeIds))));
            $externalInvoices = array_values(array_filter(
                $externalInvoices,
                fn (array $invoice) => in_array($this->extractExternalChargeId($invoice), $allowedChargeIds, true)
            ));
        }

        $created = 0;
        $updated = 0;
        $ignored = 0;
        $processedCharges = [];

        foreach ($externalInvoices as $externalInvoice) {
            $externalId = $this->extractExternalChargeId($externalInvoice);
            $belongs = $this->belongsToEnrollment($enrollment, $externalInvoice);
            $isBoleto = $this->isBoletoInvoice($externalInvoice);

            $this->writeSyncDebug('sync-invoice-check', [
                'tenant_id' => $tenant->id,
                'enrollment_id' => $enrollment->id,
                'environment' => $environment,
                'external_id' => $externalId,
                'is_boleto' => $isBoleto,
                'belongs_to_enrollment' => $belongs,
                'status' => (string) ($externalInvoice['status'] ?? ''),
                'customer_document' => $this->extractCustomerDocument($externalInvoice),
                'amount' => $this->extractAmount($externalInvoice),
                'due_date' => (string) ($externalInvoice['due_date'] ?? ''),
            ]);

            if (! $this->isBoletoInvoice($externalInvoice)) {
                $ignored++;
                continue;
            }

            if (! $this->belongsToEnrollment($enrollment, $externalInvoice)) {
                $ignored++;
                continue;
            }

            $chargeId = $this->extractExternalChargeId($externalInvoice);
            if ($chargeId === '') {
                $ignored++;
                continue;
            }

            $externalInvoice = $this->hydrateInvoiceWithDetailsForBoleto($tenant, $environment, $externalInvoice, $chargeId);

            $processedCharges[] = $chargeId;

            $result = DB::transaction(function () use ($enrollment, $externalInvoice, $chargeId, $createMissing): string {
                $localInvoice = $this->findLocalInvoiceForExternal($enrollment, $externalInvoice, $chargeId);

                if ($localInvoice && (int) $localInvoice->enrollment_id !== (int) $enrollment->id) {
                    return 'ignored';
                }

                if (! $localInvoice && ! $createMissing) {
                    return 'ignored';
                }

                $attributes = $this->buildLocalInvoiceAttributes($enrollment, $externalInvoice, $chargeId);

                if ($localInvoice) {
                    if (method_exists($localInvoice, 'trashed') && $localInvoice->trashed()) {
                        $localInvoice->restore();
                    }

                    $localInvoice->update($attributes);
                    return 'updated';
                }

                Invoice::create($attributes);
                return 'created';
            });

            if ($result === 'created') {
                $created++;
            } elseif ($result === 'updated') {
                $updated++;
            } else {
                $ignored++;
            }
        }

        return [
            'enrollment_id' => $enrollment->id,
            'tenant_id' => $enrollment->tenant_id,
            'environment' => $environment,
            'requested_charge_ids' => $chargeIds,
            'external_total' => count($externalInvoices),
            'created' => $created,
            'updated' => $updated,
            'ignored' => $ignored,
            'processed_charge_ids' => array_values(array_unique($processedCharges)),
        ];
    }

    /**
     * Lista boletos da Cora vinculáveis à matrícula (somente leitura, sem persistir).
     *
     * @return array{
     *     items: array<int, array<string, mixed>>,
     *     provider_boleto_list: array<int, array<string, mixed>>,
     *     external_total: int,
     *     external_boleto_total: int,
     *     external_for_enrollment: int,
     *     external_matches_payer: int,
     *     fetch_error: null|string
     * }
     */
    public function previewExternalBoletoCharges(Enrollment $enrollment, string $environment = 'prod'): array
    {
        $enrollment->loadMissing([
            'tenant',
            'student',
            'student.guardians',
            'invoices' => fn ($query) => $query->withTrashed()->orderBy('due_date'),
        ]);

        /** @var Tenant|null $tenant */
        $tenant = $enrollment->tenant;

        if (! $tenant) {
            throw new RuntimeException('Tenant da matricula nao encontrado para consulta Cora.');
        }

        $externalInvoices = $this->factory->resolve('cora')->listInvoices($tenant, $environment, [
            'limit' => 200,
        ]);

        $items = [];
        $catalog = [];
        $boletoTotal = 0;
        $matchesPayerCount = 0;

        foreach ($externalInvoices as $externalInvoice) {
            if (! $this->isBoletoInvoice($externalInvoice)) {
                continue;
            }

            $chargeId = $this->extractExternalChargeId($externalInvoice);
            if ($chargeId === '') {
                continue;
            }

            $boletoTotal++;
            $forEnrollment = $this->belongsToEnrollment($enrollment, $externalInvoice);
            $matchesPayer = $this->matchesEnrollmentPayer($enrollment, $externalInvoice);

            if ($matchesPayer) {
                $matchesPayerCount++;
            }

            $localInvoice = $forEnrollment
                ? $this->findLocalInvoiceForExternal($enrollment, $externalInvoice, $chargeId)
                : null;

            if ($localInvoice && (int) $localInvoice->enrollment_id !== (int) $enrollment->id) {
                continue;
            }

            $amount = $this->extractAmount($externalInvoice);
            $dueDate = $this->parseDate((string) ($externalInvoice['due_date'] ?? ''));

            $linkStatus = $forEnrollment ? 'new' : 'other';
            if ($forEnrollment && $localInvoice) {
                $linkStatus = strtolower((string) $localInvoice->cora_charge_id) === strtolower($chargeId)
                    ? 'linked'
                    : 'updatable';
            }

            $row = [
                'key' => EnrollmentContractChargesService::syncKey($chargeId),
                'charge_id' => $chargeId,
                'status' => (string) ($externalInvoice['status'] ?? ''),
                'amount' => $amount !== null ? number_format($amount, 2, '.', '') : null,
                'due_date' => $dueDate?->toDateString(),
                'description' => (string) (
                    $externalInvoice['description']
                    ?? data_get($externalInvoice, 'services.0.description')
                    ?? 'Boleto Cora'
                ),
                'linked_invoice_id' => $localInvoice?->id,
                'link_status' => $linkStatus,
                'for_this_enrollment' => $forEnrollment,
                'matches_payer' => $matchesPayer,
                'syncable' => $forEnrollment && $linkStatus !== 'linked' && $linkStatus !== 'other',
                'selected_by_default' => $forEnrollment && $linkStatus === 'new',
                'action' => $forEnrollment ? 'sync_from_provider' : 'view_only',
            ];

            $catalog[] = $row;

            if ($forEnrollment) {
                $items[] = $row;
            }
        }

        return [
            'items' => $items,
            'provider_boleto_list' => $catalog,
            'external_total' => count($externalInvoices),
            'external_boleto_total' => $boletoTotal,
            'external_for_enrollment' => count($items),
            'external_matches_payer' => $matchesPayerCount,
            'fetch_error' => null,
        ];
    }

    /**
     * Enriquecer com dados detalhados para obter linha digitavel/codigo de barras
     * quando a listagem nao traz os campos de boleto.
     *
     * @param array<string, mixed> $externalInvoice
     * @return array<string, mixed>
     */
    private function hydrateInvoiceWithDetailsForBoleto(Tenant $tenant, string $environment, array $externalInvoice, string $chargeId): array
    {
        if ($this->extractBoletoNumber($externalInvoice) !== null || $this->extractBoletoDigitable($externalInvoice) !== null) {
            return $externalInvoice;
        }

        try {
            $detailed = $this->factory->resolve('cora')->getInvoiceById($tenant, $chargeId, $environment);

            if ($detailed === []) {
                return $externalInvoice;
            }

            $merged = array_replace_recursive($externalInvoice, $detailed);

            $this->writeSyncDebug('sync-invoice-hydrated-details', [
                'tenant_id' => $tenant->id,
                'enrollment_id' => $this->toNullableInt(data_get($externalInvoice, 'metadata.enrollment_id')),
                'environment' => $environment,
                'external_id' => $chargeId,
                'had_boleto_before' => $this->extractBoletoNumber($externalInvoice) !== null || $this->extractBoletoDigitable($externalInvoice) !== null,
                'has_boleto_after' => $this->extractBoletoNumber($merged) !== null || $this->extractBoletoDigitable($merged) !== null,
            ]);

            return $merged;
        } catch (\Throwable $e) {
            $this->writeSyncDebug('sync-invoice-hydrate-failed', [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
                'external_id' => $chargeId,
                'error' => $e->getMessage(),
            ]);

            return $externalInvoice;
        }
    }

    /**
     * @param array<string, mixed> $context
     */
    private function writeSyncDebug(string $stage, array $context): void
    {
        try {
            Log::debug('[CORA_SYNC_DEBUG] ' . $stage, $context);

            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/cora_sync_debug.log'),
                'level' => 'debug',
            ])->debug('[CORA_SYNC_DEBUG] ' . $stage, $context);
        } catch (\Throwable $e) {
            Log::warning('Falha ao escrever cora_sync_debug.log', [
                'stage' => $stage,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * CPF do pagador na Cora coincide com aluno ou responsável (sem exigir metadata do sistema).
     */
    private function matchesEnrollmentPayer(Enrollment $enrollment, array $externalInvoice): bool
    {
        $customerDocument = $this->extractCustomerDocument($externalInvoice);

        if ($customerDocument === '') {
            return false;
        }

        $studentDocument = $this->digitsOnly((string) ($enrollment->student?->document ?? ''));

        if ($studentDocument !== '' && $customerDocument === $studentDocument) {
            return true;
        }

        foreach ($enrollment->student?->guardians ?? [] as $guardian) {
            $guardianDocument = $this->digitsOnly((string) ($guardian->document ?? ''));
            if ($guardianDocument !== '' && $customerDocument === $guardianDocument) {
                return true;
            }
        }

        return false;
    }

    private function belongsToEnrollment(Enrollment $enrollment, array $externalInvoice): bool
    {
        $metadata = $this->extractProviderLinkMetadata($externalInvoice);

        $metadataTenantId = $this->toNullableInt($metadata['tenant_id'] ?? null);
        if ($metadataTenantId !== null && $metadataTenantId !== (int) $enrollment->tenant_id) {
            return false;
        }

        $metadataEnrollmentId = $this->toNullableInt($metadata['enrollment_id'] ?? null);
        if ($metadataEnrollmentId !== null) {
            return $metadataEnrollmentId === (int) $enrollment->id;
        }

        $metadataStudentId = $this->toNullableInt($metadata['student_id'] ?? null);
        if ($metadataStudentId !== null) {
            return $metadataStudentId === (int) $enrollment->student_id;
        }

        $metadataInvoiceId = $this->toNullableInt($metadata['invoice_id'] ?? null);
        if ($metadataInvoiceId !== null) {
            return Invoice::withTrashed()
                ->where('tenant_id', $enrollment->tenant_id)
                ->where('id', $metadataInvoiceId)
                ->where('enrollment_id', $enrollment->id)
                ->exists();
        }

        $customerDocument = $this->extractCustomerDocument($externalInvoice);

        if ($customerDocument === '') {
            return false;
        }

        $studentDocument = $this->digitsOnly((string) ($enrollment->student?->document ?? ''));

        if ($studentDocument !== '' && $customerDocument === $studentDocument) {
            return true;
        }

        if (! $this->hasStrongEnrollmentMetadataLink($enrollment, $metadata)) {
            return false;
        }

        foreach ($enrollment->student?->guardians ?? [] as $guardian) {
            $guardianDocument = $this->digitsOnly((string) ($guardian->document ?? ''));
            if ($guardianDocument !== '' && $customerDocument === $guardianDocument) {
                return true;
            }
        }

        return false;
    }

    /**
     * Vínculo explícito na metadata do provedor (Cora ou outros) — necessário para aceitar CPF do responsável.
     *
     * @param  array<string, mixed>  $metadata
     */
    private function hasStrongEnrollmentMetadataLink(Enrollment $enrollment, array $metadata): bool
    {
        $metadataEnrollmentId = $this->toNullableInt($metadata['enrollment_id'] ?? null);
        if ($metadataEnrollmentId !== null) {
            return $metadataEnrollmentId === (int) $enrollment->id;
        }

        $metadataStudentId = $this->toNullableInt($metadata['student_id'] ?? null);
        if ($metadataStudentId !== null) {
            return $metadataStudentId === (int) $enrollment->student_id;
        }

        $metadataInvoiceId = $this->toNullableInt($metadata['invoice_id'] ?? null);
        if ($metadataInvoiceId !== null) {
            return Invoice::withTrashed()
                ->where('tenant_id', $enrollment->tenant_id)
                ->where('id', $metadataInvoiceId)
                ->where('enrollment_id', $enrollment->id)
                ->exists();
        }

        return false;
    }

    private function findLocalInvoiceForExternal(Enrollment $enrollment, array $externalInvoice, string $chargeId): ?Invoice
    {
        $byCharge = Invoice::withTrashed()
            ->where('tenant_id', $enrollment->tenant_id)
            ->where('enrollment_id', $enrollment->id)
            ->where('cora_charge_id', $chargeId)
            ->first();

        if ($byCharge) {
            return $byCharge;
        }

        $metadata = $this->extractProviderLinkMetadata($externalInvoice);
        $metadataInvoiceId = $this->toNullableInt($metadata['invoice_id'] ?? null);

        if ($metadataInvoiceId !== null) {
            $byMetadataInvoice = Invoice::withTrashed()
                ->where('tenant_id', $enrollment->tenant_id)
                ->where('id', $metadataInvoiceId)
                ->where('enrollment_id', $enrollment->id)
                ->first();

            if ($byMetadataInvoice) {
                return $byMetadataInvoice;
            }
        }

        $dueDate = $this->parseDate((string) ($externalInvoice['due_date'] ?? ''));
        $amount = $this->extractAmount($externalInvoice);

        if ($dueDate && $amount !== null) {
            $byDueDateAndAmount = Invoice::withTrashed()
                ->where('tenant_id', $enrollment->tenant_id)
                ->where('enrollment_id', $enrollment->id)
                ->whereDate('due_date', $dueDate->toDateString())
                ->where('amount', $amount)
                ->whereNull('cora_charge_id')
                ->orderBy('id')
                ->first();

            if ($byDueDateAndAmount) {
                return $byDueDateAndAmount;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildLocalInvoiceAttributes(Enrollment $enrollment, array $externalInvoice, string $chargeId): array
    {
        $storedMethod = $this->resolveStoredMethodForExternalInvoice($externalInvoice);
        $status = $this->mapExternalStatusToLocal((string) ($externalInvoice['status'] ?? ''));
        $paidAt = $this->parseDateTime(
            (string) (
                $externalInvoice['paid_at']
                ?? data_get($externalInvoice, 'payment.paid_at')
                ?? data_get($externalInvoice, 'payment_date')
                ?? ''
            )
        );

        if ($status === 'paid' && ! $paidAt) {
            $paidAt = now();
        }

        $description = (string) (
            $externalInvoice['description']
            ?? data_get($externalInvoice, 'services.0.description')
            ?? data_get($externalInvoice, 'services.0.name')
            ?? data_get($externalInvoice, 'name')
            ?? 'Cobranca Cora importada'
        );

        $type = str_contains(strtolower($description), 'matricula')
            ? 'enrollment_fee'
            : 'monthly';

        $amount = $this->extractAmount($externalInvoice) ?? 0;

        $dueDate = $this->parseDate((string) ($externalInvoice['due_date'] ?? ''));

        $methodCharges = [
            $storedMethod => [
                'method' => $storedMethod,
                'charge_id' => $chargeId,
                'status' => (string) ($externalInvoice['status'] ?? null),
                'payment_url' => $this->extractPaymentUrl($externalInvoice),
                'pix_copy_paste' => $storedMethod === 'pix' ? $this->extractPixCopyPaste($externalInvoice) : null,
                'boleto_number' => $storedMethod === 'bank_slip' ? $this->extractBoletoNumber($externalInvoice) : null,
                'boleto_digitable' => $storedMethod === 'bank_slip' ? $this->extractBoletoDigitable($externalInvoice) : null,
                'qr_code_image_url' => $storedMethod === 'pix' ? $this->extractPixQrImageUrl($externalInvoice) : null,
            ],
        ];

        $guardianId = $this->resolveGuardianId($enrollment);

        return [
            'tenant_id' => $enrollment->tenant_id,
            'enrollment_id' => $enrollment->id,
            'student_id' => $enrollment->student_id,
            'guardian_id' => $guardianId,
            'type' => $type,
            'description' => trim($description) !== '' ? trim($description) : 'Cobranca Cora importada',
            'amount' => $amount,
            'due_date' => $dueDate?->toDateString() ?? now()->toDateString(),
            'status' => $status,
            'paid_at' => $status === 'paid' ? $paidAt : null,
            'payment_method' => $storedMethod,
            'cora_charge_id' => $chargeId,
            'cora_status' => (string) ($externalInvoice['status'] ?? null),
            'cora_payment_url' => $this->extractPaymentUrl($externalInvoice),
            'cora_pix_copy_paste' => $storedMethod === 'pix' ? $this->extractPixCopyPaste($externalInvoice) : null,
            'boleto_number' => $storedMethod === 'bank_slip' ? $this->extractBoletoNumber($externalInvoice) : null,
            'boleto_digitable' => $storedMethod === 'bank_slip' ? $this->extractBoletoDigitable($externalInvoice) : null,
            'cora_payload' => array_merge($externalInvoice, [
                'method_charges' => $methodCharges,
                'integration' => [
                    'origin' => 'cora_sync',
                    'method_locked' => true,
                    'original_method' => $storedMethod,
                ],
            ]),
            'cora_last_synced_at' => now(),
        ];
    }

    private function resolveStoredMethodForExternalInvoice(array $externalInvoice): string
    {
        if ($this->isBoletoInvoice($externalInvoice)) {
            return 'bank_slip';
        }

        $methodCandidates = [
            $externalInvoice['payment_form'] ?? null,
            $externalInvoice['payment_method'] ?? null,
            data_get($externalInvoice, 'payment.form'),
            data_get($externalInvoice, 'payment.method'),
            data_get($externalInvoice, 'payment_options.selected'),
        ];

        foreach ($methodCandidates as $method) {
            $normalized = strtoupper(trim((string) $method));
            if (in_array($normalized, ['PIX', 'INSTANT_PAYMENT'], true)) {
                return 'pix';
            }
        }

        if ($this->extractPixCopyPaste($externalInvoice) !== null || $this->extractPixQrImageUrl($externalInvoice) !== null) {
            return 'pix';
        }

        return 'bank_slip';
    }

    private function resolveGuardianId(Enrollment $enrollment): ?int
    {
        $existingInvoiceGuardianId = $enrollment->invoices
            ->pluck('guardian_id')
            ->filter(fn ($id) => ! is_null($id))
            ->map(fn ($id) => (int) $id)
            ->first();

        if ($existingInvoiceGuardianId) {
            return $existingInvoiceGuardianId;
        }

        $financialGuardian = $enrollment->student?->guardians
            ?->first(fn ($guardian) => (bool) data_get($guardian, 'pivot.is_financial_responsible', false));

        return $financialGuardian?->id ? (int) $financialGuardian->id : null;
    }

    private function extractExternalChargeId(array $externalInvoice): string
    {
        return trim((string) (
            $externalInvoice['id']
            ?? $externalInvoice['invoice_id']
            ?? $externalInvoice['charge_id']
            ?? ''
        ));
    }

    /**
     * @return array<string, mixed>
     */
    private function extractMetadata(array $externalInvoice): array
    {
        $metadata = $externalInvoice['metadata'] ?? [];

        return is_array($metadata) ? $metadata : [];
    }

    /**
     * Metadados de vínculo unificados (Cora e demais provedores).
     *
     * @return array<string, mixed>
     */
    private function extractProviderLinkMetadata(array $externalInvoice): array
    {
        $chunks = [
            $this->extractMetadata($externalInvoice),
            $externalInvoice['custom_metadata'] ?? null,
            $externalInvoice['provider_metadata'] ?? null,
            data_get($externalInvoice, 'integration.metadata'),
            data_get($externalInvoice, 'integration.custom_fields'),
            data_get($externalInvoice, 'additional_data.metadata'),
            data_get($externalInvoice, 'additional_data'),
            data_get($externalInvoice, 'custom_fields'),
            data_get($externalInvoice, 'external_reference'),
        ];

        $merged = [];

        foreach ($chunks as $chunk) {
            if (! is_array($chunk)) {
                continue;
            }

            foreach ($chunk as $key => $value) {
                if ($value === null || $value === '') {
                    continue;
                }

                $merged[$key] = $value;
            }
        }

        return $merged;
    }

    private function extractAmount(array $externalInvoice): ?float
    {
        $serviceAmount = data_get($externalInvoice, 'services.0.amount');
        if (is_numeric($serviceAmount)) {
            return round(((float) $serviceAmount) / 100, 2);
        }

        $amount = $externalInvoice['amount']
            ?? data_get($externalInvoice, 'total_amount');

        if (is_string($amount) && is_numeric($amount)) {
            $normalized = (float) $amount;

            if (str_contains($amount, '.')) {
                return round($normalized, 2);
            }

            return round($normalized / 100, 2);
        }

        if (is_int($amount)) {
            return round(((float) $amount) / 100, 2);
        }

        if (is_float($amount)) {
            return round($amount, 2);
        }

        return null;
    }

    private function isBoletoInvoice(array $externalInvoice): bool
    {
        $paymentForms = $externalInvoice['payment_forms'] ?? [];

        if (is_array($paymentForms)) {
            foreach ($paymentForms as $form) {
                $normalizedForm = strtoupper(trim((string) $form));
                if (in_array($normalizedForm, ['BANK_SLIP', 'BOLETO'], true)) {
                    return true;
                }
            }
        }

        $methodCandidates = [
            $externalInvoice['payment_form'] ?? null,
            $externalInvoice['payment_method'] ?? null,
            data_get($externalInvoice, 'payment.form'),
            data_get($externalInvoice, 'payment.method'),
            data_get($externalInvoice, 'payment_options.selected'),
        ];

        foreach ($methodCandidates as $method) {
            $normalized = strtoupper(trim((string) $method));
            if (in_array($normalized, ['BANK_SLIP', 'BOLETO', 'BILLET', 'BANKSLIP'], true)) {
                return true;
            }
        }

        return $this->extractBoletoNumber($externalInvoice) !== null
            || $this->extractBoletoDigitable($externalInvoice) !== null
            || data_get($externalInvoice, 'payment_options.bank_slip') !== null
            || data_get($externalInvoice, 'bank_slip') !== null
            || data_get($externalInvoice, 'boleto') !== null
            || data_get($externalInvoice, 'bank_slip_url') !== null
            || data_get($externalInvoice, 'boleto_url') !== null;
    }

    private function extractCustomerDocument(array $externalInvoice): string
    {
        $candidates = [
            $externalInvoice['customer_document'] ?? null,
            $externalInvoice['customer_cpf'] ?? null,
            $externalInvoice['customer_tax_document'] ?? null,
            data_get($externalInvoice, 'customer_document'),
            data_get($externalInvoice, 'customer_cpf'),
            data_get($externalInvoice, 'customer.tax_document'),
            data_get($externalInvoice, 'customer.document.identity'),
            data_get($externalInvoice, 'customer.document.number'),
            data_get($externalInvoice, 'customer.document.value'),
            data_get($externalInvoice, 'customer.document'),
            data_get($externalInvoice, 'customer.identity'),
            data_get($externalInvoice, 'customer.tax_document'),
            data_get($externalInvoice, 'customer.tax_id'),
            data_get($externalInvoice, 'payer.document.identity'),
            data_get($externalInvoice, 'payer.document.number'),
            data_get($externalInvoice, 'payer.document'),
            data_get($externalInvoice, 'document.identity'),
            data_get($externalInvoice, 'document.number'),
            data_get($externalInvoice, 'document'),
        ];

        foreach ($candidates as $candidate) {
            $digits = $this->digitsOnly((string) $candidate);
            if ($digits !== '') {
                return $digits;
            }
        }

        return '';
    }

    private function mapExternalStatusToLocal(string $externalStatus): string
    {
        $status = strtoupper(trim($externalStatus));

        return match (true) {
            in_array($status, ['PAID', 'IN_PAYMENT', 'COMPLETED', 'RECEIVED'], true) => 'paid',
            in_array($status, ['CANCELLED', 'CANCELED', 'VOIDED', 'EXPIRED'], true) => 'cancelled',
            default => 'pending',
        };
    }

    private function extractPaymentUrl(array $externalInvoice): ?string
    {
        $candidates = [
            $externalInvoice['payment_url'] ?? null,
            $externalInvoice['checkout_url'] ?? null,
            data_get($externalInvoice, 'payment_options.bank_slip.url'),
            data_get($externalInvoice, 'payment_options.bank_slip.pdf'),
            data_get($externalInvoice, 'links.payment'),
            data_get($externalInvoice, 'link'),
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractPixCopyPaste(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'pix.copy_paste'),
            data_get($externalInvoice, 'pix.emv'),
            $externalInvoice['pix_copy_paste'] ?? null,
            $externalInvoice['emv'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractPixQrImageUrl(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'pix.qr_code_image_url'),
            data_get($externalInvoice, 'pix.qr_code_url'),
            data_get($externalInvoice, 'payment_options.pix.url'),
            data_get($externalInvoice, 'payment_options.pix.qr_code_url'),
            $externalInvoice['qr_code_image_url'] ?? null,
            $externalInvoice['qr_code_url'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractBoletoNumber(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'payment_options.bank_slip.barcode'),
            data_get($externalInvoice, 'payment_options.bank_slip.number'),
            data_get($externalInvoice, 'bank_slip.barcode'),
            data_get($externalInvoice, 'boleto.barcode'),
            $externalInvoice['barcode'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractBoletoDigitable(array $externalInvoice): ?string
    {
        $candidates = [
            data_get($externalInvoice, 'payment_options.bank_slip.digitable'),
            data_get($externalInvoice, 'payment_options.bank_slip.our_number'),
            data_get($externalInvoice, 'bank_slip.digitable'),
            data_get($externalInvoice, 'boleto.digitable'),
            $externalInvoice['digitable'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function parseDate(string $value): ?Carbon
    {
        $value = trim($value);

        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    private function parseDateTime(string $value): ?Carbon
    {
        $value = trim($value);

        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function digitsOnly(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function toNullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && ctype_digit($value)) {
            return (int) $value;
        }

        return null;
    }
}
