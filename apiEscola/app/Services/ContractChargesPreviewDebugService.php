<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Diagnóstico da pré-visualização de cobranças do contrato (Cora + matrícula).
 * Ativar com GET .../contract-charges/preview?debug=1
 */
class ContractChargesPreviewDebugService
{
    public function __construct(
        private readonly CoraEnrollmentInvoiceSyncService $coraSync,
        private readonly PaymentGatewayFactory $factory,
        private readonly TenantBillingSettingsService $billingSettings,
    ) {
    }

    /**
     * @param  array<string, mixed>|null  $externalPreview
     * @return array<string, mixed>
     */
    public function build(
        Enrollment $enrollment,
        string $environment,
        array $invoiceTypes,
        array $toGenerate,
        ?array $externalPreview = null,
    ): array {
        $enrollment->loadMissing([
            'tenant',
            'student.guardians',
            'coursePlan.course',
            'schoolClass',
            'invoices' => fn ($q) => $q->orderBy('due_date'),
        ]);

        $billing = $this->billingSettings->scope(
            $enrollment->tenant ?? Tenant::find($enrollment->tenant_id),
            'billing'
        );

        $plan = $enrollment->coursePlan;
        $startDate = Carbon::parse($enrollment->start_date ?? now());
        $endDate = $enrollment->end_date
            ? Carbon::parse($enrollment->end_date)
            : ($plan
                ? $startDate->copy()->addMonths($plan->monthsInCycle())->subDay()
                : null);

        $localDebug = [
            'enrollment_id' => $enrollment->id,
            'enrollment_number' => $enrollment->enrollment_number,
            'tenant_id' => $enrollment->tenant_id,
            'student_id' => $enrollment->student_id,
            'environment' => $environment,
            'invoice_types' => $invoiceTypes,
            'charges_generated_at' => $enrollment->charges_generated_at?->toISOString(),
            'contract_dates' => [
                'start_date' => $enrollment->start_date?->toDateString(),
                'end_date' => $enrollment->end_date?->toDateString(),
                'computed_end_date' => $endDate?->toDateString(),
            ],
            'amounts' => [
                'monthly_amount' => $enrollment->monthly_amount !== null
                    ? number_format((float) $enrollment->monthly_amount, 2, '.', '')
                    : null,
                'discount_amount' => number_format((float) ($enrollment->discount_amount ?? 0), 2, '.', ''),
                'base_monthly_amount' => number_format($enrollment->baseMonthlyAmount(), 2, '.', ''),
                'net_monthly_amount' => number_format($enrollment->netMonthlyAmount(), 2, '.', ''),
                'plan_monthly_equivalent' => $plan !== null
                    ? number_format($plan->monthlyEquivalent(), 2, '.', '')
                    : null,
            ],
            'payment_due_day' => (int) ($enrollment->payment_due_day ?? $billing['default_payment_due_day'] ?? 10),
            'payer_documents_masked' => $this->coraSync->maskedPayerDocumentsForEnrollment($enrollment),
            'local_invoices_count' => $enrollment->invoices->count(),
            'to_generate_planned' => array_map(static fn (array $row) => [
                'key' => $row['key'] ?? null,
                'due_date' => $row['due_date'] ?? null,
                'amount' => $row['amount'] ?? null,
                'already_exists' => $row['already_exists'] ?? false,
                'provider_has_boleto' => $row['provider_has_boleto'] ?? false,
            ], $toGenerate),
        ];

        $coraDebug = [
            'fetch_error' => $externalPreview['fetch_error'] ?? null,
            'summary' => [
                'external_total' => $externalPreview['external_total'] ?? null,
                'external_boleto_total' => $externalPreview['external_boleto_total'] ?? null,
                'external_for_enrollment' => $externalPreview['external_for_enrollment'] ?? null,
                'external_matches_payer' => $externalPreview['external_matches_payer'] ?? null,
                'provider_boleto_list_count' => count($externalPreview['provider_boleto_list'] ?? []),
            ],
            'api' => null,
            'boleto_diagnosis' => [],
            'hydrate_samples' => [],
        ];

        try {
            $coraDebug['api'] = $this->coraSync->buildListInvoicesDebugSnapshot($enrollment, $environment);
            $coraDebug['boleto_diagnosis'] = $this->coraSync->diagnoseAllBoletoInvoices($enrollment, $environment);
            $coraDebug['hydrate_samples'] = $this->coraSync->buildHydrateComparisonSamples($enrollment, $environment, 5);
        } catch (ConnectionException|RequestException $e) {
            $coraDebug['fetch_error'] = 'Cora: ' . $e->getMessage();
        } catch (RuntimeException $e) {
            $coraDebug['fetch_error'] = $e->getMessage();
        }

        Log::info('Contract charges preview debug', [
            'enrollment_id' => $enrollment->id,
            'tenant_id' => $enrollment->tenant_id,
            'environment' => $environment,
            'cora_fetch_error' => $coraDebug['fetch_error'],
            'boleto_diagnosis_count' => count($coraDebug['boleto_diagnosis']),
        ]);

        return [
            'generated_at' => now()->toISOString(),
            'hint' => 'Use estes dados para entender por que boletos não vinculam à matrícula. '
                . 'CPFs vêm mascarados. Ative CORA_CONTRACT_CHARGES_DEBUG no .env ou use super_admin.',
            'local' => $localDebug,
            'cora' => $coraDebug,
            'preview_payload_echo' => $externalPreview !== null ? [
                'provider_boleto_list' => $externalPreview['provider_boleto_list'] ?? [],
            ] : null,
        ];
    }
}
