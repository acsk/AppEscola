<?php

namespace App\Services\Asaas;

use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\PaymentGatewayCustomer;
use App\Models\Student;
use App\Models\Tenant;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AsaasCustomerSyncService
{
    public function __construct(
        private readonly AsaasHttpClient $http,
    ) {
    }

    public function resolveOrCreateForInvoice(Invoice $invoice, string $environment = 'stage'): string
    {
        $invoice->loadMissing(['tenant', 'student.guardians', 'guardian']);

        $guardian = $invoice->guardian
            ?? $invoice->student?->guardians?->first();

        $tenant = $invoice->tenant;

        if (! $tenant instanceof Tenant) {
            throw new RuntimeException('Tenant da fatura não encontrado.');
        }

        if ($guardian instanceof Guardian) {
            return $this->resolveOrCreateForPayer($tenant, $guardian, $environment);
        }

        $student = $invoice->student;

        if (! $student instanceof Student) {
            throw new RuntimeException('Não foi possível identificar pagador (aluno ou responsável) para criar cliente no Asaas.');
        }

        return $this->resolveOrCreateForPayer($tenant, $student, $environment);
    }

    public function resolveOrCreateForPayer(Tenant $tenant, Student|Guardian $payer, string $environment = 'stage'): string
    {
        $payerType = $payer instanceof Student ? 'student' : 'guardian';
        $existing = PaymentGatewayCustomer::query()
            ->where('tenant_id', $tenant->id)
            ->where('provider', 'asaas')
            ->where('payer_type', $payerType)
            ->where('payer_id', $payer->id)
            ->first();

        if ($existing && trim($existing->external_customer_id) !== '') {
            return $existing->external_customer_id;
        }

        $payload = $this->buildCustomerPayload($payer, $tenant->id);
        $response = $this->http->post($tenant, 'customers', $environment, $payload);

        $customerId = trim((string) ($response['id'] ?? ''));

        if ($customerId === '') {
            throw new RuntimeException('Resposta do Asaas sem ID de cliente.');
        }

        PaymentGatewayCustomer::query()->updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'provider' => 'asaas',
                'payer_type' => $payerType,
                'payer_id' => $payer->id,
            ],
            [
                'external_customer_id' => $customerId,
                'raw_response' => $response,
            ]
        );

        Log::info('Asaas customer created', [
            'tenant_id' => $tenant->id,
            'payer_type' => $payerType,
            'payer_id' => $payer->id,
            'asaas_customer_id' => $customerId,
        ]);

        return $customerId;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCustomerPayload(Student|Guardian $payer, int $tenantId): array
    {
        $document = $this->digitsOnly($payer->document ?? '');
        $email = trim((string) ($payer->email ?? ''));

        if ($document === '') {
            throw new RuntimeException('CPF/CNPJ do pagador é obrigatório para criar cliente no Asaas.');
        }

        $payload = [
            'name' => trim((string) ($payer->name ?? 'Cliente')),
            'cpfCnpj' => $document,
            'externalReference' => sprintf('%s:%d:%d', $payer instanceof Student ? 'student' : 'guardian', $tenantId, $payer->id),
        ];

        if ($email !== '') {
            $payload['email'] = $email;
        }

        if ($payer->phone ?? null) {
            $phone = $this->digitsOnly((string) $payer->phone);
            if (strlen($phone) >= 10) {
                $payload['mobilePhone'] = $phone;
            }
        }

        return $payload;
    }

    private function digitsOnly(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value) ?? '';
    }
}
