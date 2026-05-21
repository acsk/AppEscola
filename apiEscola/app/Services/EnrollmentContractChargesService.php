<?php

namespace App\Services;

use App\Models\CoursePlan;
use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class EnrollmentContractChargesService
{
    public function __construct(
        private readonly TenantBillingSettingsService $billingSettings,
        private readonly CoraEnrollmentInvoiceSyncService $coraSync,
        private readonly InvoiceLifecycleService $invoiceLifecycle,
    ) {
    }

    public static function generateKey(string $type, string $dueDate): string
    {
        return 'generate:' . $type . ':' . $dueDate;
    }

    public static function syncKey(string $chargeId): string
    {
        return 'sync:' . $chargeId;
    }

    /**
     * @param  array<int, string>  $invoiceTypes
     * @return array<string, mixed>
     */
    public function preview(Enrollment $enrollment, string $environment, array $invoiceTypes = ['monthly']): array
    {
        $enrollment->loadMissing([
            'student.guardians',
            'schoolClass.course',
            'coursePlan.course',
            'invoices' => fn ($q) => $q->orderBy('due_date'),
        ]);

        $invoiceTypes = $this->normalizeInvoiceTypes($invoiceTypes);
        $billing = $this->billingSettings->scope(
            $enrollment->tenant ?? Tenant::find($enrollment->tenant_id),
            'billing'
        );

        $warnings = [];
        $blocked = [
            'contract_batch_generated' => $enrollment->charges_generated_at !== null,
            'monthlies_blocked_by_fee' => false,
        ];

        if (
            in_array('monthly', $invoiceTypes, true)
            && ! empty($billing['charges_enrollment_fee'])
            && empty($billing['allow_monthlies_before_fee_paid'])
        ) {
            $blocked['monthlies_blocked_by_fee'] = Invoice::query()
                ->where('enrollment_id', $enrollment->id)
                ->where('type', 'enrollment_fee')
                ->whereIn('status', ['pending', 'overdue'])
                ->exists();

            if ($blocked['monthlies_blocked_by_fee']) {
                $warnings[] = 'Mensalidades do contrato não podem ser geradas enquanto a taxa de matrícula estiver pendente.';
            }
        }

        if (empty($billing['charges_enrollment_fee'])) {
            $invoiceTypes = array_values(array_filter(
                $invoiceTypes,
                static fn ($t) => $t !== 'enrollment_fee'
            ));
        }

        $localInvoices = $this->mapLocalInvoices($enrollment);
        $toGenerate = $this->planLocalCharges($enrollment, $invoiceTypes, $billing, $blocked);

        $externalPreview = [
            'items' => [],
            'external_total' => 0,
            'external_for_enrollment' => 0,
            'fetch_error' => null,
        ];

        try {
            $externalPreview = $this->coraSync->previewExternalBoletoCharges($enrollment, $environment);
        } catch (ConnectionException|RequestException $e) {
            $externalPreview['fetch_error'] = 'Não foi possível consultar cobranças no provedor: ' . $e->getMessage();
            $warnings[] = $externalPreview['fetch_error'];
        } catch (RuntimeException $e) {
            $externalPreview['fetch_error'] = $e->getMessage();
            $warnings[] = $externalPreview['fetch_error'];
        }

        $syncCandidates = $externalPreview['items'];
        $toGenerateSelectable = array_values(array_filter(
            $toGenerate,
            static fn (array $row) => empty($row['already_exists']) && empty($row['disabled'])
        ));

        return [
            'enrollment_id' => $enrollment->id,
            'title' => 'Cobranças do contrato',
            'environment' => $environment,
            'charges_generated_at' => $enrollment->charges_generated_at?->toISOString(),
            'charges_batch_generated' => $enrollment->charges_generated_at !== null,
            'invoice_types' => $invoiceTypes,
            'summary' => [
                'local_count' => count($localInvoices),
                'local_with_gateway' => count(array_filter(
                    $localInvoices,
                    static fn (array $row) => ! empty($row['cora_charge_id'])
                )),
                'to_generate_count' => count($toGenerateSelectable),
                'to_sync_count' => count(array_filter(
                    $syncCandidates,
                    static fn (array $row) => ($row['link_status'] ?? '') === 'new'
                )),
                'external_total' => $externalPreview['external_total'],
                'external_for_enrollment' => $externalPreview['external_for_enrollment'] ?? count($syncCandidates),
                'provider_fetch_error' => $externalPreview['fetch_error'],
            ],
            'warnings' => $warnings,
            'blocked' => $blocked,
            'local_invoices' => $localInvoices,
            'to_generate' => $toGenerate,
            'external_charges' => $syncCandidates,
        ];
    }

    /**
     * @param  array<int, string>  $generateKeys
     * @param  array<int, string>  $syncChargeIds
     * @return array<string, mixed>
     */
    public function apply(
        Enrollment $enrollment,
        string $environment,
        array $generateKeys = [],
        array $syncChargeIds = [],
        bool $createMissingOnSync = true,
    ): array {
        $generateKeys = array_values(array_unique(array_filter(array_map('strval', $generateKeys))));
        $syncChargeIds = array_values(array_unique(array_filter(array_map('strval', $syncChargeIds))));

        if ($generateKeys === [] && $syncChargeIds === []) {
            throw new RuntimeException('Selecione ao menos uma cobrança para gerar ou sincronizar.');
        }

        if ($enrollment->charges_generated_at !== null && $generateKeys !== []) {
            throw new RuntimeException(
                'As cobranças do contrato já foram geradas em lote. Use a sincronização com o provedor ou crie cobranças avulsas.'
            );
        }

        $generated = [
            'created' => 0,
            'existing' => 0,
            'items' => [],
        ];

        if ($generateKeys !== []) {
            $generated = $this->generateByKeys($enrollment, $generateKeys);
            $enrollment->update(['charges_generated_at' => now()]);
        }

        $syncResult = null;
        if ($syncChargeIds !== []) {
            $syncResult = $this->coraSync->syncEnrollmentCharges(
                $enrollment,
                $environment,
                $syncChargeIds,
                $createMissingOnSync
            );
        }

        return [
            'enrollment_id' => $enrollment->id,
            'environment' => $environment,
            'generated' => $generated,
            'sync' => $syncResult,
            'charges_generated_at' => $enrollment->fresh()->charges_generated_at?->toISOString(),
        ];
    }

    /**
     * @param  array<int, string>  $invoiceTypes
     * @return array<int, string>
     */
    private function normalizeInvoiceTypes(array $invoiceTypes): array
    {
        $normalized = array_values(array_unique(array_filter(array_map(
            static fn ($value) => strtolower(trim((string) $value)),
            $invoiceTypes
        ))));

        return $normalized === [] ? ['monthly'] : $normalized;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function mapLocalInvoices(Enrollment $enrollment): array
    {
        return $enrollment->invoices->map(function (Invoice $invoice) {
            $hasGateway = $this->invoiceLifecycle->hasActiveGatewayCharge($invoice);

            return [
                'invoice_id' => $invoice->id,
                'type' => $invoice->type,
                'description' => $invoice->description,
                'due_date' => $invoice->due_date?->toDateString(),
                'amount' => number_format((float) $invoice->amount, 2, '.', ''),
                'status' => $invoice->status,
                'payment_method' => $invoice->payment_method,
                'cora_charge_id' => $invoice->cora_charge_id,
                'cora_status' => $invoice->cora_status,
                'has_active_gateway_charge' => $hasGateway,
                'source' => $invoice->cora_charge_id ? 'local_with_provider' : 'local_only',
            ];
        })->values()->all();
    }

    /**
     * @param  array<int, string>  $invoiceTypes
     * @param  array<string, mixed>  $billing
     * @param  array<string, bool>  $blocked
     * @return array<int, array<string, mixed>>
     */
    private function planLocalCharges(
        Enrollment $enrollment,
        array $invoiceTypes,
        array $billing,
        array $blocked,
    ): array {
        $plan = $enrollment->coursePlan;
        if (! $plan) {
            return [];
        }

        $startDate = Carbon::parse($enrollment->start_date ?? now());
        $endDate = $enrollment->end_date
            ? Carbon::parse($enrollment->end_date)
            : $startDate->copy()->addMonths($plan->monthsInCycle())->subDay();
        $dueDay = (int) ($enrollment->payment_due_day ?? $billing['default_payment_due_day'] ?? 10);
        $netAmount = $enrollment->netMonthlyAmount();
        $feeAmount = $this->resolveEnrollmentFeeAmount($plan, $enrollment);
        $courseName = $enrollment->coursePlan?->course?->name ?? 'Curso';
        $enrollmentFeeCoversFirstMonth = ! empty($billing['charges_enrollment_fee'])
            && ! empty($billing['enrollment_fee_covers_first_month']);

        $planned = [];
        $batchBlocked = $blocked['contract_batch_generated'] ?? false;
        $monthliesBlocked = $blocked['monthlies_blocked_by_fee'] ?? false;

        if (in_array('enrollment_fee', $invoiceTypes, true) && $feeAmount !== null) {
            $dueDate = $startDate->toDateString();
            $exists = $enrollment->invoices->contains(
                fn (Invoice $inv) => $inv->type === 'enrollment_fee' && $inv->due_date?->toDateString() === $dueDate
            );

            $planned[] = [
                'key' => self::generateKey('enrollment_fee', $dueDate),
                'type' => 'enrollment_fee',
                'due_date' => $dueDate,
                'amount' => number_format($feeAmount, 2, '.', ''),
                'description' => 'Taxa de Matrícula — ' . $courseName,
                'already_exists' => $exists,
                'disabled' => $batchBlocked || $exists,
                'selected_by_default' => ! $exists && ! $batchBlocked,
                'action' => 'generate_local',
            ];
        }

        if (in_array('monthly', $invoiceTypes, true) && ! $monthliesBlocked) {
            $cursor = $startDate->copy()->day($dueDay);
            if ($cursor->lt($startDate)) {
                $cursor->addMonth();
            }
            if ($enrollmentFeeCoversFirstMonth) {
                $cursor->addMonth();
            }

            while ($cursor->lte($endDate)) {
                $dueDate = $cursor->toDateString();
                $exists = $enrollment->invoices->contains(
                    fn (Invoice $inv) => $inv->type === 'monthly' && $inv->due_date?->toDateString() === $dueDate
                );

                $planned[] = [
                    'key' => self::generateKey('monthly', $dueDate),
                    'type' => 'monthly',
                    'due_date' => $dueDate,
                    'amount' => number_format($netAmount, 2, '.', ''),
                    'description' => 'Mensalidade ' . $cursor->format('m/Y') . ' — ' . $courseName,
                    'already_exists' => $exists,
                    'disabled' => $batchBlocked || $exists,
                    'selected_by_default' => ! $exists && ! $batchBlocked,
                    'action' => 'generate_local',
                ];

                $cursor->addMonth();
            }
        }

        return $planned;
    }

    /**
     * @param  array<int, string>  $generateKeys
     * @return array{created: int, existing: int, items: array<int, array<string, mixed>>}
     */
    private function generateByKeys(Enrollment $enrollment, array $generateKeys): array
    {
        $enrollment->loadMissing(['coursePlan.course', 'student.guardians', 'invoices']);
        $plan = $enrollment->coursePlan;

        if (! $plan) {
            throw new RuntimeException('A matrícula não possui plano associado.');
        }

        $billing = $this->billingSettings->scope(
            $enrollment->tenant ?? Tenant::find($enrollment->tenant_id),
            'billing'
        );
        $guardianId = $this->resolveGuardianId($enrollment);
        $startDate = Carbon::parse($enrollment->start_date ?? now());
        $dueDay = (int) ($enrollment->payment_due_day ?? $billing['default_payment_due_day'] ?? 10);
        $netAmount = $enrollment->netMonthlyAmount();
        $feeAmount = $this->resolveEnrollmentFeeAmount($plan, $enrollment);
        $courseName = $enrollment->coursePlan?->course?->name ?? 'Curso';

        $monthliesBlocked = ! empty($billing['charges_enrollment_fee'])
            && empty($billing['allow_monthlies_before_fee_paid'])
            && Invoice::query()
                ->where('enrollment_id', $enrollment->id)
                ->where('type', 'enrollment_fee')
                ->whereIn('status', ['pending', 'overdue'])
                ->exists();

        $allowedKeys = collect($this->planLocalCharges($enrollment, ['enrollment_fee', 'monthly'], $billing, [
            'contract_batch_generated' => false,
            'monthlies_blocked_by_fee' => $monthliesBlocked,
        ]))
            ->filter(static fn (array $row) => empty($row['disabled']))
            ->pluck('key')
            ->all();

        $created = 0;
        $existing = 0;
        $items = [];

        DB::transaction(function () use (
            $enrollment,
            $generateKeys,
            $allowedKeys,
            $guardianId,
            $startDate,
            $netAmount,
            $feeAmount,
            $courseName,
            &$created,
            &$existing,
            &$items
        ) {
            foreach ($generateKeys as $key) {
                if (! in_array($key, $allowedKeys, true)) {
                    throw new RuntimeException("Chave de geração inválida ou indisponível: {$key}");
                }

                if (! preg_match('/^generate:(enrollment_fee|monthly):(\d{4}-\d{2}-\d{2})$/', $key, $matches)) {
                    throw new RuntimeException("Formato de chave inválido: {$key}");
                }

                $type = $matches[1];
                $dueDate = $matches[2];

                $defaults = [
                    'student_id' => $enrollment->student_id,
                    'guardian_id' => $guardianId,
                    'status' => 'pending',
                ];

                if ($type === 'enrollment_fee') {
                    if ($feeAmount === null) {
                        throw new RuntimeException('Este plano não possui taxa de matrícula cadastrada.');
                    }
                    $defaults['description'] = 'Taxa de Matrícula — ' . $courseName;
                    $defaults['amount'] = $feeAmount;
                } else {
                    $defaults['description'] = 'Mensalidade ' . Carbon::parse($dueDate)->format('m/Y') . ' — ' . $courseName;
                    $defaults['amount'] = $netAmount;
                }

                $invoice = Invoice::firstOrCreate(
                    [
                        'tenant_id' => $enrollment->tenant_id,
                        'enrollment_id' => $enrollment->id,
                        'type' => $type,
                        'due_date' => $dueDate,
                    ],
                    $defaults
                );

                if ($invoice->wasRecentlyCreated) {
                    $created++;
                } else {
                    $existing++;
                }

                $items[] = [
                    'invoice_id' => $invoice->id,
                    'key' => $key,
                    'type' => $invoice->type,
                    'due_date' => $invoice->due_date?->toDateString(),
                    'amount' => $invoice->amount,
                    'status' => $invoice->status,
                    'created' => $invoice->wasRecentlyCreated,
                ];
            }
        });

        return [
            'created' => $created,
            'existing' => $existing,
            'items' => $items,
        ];
    }

    private function resolveEnrollmentFeeAmount(CoursePlan $plan, Enrollment $enrollment): ?float
    {
        $planFee = $plan->enrollment_fee_amount;

        if ($planFee === null) {
            return null;
        }

        $amount = (float) $planFee;
        if ($amount <= 0) {
            return null;
        }

        $net = max($amount - (float) ($enrollment->discount_amount ?? 0), 0);

        return $net > 0 ? $net : null;
    }

    private function resolveGuardianId(Enrollment $enrollment): ?int
    {
        $fromInvoice = $enrollment->invoices
            ->pluck('guardian_id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->first();

        if ($fromInvoice) {
            return $fromInvoice;
        }

        $financialGuardian = $enrollment->student?->guardians
            ?->first(fn ($guardian) => (bool) data_get($guardian, 'pivot.is_financial_responsible', false));

        return $financialGuardian?->id ? (int) $financialGuardian->id : null;
    }
}
